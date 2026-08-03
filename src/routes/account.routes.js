const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const accountController = require("../controllers/account.controller")

const router = express.Router()

router.post("/", authMiddleware.authMiddleware, accountController.createAccountController)
router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController)
router.get("/balance/:accountId", authMiddleware.authMiddleware, accountController.getAccountBalanceController)

// --- NEW ROUTES ---
router.post("/contacts/add", authMiddleware.authMiddleware, accountController.addContact)
router.get("/contacts", authMiddleware.authMiddleware, accountController.getContacts)

module.exports = router