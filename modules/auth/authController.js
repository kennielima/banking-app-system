const db = require('../../database/models');
const { authenticate, deauthenticate } = require('../../middlewares/authenticate');
const bcrypt = require("bcryptjs");
const parser = require("ua-parser-js");
const { createResponse, HttpStatusCode, ResponseStatus } = require('../../utils/apiResponses');
const sendOTP = require('../../utils/nodemailer-otp');
const { generateOTP } = require('../../utils/helpers');
const AuthServices = require('./authService');
const verifyUser = require('../../middlewares/verifyUser');
const logger = require('../../utils/logger');
const sanitizer = require("sanitizer");


class Authcontroller {
    static async signup(req, res) {
        const { FirstName, LastName, Email, PhoneNumber, Password } = req.body;
        logger.info(sanitizer.sanitize('Signup request:', req.body));
        try {
            const existingUser = await AuthServices.findExistingUser(Email)
            if (existingUser) {
                logger.warn('User does not exist');

                const response = {
                    message: "User already exists, login instead"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(Password, salt)
            const newUser = await AuthServices.createUser(FirstName, LastName, Email, PhoneNumber, hashedPassword)

            authenticate(newUser.UserId, res);
            logger.info(sanitizer.sanitize(newUser));

            const parseDevice = parser(req.headers["user-agent"]);
            const deviceInfo = JSON.stringify(parseDevice);
            logger.info("Device Info", parseDevice, deviceInfo);

            const response = {
                data: newUser,
                message: "User successfully signed up"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusCreated,
                ResponseStatus.Success,
                response
            )
        }

        catch (error) {
            logger.error('Signup error:', error);
            const response = {
                message: "Failed to authenticate:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async login(req, res) {
        const { Email, Password } = req.body;
        logger.info(sanitizer.sanitize('Login request:', req.body));

        try {
            const OTP = generateOTP();
            const user = await AuthServices.findExistingUser(Email)
            console.log(user)
            if (!user) {
                logger.warn('User does not exist');
                const response = {
                    message: "User doesn't exist"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const validatePassword = bcrypt.compare(Password, user.Password);
            if (!validatePassword) {
                const response = {
                    message: "Invalid Password"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusNotFound,
                    ResponseStatus.Failure,
                    response
                )
            }
            const OTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
            await AuthServices.updateUserDetailswithOTP(OTP, OTPExpiry, Email);
            await sendOTP(OTP, Email);

            const response = {
                data: user,
                message: "OTP has been sent to email"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusCreated,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Login error:', error);
            const response = {
                message: "Failed to initiate login:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async OTPlogin(req, res) {
        const { Email, OTP } = req.body;
        logger.info(sanitizer.sanitize('OTP Login request:', req.body));
        try {
            const user = await AuthServices.findUserWithOTP(OTP, Email)
            let hasAccessToken = false;

            if (!user) {
                logger.warn('Invalid OTP');
                const response = {
                    message: "Invalid OTP"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            if (!user.accessToken) {
                logger.warn("You can't login on multiple devices");
                const response = {
                    message: "You can't login on multiple devices"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const accessToken = authenticate(user.UserId, res);

            console.log(accessToken);
            user.accessToken = accessToken;

            await AuthServices.updateUserDetailswithOTP(null, null, Email);

            const parseDevice = parser(req.headers["user-agent"]);
            const deviceInfo = JSON.stringify(parseDevice);
            logger.info(sanitizer.sanitize("Device Info", parseDevice, deviceInfo));
            hasAccessToken = true;

            const response = {
                data: {
                    user,
                    hasAccessToken
                },
                message: "User successfully logged in"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusCreated,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('OTP error:', error);

            const response = {
                message: "Failed to verify OTP:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async forgotPassword(req, res) {
        try {
            const { Email } = req.body;
            let response = {
                data: { isOTPSent: false },
            }
            const user = await AuthServices.findExistingUser(Email);
            if (!user) {
                logger.warn('User does not exist');
                const response = {
                    message: "User doesn't exist"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const OTP = generateOTP();
            const OTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
            await AuthServices.updateUserDetailswithOTP(OTP, OTPExpiry, Email);
            await sendOTP(OTP, Email);

            response = {
                data: { isOTPSent: true },
                message: "Reset Password OTP has been sent to email"
            }

            return createResponse(
                res,
                HttpStatusCode.StatusCreated,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Failed to send reset paset OTP:', error);
            const response = {
                message: "Failed to send reset password OTP:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async enterPasswordOTP(req, res) {
        const { Email, OTP } = req.body;
        logger.info(sanitizer.sanitize('Enter OTP request:', req.body));
        try {
            let response = {
                data: { isPasswordOTPEntered: false },
            }
            const user = await AuthServices.findUserWithOTP(OTP, Email)
            if (!user) {
                console.log("Invalid OTP")
                response = {
                    message: "Invalid OTP"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            response = {
                data: { isPasswordOTPEntered: true },
                message: "You can now reset your password"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusOk,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Failed to enter OTP:', error);
            const response = {
                message: "Failed to enter OTP:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async resetPassword(req, res) {
        const { Email, OTP, newPassword } = req.body;
        try {
            const user = await AuthServices.findExistingUser(Email, OTP);
            if (!user) {
                logger.warn("Can't verify OTP or email")
                response = {
                    message: "Can't verify OTP or email"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt)

            await AuthServices.updateUserPassword(Email, hashedPassword);
            const response = {
                data: { newPassword: hashedPassword },
                message: "Your password has been reset"
            }

            return createResponse(
                res,
                HttpStatusCode.StatusCreated,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Failed to reset password:', error);
            const response = {
                message: "Failed to reset password:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async refreshToken(req, res) {
        try {
            logger.info(sanitizer.sanitize("req cookies:", req.headers.cookie, req.cookies));
            let response = {
                data: { isAccessTokenSent: false },
            }
            const refreshToken = req.cookies.refreshtoken;

            if (!refreshToken) {
                response = {
                    message: "No refresh token provided"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }

            const user = verifyUser(req, res);
            if (!user) return;
            authenticate(user.UserId, res);

            response = {
                data: { isAccessTokenSent: true },
                message: "Token refreshed successfully"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusOk,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Refresh token error:', error);
            const response = {
                message: "Failed to refresh token:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static logout(res) {
        try {
            deauthenticate(res)
            const response = {
                data: null,
                message: "User successfully signed out"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusOk,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Signout error:', error);
            const response = {
                message: "Failed to log out:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }

    static async blockUser (req, res) {
        try {
            const { Email, Password } = req.body;
            const user = await AuthServices.findExistingUser(Email);
            if (!user) {
                logger.warn('User does not exist');
                const response = {
                    message: "User doesn't exist"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const validatePassword = bcrypt.compare(Password, user.Password);
            if (!validatePassword) {
                const response = {
                    message: "Invalid Password"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusNotFound,
                    ResponseStatus.Failure,
                    response
                )
            }
            user.isBlocked = true;
            await AuthServices.blockUser(Email);
            const response = {
                data: user,
                message: "User successfully blocked"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusOk,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Failed to block user:', error);
            const response = {
                message: "Failed to block user:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }
    static async unblockUser (req, res) {
        try {
            const { Email, Password } = req.body;

            const user = await AuthServices.findExistingUser(Email);
            if (!user) {
                logger.warn('User does not exist');
                const response = {
                    message: "User doesn't exist"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusUnauthorized,
                    ResponseStatus.Failure,
                    response
                )
            }
            const validatePassword = bcrypt.compare(Password, user.Password);
            if (!validatePassword) {
                const response = {
                    message: "Invalid Password"
                }
                return createResponse(
                    res,
                    HttpStatusCode.StatusNotFound,
                    ResponseStatus.Failure,
                    response
                )
            }
            user.isBlocked = false;
            await AuthServices.blockUser(Email);
            const response = {
                data: user,
                message: "User successfully unblocked"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusOk,
                ResponseStatus.Success,
                response
            )
        }
        catch (error) {
            logger.error('Failed to block user:', error);
            const response = {
                message: "Failed to block user:" + error
            }
            return createResponse(
                res,
                HttpStatusCode.StatusBadRequest,
                ResponseStatus.Failure,
                response
            )
        }
    }
}

module.exports = Authcontroller;