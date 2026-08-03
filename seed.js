require("dotenv").config();
const mongoose = require("mongoose");
const userModel = require("./src/models/user.model");
const accountModel = require("./src/models/account.model");

async function fixSystemUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // 1. Find the system user that was already created
        const sysUser = await userModel.findOne({ email: "tester@gmail.com" });
        
        if (!sysUser) {
            console.log("❌ System user not found. Check your database.");
            process.exit(1);
        }

        // 2. Check for the account, and forcefully create it if missing
        let sysAccount = await accountModel.findOne({ user: sysUser._id });
        
        if (!sysAccount) {
            sysAccount = await accountModel.create({ user: sysUser._id });
            console.log("✅ Successfully generated the missing bank account!");
        } else {
            console.log("✅ Bank account already exists!");
        }
        
        console.log(`✅ System Account ID ready: ${sysAccount._id}`);
        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

fixSystemUser();