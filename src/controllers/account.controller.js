const accountModel = require("../models/account.model");
const userModel = require("../models/user.model"); // Added to save contacts

async function createAccountController(req, res) {
    const user = req.user;
    const account = await accountModel.create({
        user: user._id
    })
    res.status(201).json({ account })
}

async function getUserAccountsController(req, res) {
    const accounts = await accountModel.find({ user: req.user._id });
    res.status(200).json({ accounts })
}

async function getAccountBalanceController(req, res) {
    const { accountId } = req.params;
    const account = await accountModel.findOne({
        _id: accountId,
        user: req.user._id
    })

    if (!account) {
        return res.status(404).json({ message: "Account not found" })
    }

    const balance = await account.getBalance();
    res.status(200).json({
        accountId: account._id,
        balance: balance
    })
}

// --- NEW FEATURES ---

async function addContact(req, res) {
    const { name, accountId } = req.body;

    if (!name || !accountId) {
        return res.status(400).json({ message: "Name and accountId are required" });
    }

    // Verify the account they are trying to save actually exists
    const accountExists = await accountModel.findById(accountId);
    if (!accountExists) {
        return res.status(404).json({ message: "That Account ID does not exist" });
    }

    const user = await userModel.findById(req.user._id);

    // Prevent saving the exact same account ID twice
    const alreadySaved = user.savedContacts.find(c => c.accountId.toString() === accountId);
    if (alreadySaved) {
        return res.status(400).json({ message: "This contact is already in your friend list" });
    }

    user.savedContacts.push({ name, accountId });
    await user.save();

    res.status(200).json({ message: "Friend added!", contacts: user.savedContacts });
}

async function getContacts(req, res) {
    const user = await userModel.findById(req.user._id);
    res.status(200).json({ contacts: user.savedContacts });
}

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountBalanceController,
    addContact,
    getContacts
}