const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")



async function authMiddleware(req,res,next){ // the middleware
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]

    if (!token){
        return res.status(401).json({
            message:"Unauthorized acess , token is missing"
        })
    }

    try{
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const user = await userModel.finById(decoded.userId)
        req.user = user
        return next()
    }catch(err){
         return res.status(401).json({
            message:"Unauthorized acess , token is missing"
        })
    }
}

module.exports ={
    authMiddleware
}