/**
 * tests/forensic-audit-comprehensive.js
 * Comprehensive Forensic Integrity Audit Runner
 * Author: auditor_final_1
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const assert = require('node:assert/strict');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');

const db = require('../server/db/database');
const authController = require('../server/controllers/authController');
const emailService = require('../server/services/emailService');

const originalUsers = fs.readFileSync(DB_PATH, 'utf8');
const originalSendEmail = emailService.sendOTPEmail;

const results = [];

function recordResult(checkNum, checkName, passed, details = '') {
  results.push({ checkNum, checkName, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] Check ${checkNum}: ${checkName}`);
  if (details) console.log(`       -> ${details}`);
}

async function runForensicAudit() {
  console.log('================================================================');
  console.log('BLUECOLLAR CONNECT — FORENSIC INTEGRITY AUDIT');
  console.log('Auditor: auditor_final_1');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // CHECK 1: STATIC CODE FORENSICS — NO HARDCODED VALUES OR MOCK BYPASSES
    // -------------------------------------------------------------------------
    console.log('--- 1. Static Code Analysis: Hardcoded Values & Mock Bypasses ---');
    const authControllerCode = fs.readFileSync(path.join(PROJECT_ROOT, 'server/controllers/authController.js'), 'utf8');
    const databaseCode = fs.readFileSync(path.join(PROJECT_ROOT, 'server/db/database.js'), 'utf8');

    // 1.1 Check for hardcoded test emails or domains
    const testPattern = /(test@|example\.com|admin@fake|123456)/i;
    const authHasTestPattern = testPattern.test(authControllerCode);
    const dbHasTestPattern = testPattern.test(databaseCode);
    recordResult('1.1', 'No hardcoded test emails, domains, or fixed OTP codes', !authHasTestPattern && !dbHasTestPattern, 
      `authController: ${!authHasTestPattern ? 'CLEAN' : 'FLAGGED'}, database: ${!dbHasTestPattern ? 'CLEAN' : 'FLAGGED'}`);

    // 1.2 Check for mock bypass flags or test environment conditionals
    const bypassPattern = /(NODE_ENV\s*===?\s*['"]test['"]|x-test|mockBypass|bypassAuth|__test__)/i;
    const authHasBypass = bypassPattern.test(authControllerCode);
    const dbHasBypass = bypassPattern.test(databaseCode);
    recordResult('1.2', 'No test-bypass conditionals or environment sniffing', !authHasBypass && !dbHasBypass,
      `authController: ${!authHasBypass ? 'CLEAN' : 'FLAGGED'}, database: ${!dbHasBypass ? 'CLEAN' : 'FLAGGED'}`);

    // -------------------------------------------------------------------------
    // CHECK 2: STATIC CODE FORENSICS — NO DUMMY OR FACADE IMPLEMENTATIONS
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Static Code Analysis: Facade Implementations ---');
    // Verify genuine implementation of required database functions
    const dbExports = Object.keys(db);
    const requiredDbExports = ['findUserByEmail', 'createUser', 'updateUser', 'deleteUser', 'readUsers'];
    const hasAllDbExports = requiredDbExports.every(fn => typeof db[fn] === 'function');
    recordResult('2.1', 'Database module exports all genuine required functions', hasAllDbExports,
      `Exports: [${dbExports.join(', ')}]`);

    // Verify genuine implementation of authController functions
    const authExports = Object.keys(authController);
    const requiredAuthExports = ['register', 'sendOtp', 'verifyOtp', 'login', 'forgotPassword', 'resetPassword', 'logout', 'getMe'];
    const hasAllAuthExports = requiredAuthExports.every(fn => typeof authController[fn] === 'function');
    recordResult('2.2', 'Auth controller exports all genuine required handlers', hasAllAuthExports,
      `Exports: [${authExports.join(', ')}]`);

    // -------------------------------------------------------------------------
    // SETUP TEST SERVER FOR RUNTIME FORENSICS
    // -------------------------------------------------------------------------
    const app = express();
    app.use(express.json());
    app.use(session({
      secret: 'audit_secret_key_123',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }
    }));

    app.post('/api/auth/register', authController.register);
    app.post('/api/auth/send-otp', authController.sendOtp);
    app.post('/api/auth/verify-otp', authController.verifyOtp);
    app.post('/api/auth/login', authController.login);
    app.post('/api/auth/forgot-password', authController.forgotPassword);
    app.post('/api/auth/reset-password', authController.resetPassword);
    app.post('/api/auth/logout', authController.logout);
    app.get('/api/auth/me', authController.getMe);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const serverUrl = `http://127.0.0.1:${server.address().port}`;

    async function req(method, endpoint, body = null, cookie = null) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers['Cookie'] = cookie;
      const res = await fetch(`${serverUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => null);
      const setCookie = res.headers.get('set-cookie');
      return { status: res.status, data, cookie: setCookie || cookie };
    }

    // -------------------------------------------------------------------------
    // CHECK 3A: DYNAMIC RUNTIME TRACING — ATOMICITY
    // -------------------------------------------------------------------------
    console.log('\n--- 3A. Dynamic Runtime Tracing: Registration Atomicity ---');
    fs.writeFileSync(DB_PATH, '[]', 'utf8');

    // 3A.1 Broken SMTP must return 500 and leave users.json completely untouched
    emailService.sendOTPEmail = async () => {
      throw new Error('SMTP Connection Refused on port 465');
    };

    const failedReg = await req('POST', '/api/auth/register', {
      fullName: 'Atomic Test User',
      email: 'atomic.failure@example.com',
      password: 'StrongPassword123!'
    });

    const dbAfterFailedReg = db.readUsers();
    const isAtomicClean = failedReg.status === 500 && dbAfterFailedReg.length === 0;
    recordResult('3A.1', 'Broken SMTP returns HTTP 500 and leaves database completely clean', isAtomicClean,
      `Status: ${failedReg.status}, Users in DB: ${dbAfterFailedReg.length}`);

    // 3A.2 Successful registration persists user with isVerified: false
    let sentEmailPayload = null;
    emailService.sendOTPEmail = async (to, payload) => {
      sentEmailPayload = { to, payload };
      return { messageId: 'msg-12345' };
    };

    const successReg = await req('POST', '/api/auth/register', {
      fullName: 'Genuine Registered User',
      email: 'genuine.user@example.com',
      password: 'ValidPassword123!'
    });

    const dbAfterSuccessReg = db.readUsers();
    const persistedUser = dbAfterSuccessReg.find(u => u.email === 'genuine.user@example.com');
    const isPersistedCorrectly = successReg.status === 200 &&
      persistedUser &&
      persistedUser.isVerified === false &&
      persistedUser.fullName === 'Genuine Registered User';
    recordResult('3A.2', 'Successful registration persists user with isVerified: false after email dispatch', isPersistedCorrectly,
      `Status: ${successReg.status}, Found in DB: ${Boolean(persistedUser)}, isVerified: ${persistedUser?.isVerified}`);

    // 3A.3 Re-registration of unverified user prunes stale record and updates user
    const reReg = await req('POST', '/api/auth/register', {
      fullName: 'Updated Name User',
      email: 'genuine.user@example.com',
      password: 'NewPassword123!'
    });

    const dbAfterReReg = db.readUsers();
    const userRecords = dbAfterReReg.filter(u => u.email === 'genuine.user@example.com');
    const isReRegClean = reReg.status === 200 && userRecords.length === 1 && userRecords[0].fullName === 'Updated Name User';
    recordResult('3A.3', 'Re-registration of unverified account prunes stale record without duplicate leakage', isReRegClean,
      `Records count for email: ${userRecords.length}, Name: ${userRecords[0]?.fullName}`);

    // 3A.4 Registration collision on verified account rejects with 400
    db.updateUser('genuine.user@example.com', { isVerified: true });
    const verifiedCollision = await req('POST', '/api/auth/register', {
      fullName: 'Attacker Impersonator',
      email: 'genuine.user@example.com',
      password: 'AttackerPass123!'
    });

    const dbAfterCollision = db.readUsers();
    const finalRecord = dbAfterCollision.find(u => u.email === 'genuine.user@example.com');
    const isCollisionBlocked = verifiedCollision.status === 400 &&
      verifiedCollision.data?.error === 'Email is already registered.' &&
      finalRecord.fullName === 'Updated Name User';
    recordResult('3A.4', 'Registration collision on verified user returns HTTP 400 and preserves account', isCollisionBlocked,
      `Status: ${verifiedCollision.status}, Error: ${verifiedCollision.data?.error}`);

    // -------------------------------------------------------------------------
    // CHECK 3B: DYNAMIC RUNTIME TRACING — PASSWORD HASHING
    // -------------------------------------------------------------------------
    console.log('\n--- 3B. Dynamic Runtime Tracing: Cryptographic Password Hashing ---');
    // 3B.1 Verify stored password format & salt rounds
    const bcryptRegex = /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/;
    const storedHash = finalRecord.password;
    const isBcrypt12 = bcryptRegex.test(storedHash);
    const plaintextLeaked = storedHash === 'NewPassword123!';
    recordResult('3B.1', 'Password stored as genuine bcrypt hash with cost factor 12', isBcrypt12 && !plaintextLeaked,
      `Stored Hash Prefix: ${storedHash.substring(0, 7)}, Length: ${storedHash.length}`);

    // 3B.2 Verify cryptographic verification matches genuine password and rejects incorrect
    const validMatch = await bcrypt.compare('NewPassword123!', storedHash);
    const invalidMatch = await bcrypt.compare('WrongPassword456!', storedHash);
    recordResult('3B.2', 'Bcrypt verification validates genuine credentials and rejects invalid credentials', validMatch && !invalidMatch,
      `Valid password matches: ${validMatch}, Invalid password matches: ${invalidMatch}`);

    // 3B.3 Password exposure prevention: verify password is never exposed in responses
    const loginRes = await req('POST', '/api/auth/login', {
      email: 'genuine.user@example.com',
      password: 'NewPassword123!'
    });
    const loginSessionCookie = loginRes.cookie;
    const loginExposesPassword = 'password' in (loginRes.data?.user || {});

    const meRes = await req('GET', '/api/auth/me', null, loginSessionCookie);
    const meExposesPassword = 'password' in (meRes.data?.user || {});
    recordResult('3B.3', 'Password hash and plaintext strictly omitted from API responses (/login and /me)', !loginExposesPassword && !meExposesPassword,
      `Login user fields: [${Object.keys(loginRes.data?.user || {}).join(', ')}], Me user fields: [${Object.keys(meRes.data?.user || {}).join(', ')}]`);

    // -------------------------------------------------------------------------
    // CHECK 3C: DYNAMIC RUNTIME TRACING — SESSION MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 3C. Dynamic Runtime Tracing: Session Management ---');
    // 3C.1 Session creates OTP data on register
    let regOtpCookie = null;
    let registeredOtpCode = null;
    emailService.sendOTPEmail = async (to, { otpCode }) => {
      registeredOtpCode = otpCode;
      return { messageId: 'otp-ok' };
    };

    const sessionReg = await req('POST', '/api/auth/register', {
      fullName: 'Session Lifecycle User',
      email: 'session.user@example.com',
      password: 'SessionPass123!'
    });
    regOtpCookie = sessionReg.cookie;
    recordResult('3C.1', 'Registration sets session cookie for OTP tracking', Boolean(regOtpCookie),
      `Set-Cookie present: ${Boolean(regOtpCookie)}`);

    // 3C.2 Verify OTP without cookie fails
    const noCookieVerify = await req('POST', '/api/auth/verify-otp', {
      email: 'session.user@example.com',
      otp: registeredOtpCode
    });
    recordResult('3C.2', 'Verify OTP without session cookie rejected with HTTP 400', noCookieVerify.status === 400,
      `Status: ${noCookieVerify.status}, Error: ${noCookieVerify.data?.error}`);

    // 3C.3 Verify OTP with valid cookie logs user into session
    const validVerify = await req('POST', '/api/auth/verify-otp', {
      email: 'session.user@example.com',
      otp: registeredOtpCode
    }, regOtpCookie);
    const verifiedCookie = validVerify.cookie || regOtpCookie;
    recordResult('3C.3', 'Verify OTP with valid session activates user and establishes logged-in session', validVerify.status === 200,
      `Status: ${validVerify.status}, Message: ${validVerify.data?.message}`);

    // 3C.4 /api/auth/me returns authenticated user from session
    const meVerified = await req('GET', '/api/auth/me', null, verifiedCookie);
    const meValid = meVerified.status === 200 && meVerified.data?.user?.email === 'session.user@example.com';
    recordResult('3C.4', 'GET /api/auth/me retrieves correct profile using active session', meValid,
      `Status: ${meVerified.status}, User email: ${meVerified.data?.user?.email}`);

    // 3C.5 Logout destroys session
    const logoutRes = await req('POST', '/api/auth/logout', {}, verifiedCookie);
    const meAfterLogout = await req('GET', '/api/auth/me', null, verifiedCookie);
    const logoutSuccess = logoutRes.status === 200 && meAfterLogout.status === 401;
    recordResult('3C.5', 'POST /api/auth/logout invalidates session; subsequent /me returns HTTP 401', logoutSuccess,
      `Logout status: ${logoutRes.status}, Me after logout status: ${meAfterLogout.status}`);

    // -------------------------------------------------------------------------
    // CHECK 3D: SECONDARY BUG VERIFICATION — forgotPassword & getMe
    // -------------------------------------------------------------------------
    console.log('\n--- 3D. Secondary Bug Verification: forgotPassword Context & getMe ---');
    // 3D.1 forgotPassword executes sendOtp without 'this' context crash
    let forgotPasswordOtp = null;
    emailService.sendOTPEmail = async (to, { otpCode }) => {
      forgotPasswordOtp = otpCode;
      return { messageId: 'fp-ok' };
    };

    const forgotRes = await req('POST', '/api/auth/forgot-password', {
      email: 'session.user@example.com'
    });
    const fpSuccess = forgotRes.status === 200 && Boolean(forgotPasswordOtp);
    recordResult('3D.1', 'forgotPassword invokes sendOtp directly without this-context crash', fpSuccess,
      `Status: ${forgotRes.status}, OTP generated: ${Boolean(forgotPasswordOtp)}`);

    // 3D.2 forgotPassword anti-enumeration oracle
    const nonExistentFp = await req('POST', '/api/auth/forgot-password', {
      email: 'nonexistent.user.9999@nowhere.com'
    });
    const antiEnumSuccess = nonExistentFp.status === 200 &&
      nonExistentFp.data?.message === 'If the email exists, an OTP has been sent.';
    recordResult('3D.2', 'forgotPassword returns generic message for non-existent users (anti-enumeration)', antiEnumSuccess,
      `Status: ${nonExistentFp.status}, Message: ${nonExistentFp.data?.message}`);

    // 3D.3 getMe uses db.readUsers() instead of raw fs.readFileSync
    const authControllerRaw = fs.readFileSync(path.join(PROJECT_ROOT, 'server/controllers/authController.js'), 'utf8');
    const usesFsInGetMe = /getMe[\s\S]*?readFileSync/.test(authControllerRaw);
    recordResult('3D.3', 'getMe cleanly delegates to db.readUsers() with zero raw fs.readFileSync calls', !usesFsInGetMe,
      `Direct fs.readFileSync in getMe: ${usesFsInGetMe ? 'DETECTED' : 'NONE'}`);

    // -------------------------------------------------------------------------
    // CHECK 4: BACKWARD COMPATIBILITY & CLIENT-SIDE IMMUTABILITY
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Client-Side Immutability & Backward Compatibility ---');
    const authUIPath = path.join(PROJECT_ROOT, 'js/components/authUI.js');
    const authServicePath = path.join(PROJECT_ROOT, 'js/services/authService.js');

    const authUIStat = fs.statSync(authUIPath);
    const authServiceStat = fs.statSync(authServicePath);

    // Baseline timestamp check: milestone started at 2026-09-24T16:15:16Z (21:45 local)
    // authUI was last written at 18:32:14 local, authService at 13:56:30 local
    const milestoneStartTime = new Date('2026-09-24T16:15:16Z').getTime();
    const authUIMtime = authUIStat.mtime.getTime();
    const authServiceMtime = authServiceStat.mtime.getTime();

    const authUIUntouched = authUIMtime < milestoneStartTime;
    const authServiceUntouched = authServiceMtime < milestoneStartTime;

    recordResult('4.1', 'js/components/authUI.js untouched during Registration/OTP milestone', authUIUntouched,
      `Last Modified: ${authUIStat.mtime.toISOString()} vs Milestone Start: 2026-09-24T16:15:16Z`);
    recordResult('4.2', 'js/services/authService.js untouched during Registration/OTP milestone', authServiceUntouched,
      `Last Modified: ${authServiceStat.mtime.toISOString()} vs Milestone Start: 2026-09-24T16:15:16Z`);

    // -------------------------------------------------------------------------
    // CHECK 5: UNAUTHORIZED DEPENDENCIES IN package.json
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Unauthorized Dependencies Audit in package.json ---');
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    const dependencies = Object.keys(pkg.dependencies || {});
    const allowedDependencies = [
      'bcryptjs',
      'cors',
      'dotenv',
      'express',
      'express-rate-limit',
      'express-session',
      'helmet',
      'nodemailer'
    ];

    const unauthorizedDeps = dependencies.filter(d => !allowedDependencies.includes(d));
    const allAllowedPresent = allowedDependencies.every(d => dependencies.includes(d));
    const isDepsClean = unauthorizedDeps.length === 0 && allAllowedPresent;

    recordResult('5.1', 'No unauthorized dependencies present in package.json', isDepsClean,
      `Declared: [${dependencies.join(', ')}], Unauthorized: [${unauthorizedDeps.join(', ') || 'none'}]`);

    server.close();
  } finally {
    emailService.sendOTPEmail = originalSendEmail;
    fs.writeFileSync(DB_PATH, originalUsers, 'utf8');
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('AUDIT SUMMARY');
  console.log('================================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`Total Checks Executed: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}`);
  console.log(`Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`Final Verdict: ${allPassed ? 'CLEAN' : 'INTEGRITY VIOLATION'}`);
  console.log('================================================================');

  return { allPassed, results };
}

runForensicAudit()
  .then(({ allPassed }) => {
    process.exit(allPassed ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
  });
