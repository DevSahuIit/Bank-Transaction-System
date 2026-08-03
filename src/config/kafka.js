const { Kafka, logLevel } = require("kafkajs");

const kafka = new Kafka({
    clientId: "bank-transaction-system",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
    logLevel: logLevel.ERROR,
    retry: { initialRetryTime: 300, retries: 8 },
});

module.exports = kafka;