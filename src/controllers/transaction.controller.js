const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")
const userModel = require("../models/user.model")
const { MAX_FUNDS_REQUEST_AMOUNT, MAX_TOTAL_FUNDS_PER_USER } = require("../config/constants")
const redisClient = require("../config/redis") // 👈 Added Redis client

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
     * 1. Validate request
     * 2. Validate idempotency key (Redis fast-path)
     * 3. Check account status
     * 4. Derive sender balance from ledger
     * 5. Create transaction (PENDING)
     * 6. Create DEBIT ledger entry
     * 7. Create CREDIT ledger entry
     * 8. Mark transaction COMPLETED
     * 9. Commit MongoDB session & update Redis (and clear balance cache)
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

    /**
     * 2. Validate idempotency key via Redis (Fast path)
     */
    const idempotencyRedisKey = `idem:txn:${idempotencyKey}`
    // SET key only if not exists, TTL 24h. O(1) in Redis vs a Mongo index scan.
    const isNew = await redisClient.set(idempotencyRedisKey, "PROCESSING", "EX", 86400, "NX")

    if (!isNew) {
        // Already seen — fall back to Mongo to return the real status/result
        const existing = await transactionModel.findOne({ idempotencyKey })
        if (existing) {
            if (existing.status === "COMPLETED") {
                return res.status(200).json({ message: "Transaction already processed", transaction: existing })
            }
            if (existing.status === "PENDING") {
                return res.status(200).json({ message: "Transaction is still processing" })
            }
            return res.status(500).json({ message: `Transaction is ${existing.status}, please retry` })
        }
        // Redis key exists but Mongo write hasn't landed yet (race between two near-simultaneous
        // retries) — treat as still processing rather than double-executing
        return res.status(200).json({ message: "Transaction is still processing" })
    }

    // Now that idempotency is checked, fetch accounts
    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    /**
     * 3. Check account status
     */
    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }

    /**
     * 4. Derive sender balance from ledger
     */
    const balance = await fromUserAccount.getBalance()

    if (balance < amount) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`
        })
    }

    let transaction;
    try {
        /**
         * 5. Create transaction (PENDING)
         */
        const session = await mongoose.startSession()
        session.startTransaction()

        transaction = (await transactionModel.create([ {
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        } ], { session }))[ 0 ]

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

        // 👈 Update Redis key so future retries short-circuit correctly
        await redisClient.set(idempotencyRedisKey, "COMPLETED", "EX", 86400)

        // 👈 Invalidate cached balances for both accounts since a transaction occurred
        await redisClient.del(`balance:account:${fromAccount}`);
        await redisClient.del(`balance:account:${toAccount}`);

    } catch (error) {
        // 👈 If it fails, update Redis key so user can retry
        await redisClient.set(idempotencyRedisKey, "FAILED", "EX", 86400)
        
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

    // 👈 Invalidate cached balances for both accounts
    await redisClient.del(`balance:account:${fromUserAccount._id}`);
    await redisClient.del(`balance:account:${toAccount}`);

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

    // the account being funded must actually belong to whoever is asking
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

        // 👈 Invalidate cached balances for both accounts
        await redisClient.del(`balance:account:${systemAccount._id}`);
        await redisClient.del(`balance:account:${toUserAccount._id}`);

        return res.status(201).json({
            message: "Funds added to your account",
            transaction
        })
    } catch (error) {
        await session.abortTransaction()
        session.endSession()
        return res.status(500).json({
            message: "Could not process your funding request, please retry"
        })
    }
}

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

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getMyTransactions,
    requestFunds,
    getPeerTransactions
}