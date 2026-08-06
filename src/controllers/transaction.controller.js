const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")
const { MAX_FUNDS_REQUEST_AMOUNT, MAX_TOTAL_FUNDS_PER_USER } = require("../config/constants");
const userModel = require("../models/user.model");
/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
     * 1. Validate request
     * 2. Validate idempotency key
     * 3. Check account status
     * 4. Acquire Lock & Derive sender balance from ledger
     * 5. Create transaction (PENDING)
     * 6. Create DEBIT ledger entry
     * 7. Create CREDIT ledger entry
     * 8. Mark transaction COMPLETED
     * 9. Commit MongoDB session
     * 10. Send email notification
 */

async function createTransaction(req, res) {

    /**
     * 1. Validate request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!fromUserAccount || !toUserAccount) {
        await redisClient.set(idempotencyRedisKey, "FAILED", "EX", 86400) // Clear processing state
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    /**
     * 2. Validate idempotency key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })

    if (isTransactionAlreadyExists) {
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            })

        }

        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
            })
        }

        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            })
        }

        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            })
        }
    }

    /**
     * 3. Check account status
     */

    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        await redisClient.set(idempotencyRedisKey, "FAILED", "EX", 86400) // Clear processing state
        return res.status(400).json({
            message: "Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }

    let transaction;
    try {


        /**
         * 5. Create transaction (PENDING)
         */
        const session = await mongoose.startSession()
        session.startTransaction()

            const txn = (await transactionModel.create([{ 
                fromAccount, 
                toAccount, 
                amount, 
                idempotencyKey, 
                status: "PENDING" 
            }], { session }))[0]

        const debitLedgerEntry = await ledgerModel.create([ {
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], { session })

        await (() => {
            return new Promise((resolve) => setTimeout(resolve, 15 * 1000));
        })()

        const creditLedgerEntry = await ledgerModel.create([ {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], { session })

        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { session }
        )


        await session.commitTransaction()
        session.endSession()
    } catch (error) {

        return res.status(400).json({
            message: "Transaction is Pending due to some issue, please retry after sometime",
        })

    }
    /**
     * 10. Send email notification
     */
    await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount)

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })

}

async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }


    const session = await mongoose.startSession()
    session.startTransaction()

    const transaction = new transactionModel({
        fromAccount: fromUserAccount._id,
        toAccount,
        amount,
        idempotencyKey,
        status: "PENDING"
    })

    const debitLedgerEntry = await ledgerModel.create([ {
        account: fromUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type: "DEBIT"
    } ], { session })

    const creditLedgerEntry = await ledgerModel.create([ {
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT"
    } ], { session })

    transaction.status = "COMPLETED"
    await transaction.save({ session })

    await session.commitTransaction()
    session.endSession()

    return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction: transaction
    })


}

async function getMyTransactions(req, res) {
    const accounts = await accountModel.find({ user: req.user._id }).select("_id")
    const accountIds = accounts.map(a => a._id)

    const transactions = await transactionModel.find({
        $or: [
            { fromAccount: { $in: accountIds } },
            { toAccount: { $in: accountIds } }
        ]
    }).sort({ createdAt: -1 }).limit(50)

    res.status(200).json({ transactions })
}

/**
 * Add this to the TOP of src/controllers/transaction.controller.js,
 * alongside the other requires that are already there:
 *
 *   const userModel = require("../models/user.model")
 *   const { MAX_FUNDS_REQUEST_AMOUNT, MAX_TOTAL_FUNDS_PER_USER } = require("../config/constants")
 *
 * Then paste this whole function in, anywhere above module.exports.
 * Finally add requestFunds to the module.exports object at the bottom.
 */

async function requestFunds(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    if (amount <= 0 || amount > MAX_FUNDS_REQUEST_AMOUNT) {
        return res.status(400).json({
            message: `You can request between 1 and ${MAX_FUNDS_REQUEST_AMOUNT} per request`
        })
    }

    // the account being funded must actually belong to whoever is asking —
    // otherwise anyone could pass a stranger's accountId and fund it instead
    const toUserAccount = await accountModel.findOne({ _id: toAccount, user: req.user._id })

    if (!toUserAccount) {
        return res.status(400).json({
            message: "This account does not belong to you"
        })
    }

    if (toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Account must be ACTIVE to receive funds"
        })
    }

    const isTransactionAlreadyExists = await transactionModel.findOne({ idempotencyKey })
    if (isTransactionAlreadyExists) {
        return res.status(200).json({
            message: "Request already processed",
            transaction: isTransactionAlreadyExists
        })
    }

    const systemUser = await userModel.findOne({ systemUser: true }).select("+systemUser")
    if (!systemUser) {
        return res.status(500).json({ message: "Funding is not available right now, contact support" })
    }

    const systemAccount = await accountModel.findOne({ user: systemUser._id, status: "ACTIVE" })
    if (!systemAccount) {
        return res.status(500).json({ message: "Funding is not available right now, contact support" })
    }

    // lifetime cap: sum every CREDIT this user has ever received specifically
    // FROM the system account, across all of their own accounts
    const userAccounts = await accountModel.find({ user: req.user._id }).select("_id")
    const userAccountIds = userAccounts.map(a => a._id)

    const alreadyReceived = await transactionModel.aggregate([
        {
            $match: {
                fromAccount: systemAccount._id,
                toAccount: { $in: userAccountIds },
                status: "COMPLETED"
            }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ])

    const totalReceived = alreadyReceived[ 0 ]?.total || 0

    if (totalReceived + Number(amount) > MAX_TOTAL_FUNDS_PER_USER) {
        return res.status(400).json({
            message: `You've reached your funding limit of ${MAX_TOTAL_FUNDS_PER_USER}. You've received ${totalReceived} so far.`
        })
    }

    const session = await mongoose.startSession()
    try {
        session.startTransaction()

        const transaction = (await transactionModel.create([ {
            fromAccount: systemAccount._id,
            toAccount: toUserAccount._id,
            amount,
            idempotencyKey,
            status: "PENDING"
        } ], { session }))[ 0 ]

        await ledgerModel.create([ {
            account: systemAccount._id,
            amount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], { session })

        await ledgerModel.create([ {
            account: toUserAccount._id,
            amount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], { session })

        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { session }
        )

        await session.commitTransaction()
        session.endSession()

        return res.status(201).json({
            message: "Funds added to your account",
            transaction
        })
    } catch (error) {
        // unlike the existing createTransaction function, this one CAN
        // clean up after itself, because session is in scope in the catch
        await session.abortTransaction()
        session.endSession()
        return res.status(500).json({
            message: "Could not process your funding request, please retry"
        })
    }
}

// Paste this right above module.exports
async function getPeerTransactions(req, res) {
    const { peerId } = req.params;

    // 1. Get all of my account IDs
    const accounts = await accountModel.find({ user: req.user._id }).select("_id");
    const accountIds = accounts.map(a => a._id);

    // 2. Find transactions where I sent to them, OR they sent to me
    const transactions = await transactionModel.find({
        $or: [
            { fromAccount: { $in: accountIds }, toAccount: peerId },
            { toAccount: { $in: accountIds }, fromAccount: peerId }
        ]
    }).sort({ createdAt: -1 }).limit(50);

    res.status(200).json({ transactions });
}

// Update your export block to include getPeerTransactions
module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getMyTransactions,
    requestFunds,
    getPeerTransactions
}