require("dotenv").config()
const connectToDB = require("../config/db")
const kafka = require("../config/kafka")
const emailService = require("../services/email.service")

const consumer = kafka.consumer({ groupId: "email-notification-group" })

async function run() {
    await connectToDB()
    await consumer.connect()
    await consumer.subscribe({ topic: "transaction-events", fromBeginning: false })

    await consumer.run({
        eachMessage: async ({ message }) => {
            const event = JSON.parse(message.value.toString())
            if (event.eventType !== "TRANSACTION_COMPLETED") return

            const { userEmail, userName, amount, toAccount } = event.payload
            try {
                await emailService.sendTransactionEmail(userEmail, userName, amount, toAccount)
            } catch (err) {
                console.error("Email send failed, will retry via Kafka redelivery:", err.message)
                throw err // rethrow so KafkaJS doesn't auto-commit the offset — forces reprocessing
            }
        },
    })
}

run().catch((err) => { console.error(err); process.exit(1) })