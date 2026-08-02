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
        const user = await userModel.findById(decoded.userID)
        req.user = user
        return next()
    }catch(err){
         return res.status(401).json({
            message:"Unauthorized acess , token is missing"
        })
    }
}

async function authSystemUserMiddleware(req,res,next){
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]
    if (!token){
        return res.status(401).json({
            message:"Unauthorized acess , token is missing"
        })
    }
    try{
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const user = await userModel.findById(decoded.userID).select("+systemUser")
        if (!user.systemUser){
            return res.status(403).json({
                message:"Forbiiden acess,not a system user"
            })
        }
        req.user = user
        return next()
    }catch(err){
         return res.status(401).json({
            message:"Unauthorized acess , token is missing"
        })
    }

}
// this middleware allows only the registred members to go forward
module.exports ={
    authMiddleware,
    authSystemUserMiddleware,
}