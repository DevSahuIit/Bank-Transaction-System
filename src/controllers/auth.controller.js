const userModel = require("../models/user.model")

// user register controller 
// api will be POST /api/autj/register
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")

async function userRegisterController(req,res){
    const {email,password,name}=req.body
    const isExists = await userModel.findOne({
        email:email //devsahu234561
    })

    if (isExists){
        return res.status(422).json({
            message:"USer already exists with email.",
            status: "failed"
        })
    }
// account create hone k bad jwt banan chahiyeh
    const user = await userModel.create({
        email,password,name
    })

    const token = jwt.sign({userID:user._id},process.env.JWT_SECRET, {expiresIn: "3d"})
    // we want tokens in coookies we want coojieparsor 
    res.cookie("token",token)
    res.status(201).json({
        user: {
            _id : user._id,
            email: user.email,
            name: user.name
        },
        token
    })
    // console.log("hi");
    await emailService.sendRegisterEmail(user.email,user.name);

}

/// js doc string 
// user login controller
// api will be POST /api/auth/login

async function userLoginController(req,res){
    const {email,password}=req.body
    const user = await userModel.findOne({email}).select("+password")
    if (!user){
        return res.status(401).json({
            message:"Email or password is InValid"
        })

    }
    const isValidPassword = await user.comparePassword(password)
    if (!isValidPassword){
        return res.status(401).json({
            message:"password is InValid"
        })
    }
    
    const token = jwt.sign({userID:user._id},process.env.JWT_SECRET, {expiresIn: "3d"})
    // we want tokens in coookies we want coojieparsor 
    res.cookie("token",token)
    res.status(200).json({
        user: {
            _id : user._id,
            email: user.email,
            name: user.name
        },
        token
    })
}

module.exports = {
    userRegisterController,userLoginController
}