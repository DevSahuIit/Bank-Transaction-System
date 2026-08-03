require("dotenv").config();
const connectToDB = require("../config/db");
const kafka = require("../config/kafka");
const AuditLog = require("../models/audit.model"); // Assuming a Mongoose model exists

const consumer = kafka.consumer({ groupId: "audit-log-group" });

async function run() {
    await connectToDB();
    await consumer.connect();
    await consumer.subscribe({ topic: "transaction-events", fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            const event = JSON.parse(message.value.toString());
            
            try {
                // Write an immutable audit record for ALL transaction events
                await AuditLog.create({
                    eventType: event.eventType,
                    payload: event.payload,
                    timestamp: new Date(),
                });
                
                console.log(`[Audit] Successfully recorded event: ${event.eventType}`);
            } catch (err) {
                console.error("[Audit] Failed to write audit log:", err.message);
                throw err; // Rethrow to retry writing to the DB
            }
        },
    });
}

run().catch((err) => { 
    console.error(err); 
    process.exit(1); 
});