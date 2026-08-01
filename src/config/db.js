const mongoose = require("mongoose")

function connectToDB(){
    mongoose.connect(process.env.MONGO_URI)
    .then(()=>{
        console.log("server is cponnected to db");
    })
    .catch(err =>{
        console.log("Unable to connect to the db");
        process.exit(1);
    })
}

module.exports = connectToDB