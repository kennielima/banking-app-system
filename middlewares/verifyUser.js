const jwt = require("jsonwebtoken")
const AuthServices = require("../modules/auth/authService");
const { createResponse, HttpStatusCode, ResponseStatus } = require('../utils/apiResponses');
const { ACCESS_JWT_SECRET, REFRESH_JWT_SECRET } = require("../utils/config");

module.exports = async (req, res, next) => {
    try {
        const token = req.cookies.accesstoken || req.cookies.refreshtoken;
        const JWTSECRET = token === req.cookies.accesstoken
            ? ACCESS_JWT_SECRET
            : REFRESH_JWT_SECRET;

        if (!token) {
            const response = {
                message: "User unauthorized to make request"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusUnauthorized,
                ResponseStatus.Failure,
                response
            )
        }
        const decodedtoken = jwt.verify(token, JWTSECRET);

        if (!decodedtoken) {
            const response = {
                message: "User unauthorized to make request"
            }

            return createResponse(
                res,
                HttpStatusCode.StatusUnauthorized,
                ResponseStatus.Failure,
                response
            )
        }  
        const user = await AuthServices.findUserByPk(decodedtoken.Id);

        const userToken = user.AccessToken.accessToken || user.AccessToken.refreshToken
        if (!user || (userToken !== token)) {
            const response = {
                message: "Failed to authenticate user"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusNotFound,
                ResponseStatus.Failure,
                response
            )
        }
        if (user.isBlocked) {
            const response = {
                message: "User is blocked"
            }
            return createResponse(
                res,
                HttpStatusCode.StatusUnauthorized,
                ResponseStatus.Failure,
                response
            )
        }
        req.user = user;
        next();
    }
    catch (error) {
        const response = {
            message: "Failed to verify user:" + error
        }
        return createResponse(
            res,
            HttpStatusCode.StatusBadRequest,
            ResponseStatus.Failure,
            response
        )
    }
}