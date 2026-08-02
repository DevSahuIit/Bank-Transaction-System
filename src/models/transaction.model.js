const mongoose = require("mongoose")

const transactionSchema=new mongoose.Schema({
    fromAccount:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"account",
        required:[true,"Transcation be associated with from it"],
        index:true,
    },
    toAccount:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"account",
        required:[true,"Transcation be associated with from it"],
        index:true,
    },
    status:{
        type:String,
        enum:{
            values:["PENDING","COMPLETED","FAILED","REVERSED"],
            message:"Status id either of them"
        },
        default:"PENDING"
    },
    amount:{
        type:Number,
        required:[true,"Amount is reauired for transaction"],
        min:[0,"transaction amount is negative"],
    },
    idempotencyKey:{
        type:String,
        required:[true,"Idempotency Key is required for creating a transaction"],
        index:true,
        unique:true,
    }

},{
    timestamps:true
})

const transactionModel = mongoose.model("transaction",transactionSchema)
module.exports = transactionModel