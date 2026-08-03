const Redlock = require("redlock").default || require("redlock");
const redisClient = require("../config/redis");

const redlock = new Redlock([redisClient], {
    retryCount: 5,
    retryDelay: 200, // ms between retries
});

async function withAccountLock(accountId, fn) {
    const resource = `lock:account:${accountId}`;
    const lock = await redlock.acquire([resource], 10000); // 10s TTL
    try {
        return await fn();
    } finally {
        await lock.release();
    }
}

module.exports = { withAccountLock };