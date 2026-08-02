const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = mongoose.Schema({
    email:{
        type:String,
        required:[true,"Email is required for creating a user"],
        trim:true,
        lowercase:true,
        match : [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ , "Invalid email address"], // checks the format of the email  this isi the rege
        unique: [true, "Emwail already exist"]
    },

    name :{
        type:String,
        required:[true,"Name is required for creating a user"],
    },
    password: {
        type:String,
        required:[true,"Password is required for creating a user"],
        minLength: [6,"password should be contain more than 6 chars"],
        select : false
    },


},{
    timestamps:true, // gets kab user ka data edit hua
})

// pre yani peghle kya karega  // hum neeche user data hash karenge 
userSchema.pre("save", async function(){

    if (!this.isModified("password")){ //agar password modify nhi hua hai toh return it else convert it to a hash 
        return 
    }

    const hash = await bcrypt.hash(this.password , 10)
    this.password = hash
    return 
})

userSchema.methods.comparePassword = async function(password) {
    console.log(password,this.password)
    return await  bcrypt.compare(password,this.password)
}

const userModel = mongoose.model("user" , userSchema)
module.exports = userModel