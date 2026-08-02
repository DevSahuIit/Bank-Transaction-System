const express = require("express");
const router = express.Router();

// 1. Destructure the exact middleware function from the exported object
const { authMiddleware } = require("../middleware/auth.middleware");

// 2. Destructure the exact controller functions from the exported object
const { createAccount } = require("../controllers/account.controller");

/**
 * - POST /api/accounts/
 * Create a new account
 * - Protected route
 */
// 3. Call the functions directly by their exact names
router.post("/", authMiddleware, createAccount);

module.exports = router;
