require("dotenv").config()
const app = require("./src/app")
// require purana hai is language me 
// import eport nya hai // kyunki comany purani hotiu hai toh woh require use karti hai toh hum isse hi use karenge 
const connectToDB = require("./src/config/db")


connectToDB() //calling the function from the url

app.listen(3000, ()=>{
    console.log("Server is running on port 3000")
}) // for running the server
// we will run it using npodemon  
