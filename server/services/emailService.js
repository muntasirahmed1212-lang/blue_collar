const nodemailer = require('nodemailer');

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,          // true for 465, false for 587 (STARTTLS)
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  pool: true,
  maxConnections: 3
});

// Verify connection on startup
transporter.verify()
  .then(() => console.log('✅ Gmail SMTP connected'))
  .catch(err => console.error('❌ Gmail SMTP error:', err.message));

async function sendOTPEmail(to, { userName, otpCode, purpose, expiryMinutes }) {
  const { getOTPEmailHTML, getPlainTextEmail } = require('../templates/otpEmail');
  
  const subject = purpose === 'password-reset'
    ? `${otpCode} is your BlueCollar Connect password reset code`
    : `${otpCode} is your BlueCollar Connect verification code`;

  const mailOptions = {
    from: `"BlueCollar Connect" <${process.env.GMAIL_USER}>`,
    replyTo: process.env.GMAIL_USER,
    to: to,
    subject: subject,
    text: getPlainTextEmail({ userName, otpCode, purpose, expiryMinutes }),
    html: getOTPEmailHTML({ userName, otpCode, purpose, expiryMinutes }),
    headers: {
      'X-Priority': '3',       // Normal priority (1=High triggers spam filters)
      'X-Mailer': 'BlueCollar Connect Mailer'
    }
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendOTPEmail };
