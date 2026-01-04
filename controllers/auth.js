const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const User = require('../model/User')
const cloudinary = require("cloudinary").v2;
const nodemailer = require('nodemailer')
require('dotenv').config();
const UserOTPVerification = require("../model/UserOtpVerification");

/*  NODEMAILER */
let transporter = nodemailer.createTransport({
    host: "smtp-mail.outlook.com",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
})

/* CONFIGURING THE CLOUDINARY FOR IMAGE UPLOAD */
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
});
async function handleUpload(file) {
    const res = await cloudinary.uploader.upload(file, {
        folder: "profiles",
        resource_type: "auto",
    });
    return res;
}

/* REGISTER USER */
const register = async (req, res) => {
    let flag = false;
    try {
        const {
            otpId,
            email,
            otp
        } = req.body;                                               // Destructure the req.body object and extract all values
        // Verify User Otp
        if (!otpId || !otp) {
            throw new Error("400 Empty otp details are not allowed");
        } else {
            const UserOTPVerificationRecords = await UserOTPVerification.findById(otpId);
            if (UserOTPVerificationRecords.length <= 0) {
                // no records found
                throw new Error("Account record not found. Signup again")
            } else {
                const { expirtedAt } = UserOTPVerificationRecords;
                const hashedOtp = UserOTPVerificationRecords.otp;

                if (expirtedAt < Date.now()) {
                    await UserOTPVerification.deleteMany({ _id:otpId });
                    throw new Error("Code has expired. Plaese request again")
                }
                else {
                    const validOTP = await bcrypt.compare(otp, hashedOtp);

                    if (!validOTP) {
                        // Supply OTP is wrong
                        throw new Error("401 Invalid OTP")
                    }
                    else {
                        await UserOTPVerification.deleteMany({ _id:otpId });
                        flag = true;
                    }
                }
            }
        }

        // succesfull email authentication
        if (flag === true) {
            const { firstName,
                lastName,
                email,
                password,
                friends,
                location,
                picturePath,
                occupation } = req.body;
            const salt = await bcrypt.genSalt();
            const passwordHash = await bcrypt.hash(password, salt);      // password encrption

            const newUser = new User({                                 // New User Details
                firstName,
                lastName,
                email,
                password: passwordHash,
                picturePath,
                friends,
                location,
                occupation,
                viewedProfile: Math.floor(Math.random() * 10000),
                impressions: Math.floor(Math.random() * 10000)
            });
            const savedUser = await newUser.save();
            const successfullySavedUser = { ...savedUser._doc, error: "No error" }
            res.status(201).json(successfullySavedUser);            // Resource saved successfully and returned saved User to Front-End
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/* LOGGING IN */
const login = async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ email: email })
        if (!user)
            return res.status(400).json({ msg: "User doesnot exists!" })
        const isMath = await bcrypt.compare(password, user.password)
        if (!isMath) return res.status(400).json({ msg: "Please check you password!" })

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)                   // creating access Token
        delete user.password;
        res.status(200).json({ token, user })                                              // Returned Token and Userdetails
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}


/*  SEND OTP VERIFICATION EMAIL */
const sendOTPVerificationEmail = async (req, res) => {
    try {

        const { firstName,
            lastName,
            email,
            password,
            friends,
            location,
            occupation,
        } = req.body;

        const hasAccount = await User.find({
            email
        });
        if (hasAccount.length >= 1) {
            //  records found
            throw new Error("409 Another user with this email exists!");
        }

        /*  Generating OTP */
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

        // Mail Option
        const mailOptions = {
            from: process.env.AUTH_EMAIL,
            to: email,
            subject: "Welcome to CONNECT: Verify Your Email",
            html: `
        <div style="background-color: #f5f5f5; padding: 20px; font-family: Arial, sans-serif;">
            <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                <h1 style="color: #333; text-align: center;">Welcome to CONNECT</h1>
                <p style="color: #555; text-align: center;">Please verify your email address to get started.</p>
                <p style="color: #333; text-align: center; font-size: 24px;"><b>${otp}</b></p>
                <p style="color: #555; text-align: center;">Enter this code to complete the Sign-Up Process.</p>
                <p style="color: #555; text-align: center;">This code expires in <b>1 hour</b>.</p>
            </div>
        </div>
    `,
        };


        // Hash the Otp
        const salt = 10;
        const hashedOtp = await bcrypt.hash(otp, salt);
        const newOTPVerification = new UserOTPVerification({
            email: email,
            otp: hashedOtp,
            createAt: Date.now(),
            expirtedAt: Date.now() + 3600000
        });
        // image storing
        const b64 = Buffer.from(req.file.buffer).toString("base64");
        let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
        // save Otp record
        const saved = await newOTPVerification.save();
        const response = await handleUpload(dataURI);
        // Send the mail
        await transporter.sendMail(mailOptions);
        console.log("Otp sent")
        const otpId = saved._id
        res.json({
            status: "PENDING",
            message: "Verification email sent",
            data: {
                firstName,
                lastName,
                email,
                password,
                friends,
                location,
                occupation,
                picturePath: response.public_id,
                otpId
            }
        })
    }
    catch (error) {
        res.json({
            status: "FAILED",
            message: error.message
        })
    }
}
module.exports = { register, login, sendOTPVerificationEmail };