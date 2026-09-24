const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('crypto').randomUUID ? require('crypto') : { randomUUID: () => Math.random().toString(36).substring(2) + Date.now().toString(36) };
const db = require('../db/database');
const otpService = require('../services/otpService');
const emailService = require('../services/emailService');

function generateUUID() {
  if (require('crypto').randomUUID) {
    return require('crypto').randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function isAdminEmail(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);
  return adminEmails.includes(email.toLowerCase().trim());
}

exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body || {};
    if (
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !fullName.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = db.findUserByEmail(normalizedEmail);
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ success: false, error: 'Email is already registered.' });
      }
      // If user exists and is unverified, prune stale record to allow re-registration
      db.deleteUser(normalizedEmail);
    }

    // Generate OTP data and store in session
    const otpData = otpService.createOTPData(normalizedEmail, 'verification');
    req.session.otpData = otpData; // Store in session

    // Attempt email delivery FIRST before database persistence
    await emailService.sendOTPEmail(normalizedEmail, {
      userName: fullName,
      otpCode: otpData.code,
      purpose: 'verification',
      expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5
    });

    // Only if email send succeeds: hash password and persist user
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = {
      id: generateUUID(),
      fullName,
      email: normalizedEmail,
      password: hashedPassword,
      role: isAdminEmail(normalizedEmail) ? 'admin' : (role || 'customer'),
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.createUser(newUser);

    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Server error during registration.' });
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body || {};
    if (!email || typeof email !== 'string' || !email.trim()) return res.status(400).json({ success: false, error: 'Email is required.' });

    const normalizedEmail = email.toLowerCase().trim();
    const user = db.findUserByEmail(normalizedEmail);
    if (!user && purpose === 'password-reset') {
       // Prevent email enumeration
       return res.json({ success: true, message: 'If the email exists, an OTP has been sent.' });
    }

    const otpData = otpService.createOTPData(normalizedEmail, purpose || 'verification');
    req.session.otpData = otpData;

    await emailService.sendOTPEmail(email, {
      userName: user ? user.fullName : '',
      otpCode: otpData.code,
      purpose: purpose || 'verification',
      expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5
    });

    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, error: 'Server error sending OTP.' });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const sessionOtpData = req.session ? req.session.otpData : null;

    if (
      !sessionOtpData ||
      !email ||
      typeof email !== 'string' ||
      !sessionOtpData.email ||
      typeof sessionOtpData.email !== 'string' ||
      sessionOtpData.email.toLowerCase().trim() !== email.toLowerCase().trim()
    ) {
      return res.status(400).json({ success: false, error: 'No OTP requested or session expired.' });
    }

    const verificationResult = otpService.verifyOTP(sessionOtpData, otp);
    
    if (!verificationResult.valid) {
      req.session.otpData = sessionOtpData; // Save attempts
      return res.status(400).json({ success: false, error: verificationResult.error });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // OTP is valid
    if (sessionOtpData.purpose === 'verification') {
      db.updateUser(normalizedEmail, { isVerified: true });
      const user = db.findUserByEmail(normalizedEmail);
      req.session.userId = user.id; // Log them in
      delete req.session.otpData;
      return res.json({ success: true, message: 'Email verified successfully. You are now logged in.', user: { fullName: user.fullName, email: user.email, role: user.role } });
    } else {
      // password-reset: don't log in yet, just confirm it's verified
      req.session.otpData.verified = true; 
      return res.json({ success: true, message: 'OTP verified. Please set your new password.' });
    }

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, error: 'Server error verifying OTP.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Email and password required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = db.findUserByEmail(normalizedEmail);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    if (!user.isVerified) {
      return res.status(403).json({ success: false, error: 'Please verify your email first.', needsVerification: true });
    }

    // Auto-upgrade to admin if they match ADMIN_EMAILS but have customer role
    let currentRole = user.role;
    if (currentRole !== 'admin' && isAdminEmail(normalizedEmail)) {
      db.updateUser(normalizedEmail, { role: 'admin' });
      currentRole = 'admin';
    }

    req.session.userId = user.id;
    res.json({ success: true, user: { fullName: user.fullName, email: user.email, role: currentRole } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Server error during login.' });
  }
};

exports.forgotPassword = async (req, res) => {
  req.body = req.body || {};
  req.body.purpose = 'password-reset';
  return exports.sendOtp(req, res);
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const sessionOtpData = req.session ? req.session.otpData : null;

    if (
      !sessionOtpData ||
      !email ||
      typeof email !== 'string' ||
      !sessionOtpData.email ||
      typeof sessionOtpData.email !== 'string' ||
      sessionOtpData.email.toLowerCase().trim() !== email.toLowerCase().trim() ||
      !sessionOtpData.verified ||
      sessionOtpData.purpose !== 'password-reset'
    ) {
      return res.status(400).json({ success: false, error: 'Invalid or expired password reset session.' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(password, 12);
    db.updateUser(normalizedEmail, { password: hashedPassword });
    
    delete req.session.otpData;
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Server error resetting password.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out successfully.' });
};

exports.getMe = (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const users = db.readUsers();
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ success: false, error: 'User not found' });

  res.json({ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } });
};

exports.listUsers = (req, res) => {
  try {
    const users = db.readUsers();
    const safeUsers = users.map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      isVerified: u.isVerified,
      createdAt: u.createdAt
    }));
    res.json({ success: true, users: safeUsers });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, error: 'Server error listing users.' });
  }
};
