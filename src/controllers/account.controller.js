const accountModel = require("../models/account.model");

/**
 * 1️⃣ CREATE ACCOUNT [01:32:50, 01:40:06]
 * POST /api/accounts
 * Protected Route (Requires authMiddleware)
 */
async function createAccount(req, res) {
    try {
        // Extract user data attached to request by authMiddleware [01:40:52, 01:41:02]
        const userId = req.user._id;

        // Create a new bank account linked to the user id [01:41:02, 01:41:11]
        // Status and currency fall back to schema defaults ("active" & "INR") [01:40:26, 01:43:34]
        const account = await accountModel.create({
            user: userId
        });

        // Return 201 Created status code along with account JSON data [01:41:19, 01:44:40]
        return res.status(201).json(account);

    } catch (err) {
        return res.status(500).json({
            message: "Failed to create bank account record profile",
            error: err.message
        });
    }
}

/**
 * 2️⃣ GET USER ACCOUNTS [03:15:40]
 * GET /api/accounts
 * Protected Route (Requires authMiddleware)
 */
async function getUserAccounts(req, res) {
    try {
        // Pull active user sequence profile payload [03:15:48]
        const userId = req.user._id;

        // Query database for all profiles matching the user index key context [03:15:48, 03:15:57]
        const accounts = await accountModel.find({ user: userId });

        // Forward matching listings to user interface context [03:16:07]
        return res.status(200).json(accounts);

    } catch (err) {
        return res.status(500).json({
            message: "Failed to extract matching account records listings",
            error: err.message
        });
    }
}

/**
 * 3️⃣ GET ACCOUNT BALANCE [03:20:53]
 * GET /api/accounts/balance/:accountId
 * Protected Route (Requires authMiddleware)
 */
async function getAccountBalance(req, res) {
    try {
        // Pull structural identity validation parameters [03:21:00]
        const { accountId } = req.params;
        const userId = req.user._id;

        // Safety verification check: ensures requested account belongs to the active user [03:21:11, 03:21:43]
        const account = await accountModel.findOne({
            _id: accountId,
            user: userId
        });

        if (!account) {
            return res.status(404).json({ message: "Account profile records missing or access forbidden" });
        }

        // Invoke custom schema prototype method to resolve historical dynamic sum aggregation [02:22:26, 03:22:26]
        const balance = await account.getBalance();

        // Deliver clean parameter mapping values package [03:22:32]
        return res.status(200).json({
            accountId: account._id,
            balance: balance
        });

    } catch (err) {
        return res.status(500).json({
            message: "Internal tracking summary calculation processing breakdown",
            error: err.message
        });
    }
}

module.exports = {
    createAccount,
    getUserAccounts,
    getAccountBalance
};
