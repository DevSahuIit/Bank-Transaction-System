const express = require("express")

const router = express.Router()
const authMiddleware = require("../middleware/auth.middleware")
const  accountController  = require("../controllers/account.controller")

/**
 * -POST /api/accounts/
 * create a new account
 * -protected route
 * 
 */

router.post("/",authMiddleware.authMiddleware,accountController.createAccountController)

module.exports=router

