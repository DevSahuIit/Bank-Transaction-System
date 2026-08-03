const mongoose = require("mongoose");

const outboxSchema = new mongoose.Schema({
    aggregateType: { type: String, required: true }, // e.g. "transaction"
    aggregateId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eventType: { type: String, required: true }, // e.g. "TRANSACTION_COMPLETED"
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    published: { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model("outbox", outboxSchema);