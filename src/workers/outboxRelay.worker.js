require("dotenv").config()
const connectToDB = require("../config/db")
const kafka = require("../config/kafka")
const outboxModel = require("../models/outbox.model")

const producer = kafka.producer()

async function relayLoop() {
    await connectToDB()
    await producer.connect()
    console.log("Outbox relay started")

    setInterval(async () => {
        const pending = await outboxModel.find({ published: false }).limit(50)
        for (const event of pending) {
            try {
                await producer.send({
                    topic: "transaction-events",
                    messages: [{
                        key: event.aggregateId.toString(),
                        value: JSON.stringify({
                            eventType: event.eventType,
                            payload: event.payload,
                            createdAt: event.createdAt,
                        }),
                    }],
                })
                event.published = true
                await event.save()
            } catch (err) {
                console.error("Failed to relay outbox event", event._id, err.message)
                // leave published=false, it'll retry next poll
            }
        }
    }, 1000) // poll every 1s
}

relayLoop()