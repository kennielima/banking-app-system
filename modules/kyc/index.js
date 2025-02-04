const handleSqlInjection = require("../../middlewares/handleSqlInjection");
const verifyUser = require("../../middlewares/verifyUser");
const KYCController = require("./kycController");
const KycValidator = require("./kycValidator");
const router = require("express").Router()

router.post('/',
    verifyUser,
    handleSqlInjection,
    KycValidator.validateUserKycForm(),
    KycValidator.handleValidationErrors,
    KYCController.kyc
)
router.get('/callback',
    verifyUser,
    KYCController.callback
)


module.exports = router;
