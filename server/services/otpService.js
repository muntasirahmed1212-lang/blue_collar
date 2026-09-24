const crypto = require('crypto');

function generateOTP() {
  // Cryptographically secure 6-digit OTP
  return crypto.randomInt(100000, 999999).toString();
}

function createOTPData(email, purpose = 'verification') {
  const otp = generateOTP();
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
  return {
    code: otp,
    email: email,
    purpose: purpose,          // 'verification' | 'password-reset'
    expiresAt: Date.now() + (expiryMinutes * 60 * 1000),
    attempts: 0,
    maxAttempts: 5
  };
}

function verifyOTP(otpData, submittedCode) {
  if (!otpData) return { valid: false, error: 'No OTP requested. Please request a new one.' };
  if (otpData.attempts >= otpData.maxAttempts) return { valid: false, error: 'Too many wrong attempts. Request a new OTP.' };
  if (Date.now() > otpData.expiresAt) return { valid: false, error: 'OTP has expired. Please request a new one.' };
  
  otpData.attempts++;
  
  if (otpData.code !== submittedCode) {
    return { valid: false, error: `Invalid OTP. ${otpData.maxAttempts - otpData.attempts} attempts remaining.` };
  }
  
  return { valid: true };
}

module.exports = { generateOTP, createOTPData, verifyOTP };
