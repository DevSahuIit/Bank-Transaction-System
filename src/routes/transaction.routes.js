const express = require("express");
const router = express.Router();

// Import the transaction controller functions
const { 
    createInitialFundsTransaction,
    getMyTransactions,
    createTransaction, 
    requestFunds,
    getPeerTransactions // 👈 Added this
} = require("../controllers/transaction.controller");

const { 
    authMiddleware, 
    authSystemUserMiddleware 
} = require("../middleware/auth.middleware");

router.get("/", authMiddleware, getMyTransactions);
router.post("/create", authMiddleware, createTransaction);
router.post("/system/initial-funds", authSystemUserMiddleware, createInitialFundsTransaction);
router.post("/request-funds", authMiddleware, requestFunds); 

// --- NEW ROUTE ---
router.get("/peer/:peerId", authMiddleware, getPeerTransactions); 

module.exports = router;