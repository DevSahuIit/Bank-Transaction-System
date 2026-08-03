const { RateLimiterRedis } = require("rate-limiter-flexible");
const redisClient = require("../config/redis");

// General API limiter: 100 requests / 60s per IP
const apiLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "rl:api",
    points: 100,
    duration: 60,
});

// Strict limiter for auth endpoints: 5 attempts / 60s per IP (brute-force protection)
const authLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "rl:auth",
    points: 5,
    duration: 60,
    blockDuration: 300, // lock out for 5 min after limit is hit
});

// Per-account transaction limiter: 10 transfers / 60s per account (fraud/abuse control)
const transactionLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "rl:txn",
    points: 10,
    duration: 60,
});

function makeMiddleware(limiter, keyFn) {
    return async (req, res, next) => {
        try {
            await limiter.consume(keyFn(req));
            next();
        } catch (rejRes) {
            res.status(429).json({
                message: "Too many requests, please try again later",
                retryAfterSeconds: Math.ceil(rejRes.msBeforeNext / 1000),
            });
        }
    };
}

module.exports = {
    apiRateLimiter: makeMiddleware(apiLimiter, (req) => req.ip),
    authRateLimiter: makeMiddleware(authLimiter, (req) => req.ip),
    transactionRateLimiter: makeMiddleware(transactionLimiter, (req) => req.user._id.toString()),
};