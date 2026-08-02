const express = require("express");
const router = express.Router();

// Import the transaction controller functions exactly as named
const { 
    createTransaction, 
    createInitialFundsTransaction 
} = require("../controllers/transaction.controller");

// Import your auth middleware guards
const { 
    authMiddleware, 
    authSystemUserMiddleware 
} = require("../middleware/auth.middleware");

/**
 * Route: Standard Peer-to-Peer Customer Transfer
 * Protected by regular customer authentication
 */
router.post("/create", authMiddleware, createTransaction);

/**
 * Route: System Initial Cash Payload Injection
 * Protected by elite system/admin user authentication
 */
router.post("/system/initial-funds", authSystemUserMiddleware, createInitialFundsTransaction);

module.exports = router;
