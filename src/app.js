const express = require("express") 
// calling express js
const cookieParser = require("cookie-parser")
const path = require("path")

// Importing the rate limiters
const { apiRateLimiter, authRateLimiter } = require("./middleware/rateLimiter.middleware")

const app = express()
// isme hum server k instence ko create karenge 
// par isse server nhi start karege for that server.js

app.use(express.json()) // request.body k andar ka data padhne k liyeh
app.use(cookieParser())

// global limiter, apply before routers
app.use(apiRateLimiter) 

app.use(express.static(path.join(__dirname, "..", "public")))

const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")

// jo jo /api/auth yeah lekar aayega usko authRouter pe bhej denge 
// extra strict limiter on auth route to prevent brute-force attacks
app.use("/api/auth", authRateLimiter, authRouter) 
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRoutes)

module.exports = app // aloows to export the app