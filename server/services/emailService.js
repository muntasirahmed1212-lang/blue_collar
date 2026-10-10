const nodemailer = require('nodemailer');

/**
 * Parses the IP family setting from environment variable.
 * Accepts 4, 6, or 0 (as numbers or strings).
 * Defaults to 4 (forcing IPv4) if unset or invalid, bypassing Render IPv6 limitations.
 */
function parseIpFamily(val) {
  if (typeof val !== 'string' && typeof val !== 'number') return 4;
  const parsed = parseInt(val, 10);
  return [0, 4, 6].includes(parsed) && String(val).trim() === String(parsed) ? parsed : 4;
}

const smtpFamily = parseIpFamily(process.env.SMTP_IP_FAMILY);

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,          // true for 465, false for 587 (STARTTLS)
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  family: smtpFamily,
  connectionTimeout: 10000,
  socketTimeout: 10000
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

module.exports = { sendOTPEmail, transporter, parseIpFamily };
