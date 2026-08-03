const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: [true, "Account must be associated with a user profile"],
            index: true // Speeds up user lookup queries via B-Tree optimization
        },
        status: {
            type: String,
            enum: {
                values: ["ACTIVE", "FROZEN", "CLOSED"],
                message: "Status can only be ACTIVE, FROZEN, or CLOSED"
            },
            default: "ACTIVE"
        },
        currency: {
            type: String,
            required: [true, "Currency designation is required"],
            default: "INR"
        }
    },
    {
        timestamps: true // Automatically injects and manages createdAt and updatedAt fields
    }
);

// Compound index to drastically optimize transaction search loops tracking status filters
accountSchema.index({ user: 1, status: 1 });

/**
 * 🛠️ CUSTOM INSTANCE METHOD: getBalance() [02:22:26, 02:23:41]
 * Calculates the real-time balance by aggregating the append-only ledger entries.
 * Note: Uses a standard function declaration so 'this' correctly references the account instance.
 */
accountSchema.methods.getBalance = async function () {
    const redisClient = require("../config/redis");
    const cacheKey = `balance:account:${this._id}`;

    const cached = await redisClient.get(cacheKey);
    if (cached !== null) {
        return Number(cached);
    }

    const ledgerModel = mongoose.model("ledger");
    const result = await ledgerModel.aggregate([
        { $match: { account: this._id } },
        { $group: { _id: "$type", totalAmount: { $sum: "$amount" } } }
    ]);

    let creditTotal = 0, debitTotal = 0;
    result.forEach((item) => {
        if (item._id === "CREDIT") creditTotal = item.totalAmount;
        else if (item._id === "DEBIT") debitTotal = item.totalAmount;
    });

    const balance = creditTotal - debitTotal;
    await redisClient.set(cacheKey, balance, "EX", 30); // short TTL as a safety net
    return balance;
};

const accountModel = mongoose.model("account", accountSchema);

module.exports = accountModel;
