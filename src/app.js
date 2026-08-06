const express = require("express") 
// calling express js
const cookieParser = require("cookie-parser")

const path = require("path")
const app= express()
// isme hum server k instence ko create karenge 
// par isse server nhi start karege for that server.js


app.use(express.json()) // request.body k andar ka data padhne k liyeh
app.use(cookieParser())

app.use(express.static(path.join(__dirname, "..", "public")))



const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")


app.use("/api/auth", authRouter) //jo jo /api/auth yeah lekar aayega usko authRouter pe bhej denge 
app.use("/api/accounts",accountRouter)
app.use("/api/transactions",transactionRoutes)


module.exports = app //aloows to export the app