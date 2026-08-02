const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: [true, "user required"],
        index: true // Uses a B-Tree data structure to speed up lookups
    },
    status: {
        type: String,
        enum: {
            values: ["ACTIVE", "FROZEN", "CLOSED"],
            message: "Status can be either ACTIVE, FROZEN, CLOSED"
        },   
        default: "ACTIVE"
    },
    currency: {
        type: String,
        required: [true, "Currency is required"],
        default: "INR"
    }
}, {
    timestamps: true
});

// Compound index to optimize queries searching by both user and account status
accountSchema.index({ user: 1, status: 1 });

const accountModel = mongoose.model("account", accountSchema);
module.exports = accountModel;
