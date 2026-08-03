require('dotenv').config(); // Must be at the very top!
const nodemailer = require('nodemailer');
const CircuitBreaker = require('opossum');

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
// NOTE: We do NOT catch errors here anymore. The circuit breaker needs them to trigger!
const sendEmail = async (to, subject, text, html) => {
  const info = await transporter.sendMail({
    from: `"Backend Ledger" <${process.env.EMAIL_USER}>`, 
    to, 
    subject, 
    text, 
    html, 
  });
  
  console.log('Message sent: %s', info.messageId);
  return info;
};

// -------------------------------------------------------------
// Circuit Breaker Configuration
// -------------------------------------------------------------
const breakerOptions = {
    timeout: 5000,           // fail if a send takes > 5s
    errorThresholdPercentage: 50, // open if 50% of requests fail
    resetTimeout: 30000,     // try again after 30s in OPEN state
};

const sendEmailBreaker = new CircuitBreaker(sendEmail, breakerOptions);

// Metric logging: Track state transitions
sendEmailBreaker.on('open', () => console.warn('🚨 [Circuit Breaker] OPEN: Email API failing. Pausing requests.'));
sendEmailBreaker.on('halfOpen', () => console.log('⏳ [Circuit Breaker] HALF_OPEN: Testing if Email API is back...'));
sendEmailBreaker.on('close', () => console.log('✅ [Circuit Breaker] CLOSED: Email API is healthy again.'));

// Fallback logic when circuit is OPEN
sendEmailBreaker.fallback((to, subject, text, html, error) => {
    console.warn(`[Circuit Breaker] Fallback triggered for email to ${to}. Reason: ${error.message}`);
    // In a production system, you might want to save this to a 'failed_emails' DB table 
    // to retry asynchronously via a cron job later.
    
    // We throw an error so the Kafka Consumer knows it failed and can route to DLQ
    throw new Error('Email circuit OPEN - ' + error.message);
});
// -------------------------------------------------------------


async function sendRegisterEmail(userEmail, name){
    const subject = "Welcome to Backend Ledger";
    const text = `Hello ${name},\n\nWe are thankful to have you in the Backend Ledger Community.`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;
    
    // Use the circuit breaker instead of calling sendEmail directly
    await sendEmailBreaker.fire(userEmail, subject, text, html);
}

// Updated to match the parameters passed by your Kafka consumer
async function sendTransactionEmail(userEmail, name, amount, toAccount){
    const subject = "Transaction Successful";
    const text = `Hello ${name},\n\nYour transaction of ${amount} to ${toAccount} was successful.`;
    const html = `<p>Hello ${name},</p><p>Your transaction of <b>${amount}</b> to account <b>${toAccount}</b> was successful!</p><p>Best regards,<br>The Backend Ledger Team</p>`;
    
    await sendEmailBreaker.fire(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name){
    const subject = "Transaction Failed";
    const text = `Hello ${name},\n\nUnfortunately, your recent transaction has failed.`;
    const html = `<p>Hello ${name},</p><p>Unfortunately, your recent transaction has failed. Please check your account balance or contact support.</p><p>Best regards,<br>The Backend Ledger Team</p>`;
    
    await sendEmailBreaker.fire(userEmail, subject, text, html);
}

module.exports = {
    sendRegisterEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail
};