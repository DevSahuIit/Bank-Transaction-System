const nodemailer = require('nodemailer');
require('dotenv').config(); // Must be at the very top!

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});



// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Backend Ledger" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendRegisterEmail(userEmail,name){
    // console.log("hi email send")
    const subject = "Welcome to backend ledger";
    const text = `HEllo ${name},\n\n wea are Thank full to have you on BAckend Ledger Community `
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;
    await sendEmail(userEmail,subject,text,html);
}
async function sendTransactionEmail(userEmail,name){
    // console.log("hi email send")
    const subject = "Transaction sucessfull";
    const text = `HEllo ${name},\n\n wea are Thank full to have you on BAckend Ledger Community `
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;
    await sendEmail(userEmail,subject,text,html);
}
async function sendTransactionFailureEmail(userEmail,name){
    // console.log("hi email send")
    const subject = "Welcome to backend ledger";
    const text = `HEllo ${name},\n\n wea are Thank full to have you on BAckend Ledger Community `
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;
    await sendEmail(userEmail,subject,text,html);
}

module.exports = {
    sendRegisterEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail

};
