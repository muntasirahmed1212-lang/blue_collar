const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.warn('⚠️ RESEND_API_KEY is not configured. Outbound emails will fail unless dev fallback is active.');
}

const resend = new Resend(apiKey || 're_placeholder_missing_key');

const rawFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const fromAddress = rawFrom.includes('<') ? rawFrom : `"BlueCollar Connect" <${rawFrom}>`;

/**
 * Sends an OTP email to the recipient using Resend HTTPS API.
 * @param {string} to - Recipient email address
 * @param {object} params - Email parameters
 * @param {string} params.userName - Recipient's display name
 * @param {string} params.otpCode - 6-digit OTP code
 * @param {string} params.purpose - 'verification' or 'password-reset'
 * @param {number} params.expiryMinutes - Minutes until expiry
 */
async function sendOTPEmail(to, { userName, otpCode, purpose, expiryMinutes }) {
  const { getOTPEmailHTML, getPlainTextEmail } = require('../templates/otpEmail');
  
  const subject = purpose === 'password-reset'
    ? `${otpCode} is your BlueCollar Connect password reset code`
    : `${otpCode} is your BlueCollar Connect verification code`;

  const payload = {
    from: fromAddress,
    to: [to],
    subject: subject,
    text: getPlainTextEmail({ userName, otpCode, purpose, expiryMinutes }),
    html: getOTPEmailHTML({ userName, otpCode, purpose, expiryMinutes }),
    headers: {
      'X-Priority': '3',
      'X-Mailer': 'BlueCollar Connect Mailer'
    }
  };

  const executeSend = async () => {
    const { data, error } = await resend.emails.send(payload);
    if (error) {
      const err = new Error(error.message || 'Failed to send email via Resend');
      err.statusCode = error.statusCode;
      err.name = error.name || 'ResendError';
      throw err;
    }
    return data;
  };

  try {
    return await executeSend();
  } catch (err) {
    const statusCode = err.statusCode || (err.response && err.response.status);
    const isTransient = [429, 500, 502, 503, 504].includes(statusCode) ||
      ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET', 'FETCH_ERROR', 'ENOTFOUND'].includes(err.code);

    if (isTransient) {
      console.warn(`Transient email delivery error (${statusCode || err.code}): ${err.message}. Retrying once after 1s...`);
      await new Promise(res => setTimeout(res, 1000));
      return await executeSend();
    }
    throw err;
  }
}

module.exports = {
  sendOTPEmail,
  resend
};
