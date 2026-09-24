/**
 * tests/adversarial-registration.test.js
 * Adversarial Stress & Verification Harness for BlueCollar Connect Registration Flow
 * 
 * Challenger: challenger_otp_1
 * Focus: Registration flow & database integrity under stress.
 * 
 * Test Scenarios:
 * 1. Concurrency / Simultaneous registrations with the same email
 * 2. Case-insensitivity in email matching & lifecycle operations
 * 3. Input fuzzing & type confusion (special chars, long strings, missing fields, objects, arrays)
 * 4. Broken SMTP resilience (repeated SMTP failures must never leak unverified users)
 * 5. Unverified re-registration stress cycles (20+ cycles with casing churn)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const assert = require('node:assert/strict');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');

// Modules under test
const db = require('../server/db/database');
const authController = require('../server/controllers/authController');
const emailService = require('../server/services/emailService');
const otpService = require('../server/services/otpService');

// Preserve pristine DB state
const PRISTINE_DB_CONTENT = fs.readFileSync(USERS_JSON_PATH, 'utf8');

function restoreDatabase() {
  fs.writeFileSync(USERS_JSON_PATH, PRISTINE_DB_CONTENT, 'utf8');
}

function resetDatabaseTo(users = []) {
  fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(users, null, 2), 'utf8');
}

// Ensure cleanup on exit
process.on('exit', () => {
  try {
    restoreDatabase();
  } catch (e) {
    console.error('Failed to restore database on exit:', e);
  }
});

// Helper to create an isolated test app
function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: 'test_secret_key_12345',
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
  app.get('/api/auth/me', authController.getMe);

  return app;
}

// HTTP request helper with cookie jar support
async function httpRequest(serverUrl, method, endpoint, body = null, cookie = null) {
  const url = `${serverUrl}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;

  const options = {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  };

  const res = await fetch(url, options);
  const status = res.status;
  const setCookie = res.headers.get('set-cookie');
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status, data, cookie: setCookie || cookie };
}

// Track test results
const summary = {
  total: 0,
  passed: 0,
  failed: 0,
  findings: []
};

async function runTest(suiteName, testName, testFn) {
  summary.total++;
  process.stdout.write(`  [TEST] ${testName} ... `);
  try {
    await testFn();
    summary.passed++;
    console.log(`PASSED`);
    return { suiteName, testName, status: 'PASSED' };
  } catch (err) {
    summary.failed++;
    console.log(`FAILED: ${err.message}`);
    summary.findings.push({
      suite: suiteName,
      test: testName,
      error: err.message,
      stack: err.stack
    });
    return { suiteName, testName, status: 'FAILED', error: err };
  }
}

// Main Test Runner
async function main() {
  console.log('===============================================================');
  console.log('BLUECOLLAR CONNECT — ADVERSARIAL STRESS & VERIFICATION SUITE');
  console.log('Challenger: challenger_otp_1');
  console.log('===============================================================\n');

  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${serverUrl}\n`);

  const originalSendOTPEmail = emailService.sendOTPEmail;

  try {
    // =========================================================================
    // SUITE 1: CONCURRENCY & RACE CONDITIONS
    // =========================================================================
    console.log('--- SUITE 1: Concurrency & Race Conditions ---');

    await runTest('Suite 1: Concurrency', '1.1: Simultaneous registration of brand new email (5 concurrent requests)', async () => {
      resetDatabaseTo([]);
      let sentCount = 0;
      emailService.sendOTPEmail = async () => {
        sentCount++;
        // Simulate realistic network latency for SMTP dispatch
        await new Promise(r => setTimeout(r, 40));
        return { messageId: 'simulated-ok' };
      };

      const email = 'concurrency_new@example.com';
      const requests = Array.from({ length: 5 }, (_, i) => 
        httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `Concurrent User ${i}`,
          email: email,
          password: `Password${i}!123`
        })
      );

      const responses = await Promise.all(requests);
      const usersInDb = db.readUsers().filter(u => u.email.toLowerCase() === email.toLowerCase());

      console.log(`\n       -> Responses: ${responses.map(r => r.status).join(', ')}`);
      console.log(`       -> Users in users.json for email: ${usersInDb.length}`);

      // Adversarial Check: Does the database contain duplicate users due to TOCTOU race condition?
      if (usersInDb.length > 1) {
        throw new Error(`CONCURRENCY RACE CONDITION: Found ${usersInDb.length} duplicate user records in users.json for ${email}!`);
      }
      assert.equal(usersInDb.length, 1, 'Expected exactly 1 user in users.json');
    });

    await runTest('Suite 1: Concurrency', '1.2: Simultaneous re-registration of existing unverified user (5 concurrent requests)', async () => {
      resetDatabaseTo([{
        id: 'initial-unverified-id',
        fullName: 'Initial Unverified',
        email: 'concurrency_unverified@example.com',
        password: 'hashed-password-123',
        role: 'customer',
        isVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      emailService.sendOTPEmail = async () => {
        await new Promise(r => setTimeout(r, 40));
        return { messageId: 'simulated-ok' };
      };

      const email = 'concurrency_unverified@example.com';
      const requests = Array.from({ length: 5 }, (_, i) => 
        httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `ReReg User ${i}`,
          email: email,
          password: `Password${i}!123`
        })
      );

      const responses = await Promise.all(requests);
      const usersInDb = db.readUsers().filter(u => u.email.toLowerCase() === email.toLowerCase());

      console.log(`\n       -> Responses: ${responses.map(r => r.status).join(', ')}`);
      console.log(`       -> Users in users.json for email: ${usersInDb.length}`);

      if (usersInDb.length > 1) {
        throw new Error(`CONCURRENCY RACE CONDITION ON UNVERIFIED: Found ${usersInDb.length} duplicate user records in users.json!`);
      }
      assert.equal(usersInDb.length, 1, 'Expected exactly 1 user in users.json');
    });

    await runTest('Suite 1: Concurrency', '1.3: Simultaneous registration of already verified user (5 concurrent requests)', async () => {
      resetDatabaseTo([{
        id: 'verified-id-123',
        fullName: 'Verified User',
        email: 'concurrency_verified@example.com',
        password: 'hashed-password-123',
        role: 'customer',
        isVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      let emailSent = false;
      emailService.sendOTPEmail = async () => {
        emailSent = true;
        return { messageId: 'simulated-ok' };
      };

      const email = 'concurrency_verified@example.com';
      const requests = Array.from({ length: 5 }, (_, i) => 
        httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `Verified Attacker ${i}`,
          email: email,
          password: `Password${i}!123`
        })
      );

      const responses = await Promise.all(requests);
      const usersInDb = db.readUsers().filter(u => u.email.toLowerCase() === email.toLowerCase());

      assert.equal(emailSent, false, 'No email should be dispatched when registering verified email');
      for (const res of responses) {
        assert.equal(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);
        assert.equal(res.data.error, 'Email is already registered.');
      }
      assert.equal(usersInDb.length, 1, 'Verified user must not be duplicated or overwritten');
      assert.equal(usersInDb[0].id, 'verified-id-123', 'Verified user record must remain unchanged');
    });

    // =========================================================================
    // SUITE 2: CASE-INSENSITIVITY & NORMALIZATION
    // =========================================================================
    console.log('\n--- SUITE 2: Case-Insensitivity & Normalization ---');

    await runTest('Suite 2: Case-Insensitivity', '2.1: Register with uppercase/mixed-case email -> stored lowercase', async () => {
      resetDatabaseTo([]);
      emailService.sendOTPEmail = async () => ({ messageId: 'ok' });

      const mixedEmail = 'MixedCase.User@Domain.COM';
      const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'Mixed Case Tester',
        email: mixedEmail,
        password: 'Password123!'
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);

      const users = db.readUsers();
      assert.equal(users.length, 1);
      assert.equal(users[0].email, 'mixedcase.user@domain.com', 'Email must be normalized to lowercase');
    });

    await runTest('Suite 2: Case-Insensitivity', '2.2: Re-register unverified user with completely different casing', async () => {
      resetDatabaseTo([{
        id: 'unverified-mixed-1',
        fullName: 'Initial Mixed',
        email: 'user.test@example.com',
        password: 'old-password',
        role: 'customer',
        isVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      emailService.sendOTPEmail = async () => ({ messageId: 'ok' });

      // Re-register with ALL CAPS
      const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'New Mixed Name',
        email: 'USER.TEST@EXAMPLE.COM',
        password: 'NewPassword123!'
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);

      const users = db.readUsers();
      assert.equal(users.length, 1, 'Old unverified record must be pruned, leaving exactly 1 user');
      assert.equal(users[0].fullName, 'New Mixed Name');
      assert.equal(users[0].email, 'user.test@example.com');
      assert.notEqual(users[0].id, 'unverified-mixed-1', 'New ID must be generated');
    });

    await runTest('Suite 2: Case-Insensitivity', '2.3: Verified user conflict check with uppercase variant', async () => {
      resetDatabaseTo([{
        id: 'verified-case-1',
        fullName: 'Verified John',
        email: 'john.doe@company.org',
        password: 'hashed-password',
        role: 'customer',
        isVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'Imposter John',
        email: 'JOHN.DOE@COMPANY.ORG',
        password: 'ImposterPassword!'
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.error, 'Email is already registered.');
      assert.equal(db.readUsers().length, 1);
    });

    await runTest('Suite 2: Case-Insensitivity', '2.4: Database deleteUser case-insensitive matching', async () => {
      resetDatabaseTo([
        { email: 'first@test.com', isVerified: false },
        { email: 'second@test.com', isVerified: false }
      ]);

      const delResult1 = db.deleteUser('FIRST@TEST.COM');
      assert.equal(delResult1, true, 'deleteUser must delete uppercase match');
      assert.equal(db.readUsers().length, 1);

      const delResult2 = db.deleteUser('NonExistent@test.com');
      assert.equal(delResult2, false, 'deleteUser must return false for non-existent email');
      assert.equal(db.readUsers().length, 1);
    });

    await runTest('Suite 2: Case-Insensitivity', '2.5: Full lifecycle with casing: register mixed, verify lower, login upper', async () => {
      resetDatabaseTo([]);
      let capturedOtp = null;
      emailService.sendOTPEmail = async (to, { otpCode }) => {
        capturedOtp = otpCode;
        return { messageId: 'ok' };
      };

      // 1. Register with MixedCase
      const regRes = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'Lifecycle User',
        email: 'LifeCycle.User@Domain.Com',
        password: 'Password123!'
      });
      assert.equal(regRes.status, 200);
      assert.ok(capturedOtp, 'OTP code should be captured');
      const sessionCookie = regRes.cookie;

      // 2. Verify OTP with lowercase email
      const verifyRes = await httpRequest(serverUrl, 'POST', '/api/auth/verify-otp', {
        email: 'lifecycle.user@domain.com',
        otp: capturedOtp
      }, sessionCookie);
      assert.equal(verifyRes.status, 200, `OTP verification failed: ${JSON.stringify(verifyRes.data)}`);

      // 3. Login with ALL UPPERCASE email
      const loginRes = await httpRequest(serverUrl, 'POST', '/api/auth/login', {
        email: 'LIFECYCLE.USER@DOMAIN.COM',
        password: 'Password123!'
      });
      assert.equal(loginRes.status, 200, `Login with uppercase email failed: ${JSON.stringify(loginRes.data)}`);
      assert.equal(loginRes.data.user.email, 'lifecycle.user@domain.com');
    });

    // =========================================================================
    // SUITE 3: INPUT FUZZING & TYPE CONFUSION
    // =========================================================================
    console.log('\n--- SUITE 3: Input Fuzzing & Type Confusion ---');

    await runTest('Suite 3: Fuzzing', '3.1: Missing required fields reject with 400', async () => {
      resetDatabaseTo([]);
      const cases = [
        { payload: { email: 'a@b.com', password: '123' }, field: 'missing fullName' },
        { payload: { fullName: 'Name', password: '123' }, field: 'missing email' },
        { payload: { fullName: 'Name', email: 'a@b.com' }, field: 'missing password' },
        { payload: {}, field: 'empty object' }
      ];

      for (const c of cases) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', c.payload);
        assert.equal(res.status, 400, `Expected 400 for ${c.field}, got ${res.status}`);
        assert.equal(res.data.error, 'All fields are required.');
      }
      assert.equal(db.readUsers().length, 0);
    });

    await runTest('Suite 3: Fuzzing', '3.2: Empty strings reject with 400', async () => {
      resetDatabaseTo([]);
      const cases = [
        { payload: { fullName: '', email: 'a@b.com', password: '123' }, desc: 'empty fullName' },
        { payload: { fullName: 'Name', email: '', password: '123' }, desc: 'empty email' },
        { payload: { fullName: 'Name', email: 'a@b.com', password: '' }, desc: 'empty password' }
      ];

      for (const c of cases) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', c.payload);
        assert.equal(res.status, 400, `Expected 400 for ${c.desc}, got ${res.status}`);
      }
      assert.equal(db.readUsers().length, 0);
    });

    await runTest('Suite 3: Fuzzing', '3.3: Type confusion: non-string email (integer, boolean, array, object)', async () => {
      resetDatabaseTo([]);
      const badTypes = [
        { email: 12345, desc: 'integer email' },
        { email: true, desc: 'boolean email' },
        { email: ['array@example.com'], desc: 'array email' },
        { email: { email: 'nested@example.com' }, desc: 'object email' }
      ];

      for (const t of badTypes) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: 'Test User',
          email: t.email,
          password: 'Password123!'
        });
        console.log(`\n       -> Type confusion (${t.desc}): HTTP ${res.status} (${JSON.stringify(res.data)})`);
        // If email is not validated as a string, db.findUserByEmail throws TypeError and returns 500
        if (res.status === 500) {
          throw new Error(`UNHANDLED TYPE CONFUSION: Passing ${t.desc} caused server 500 error instead of 400 Bad Request!`);
        }
        assert.equal(res.status, 400, `Expected 400 for ${t.desc}`);
      }
    });

    await runTest('Suite 3: Fuzzing', '3.4: Special characters, SQL/XSS injection payloads in inputs', async () => {
      resetDatabaseTo([]);
      emailService.sendOTPEmail = async () => ({ messageId: 'ok' });

      const injectionPayloads = [
        { name: "<script>alert('xss')</script>", email: 'xss@example.com' },
        { name: "Robert'); DROP TABLE users;--", email: 'sqli@example.com' },
        { name: "Unicode: 🚀🛠️✨ 測試 測試", email: 'unicode+special!#$%&\'*+-/=?^_`{|}~@example.com' }
      ];

      for (const p of injectionPayloads) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: p.name,
          email: p.email,
          password: 'Password123!'
        });

        assert.equal(res.status, 200, `Injection payload rejected: ${JSON.stringify(res.data)}`);
      }

      const users = db.readUsers();
      assert.equal(users.length, 3);
      assert.equal(users[0].fullName, "<script>alert('xss')</script>");
      assert.equal(users[1].fullName, "Robert'); DROP TABLE users;--");
    });

    await runTest('Suite 3: Fuzzing', '3.5: Extremely long strings (10,000 characters)', async () => {
      resetDatabaseTo([]);
      emailService.sendOTPEmail = async () => ({ messageId: 'ok' });

      const longName = 'A'.repeat(5000);
      const longPassword = 'P'.repeat(1000) + '!1';
      const email = 'long_string_user@example.com';

      const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: longName,
        email: email,
        password: longPassword
      });

      assert.equal(res.status, 200);
      const users = db.readUsers();
      assert.equal(users.length, 1);
      assert.equal(users[0].fullName.length, 5000);
    });

    // =========================================================================
    // SUITE 4: BROKEN SMTP RESILIENCE
    // =========================================================================
    console.log('\n--- SUITE 4: Broken SMTP Resilience Under Stress ---');

    await runTest('Suite 4: SMTP Resilience', '4.1: Repeated SMTP failure across 25 consecutive registration requests', async () => {
      resetDatabaseTo([]);
      let failureCount = 0;
      emailService.sendOTPEmail = async () => {
        failureCount++;
        const err = new Error('SMTP connection refused: connect ECONNREFUSED 127.0.0.1:465');
        err.code = 'ECONNREFUSED';
        throw err;
      };

      for (let i = 0; i < 25; i++) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `SMTP Fail User ${i}`,
          email: `smtp_fail_${i}@example.com`,
          password: `Password${i}!123`
        });

        assert.equal(res.status, 500, `Expected 500 on SMTP error, got ${res.status}`);
        assert.equal(res.data.success, false);
        assert.equal(res.data.error, 'Server error during registration.');
      }

      assert.equal(failureCount, 25, 'Expected 25 SMTP failure attempts');
      const users = db.readUsers();
      assert.equal(users.length, 0, `Database must contain ZERO users after SMTP failures, found: ${users.length}`);
    });

    await runTest('Suite 4: SMTP Resilience', '4.2: Broken SMTP during re-registration of existing unverified user', async () => {
      resetDatabaseTo([{
        id: 'initial-unverified',
        fullName: 'Unverified Prior',
        email: 'unverified_smtp@example.com',
        password: 'hashed-password-prior',
        role: 'customer',
        isVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      emailService.sendOTPEmail = async () => {
        throw new Error('SMTP 535 Bad Credentials');
      };

      const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'New Unverified Attempt',
        email: 'unverified_smtp@example.com',
        password: 'NewPassword123!'
      });

      assert.equal(res.status, 500);
      assert.equal(res.data.success, false);

      const users = db.readUsers();
      console.log(`\n       -> Users in DB after failed re-reg: ${users.length}`);
      // Requirement AC1: "Broken SMTP configuration returns 500 error and does NOT add user to users.json."
      // The prior unverified user was pruned at line 27, and new user was not added.
      assert.equal(users.length, 0, 'No user should remain in users.json if SMTP fails');
    });

    await runTest('Suite 4: SMTP Resilience', '4.3: Registration attempt on verified user with broken SMTP', async () => {
      resetDatabaseTo([{
        id: 'verified-prior',
        fullName: 'Verified Prior',
        email: 'verified_smtp@example.com',
        password: 'hashed-password-prior',
        role: 'customer',
        isVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      let emailAttempted = false;
      emailService.sendOTPEmail = async () => {
        emailAttempted = true;
        throw new Error('SMTP Crash');
      };

      const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'Attacker Name',
        email: 'verified_smtp@example.com',
        password: 'NewPassword123!'
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.error, 'Email is already registered.');
      assert.equal(emailAttempted, false, 'SMTP must not be attempted for verified user');

      const users = db.readUsers();
      assert.equal(users.length, 1);
      assert.equal(users[0].id, 'verified-prior');
    });

    // =========================================================================
    // SUITE 5: UNVERIFIED RE-REGISTRATION STRESS CYCLES
    // =========================================================================
    console.log('\n--- SUITE 5: Unverified Re-Registration Stress Cycles ---');

    await runTest('Suite 5: Re-Registration', '5.1: 20 sequential re-registration cycles with same unverified email', async () => {
      resetDatabaseTo([]);
      let otps = [];
      emailService.sendOTPEmail = async (to, { otpCode }) => {
        otps.push(otpCode);
        return { messageId: 'ok' };
      };

      const email = 'cycler@example.com';

      for (let i = 0; i < 20; i++) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `Cycle User ${i}`,
          email: email,
          password: `CyclePassword${i}!123`
        });

        assert.equal(res.status, 200, `Cycle ${i} failed`);
        const currentUsers = db.readUsers();
        assert.equal(currentUsers.length, 1, `Cycle ${i} leaked users! Found: ${currentUsers.length}`);
        assert.equal(currentUsers[0].fullName, `Cycle User ${i}`);
        assert.equal(currentUsers[0].isVerified, false);
      }

      assert.equal(otps.length, 20, 'Expected 20 OTP dispatches across cycles');
    });

    await runTest('Suite 5: Re-Registration', '5.2: 10 alternating casing re-registration cycles', async () => {
      resetDatabaseTo([]);
      emailService.sendOTPEmail = async () => ({ messageId: 'ok' });

      const casings = [
        'Alternating@Domain.Com',
        'ALTERNATING@DOMAIN.COM',
        'alternating@domain.com',
        'AlTeRnAtInG@dOmAiN.cOm',
        'ALTERNATING@domain.com',
        'alternating@DOMAIN.COM',
        'Alternating@DOMAIN.COM',
        'aLtErNaTiNg@DoMaIn.CoM',
        'ALTERNATING@Domain.com',
        'alternating@Domain.Com'
      ];

      for (let i = 0; i < casings.length; i++) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `Casing User ${i}`,
          email: casings[i],
          password: `Password${i}!123`
        });

        assert.equal(res.status, 200, `Casing cycle ${i} (${casings[i]}) failed`);
        const currentUsers = db.readUsers();
        assert.equal(currentUsers.length, 1, `Casing cycle ${i} leaked duplicate users! Count: ${currentUsers.length}`);
        assert.equal(currentUsers[0].email, 'alternating@domain.com', 'Stored email must be lowercase');
        assert.equal(currentUsers[0].fullName, `Casing User ${i}`);
      }
    });

    await runTest('Suite 5: Re-Registration', '5.3: Verification after stress cycle locks account against further registrations', async () => {
      resetDatabaseTo([]);
      let latestOtp = null;
      emailService.sendOTPEmail = async (to, { otpCode }) => {
        latestOtp = otpCode;
        return { messageId: 'ok' };
      };

      const email = 'lock_test@example.com';
      let lastSessionCookie = null;

      // 5 unverified cycles
      for (let i = 0; i < 5; i++) {
        const res = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
          fullName: `Lock Test ${i}`,
          email: email,
          password: `Password${i}!123`
        });
        assert.equal(res.status, 200);
        lastSessionCookie = res.cookie;
      }

      // Verify OTP with the latest session
      const verifyRes = await httpRequest(serverUrl, 'POST', '/api/auth/verify-otp', {
        email: email,
        otp: latestOtp
      }, lastSessionCookie);

      assert.equal(verifyRes.status, 200, `Verification failed: ${JSON.stringify(verifyRes.data)}`);
      assert.equal(verifyRes.data.success, true);

      const users = db.readUsers();
      assert.equal(users.length, 1);
      assert.equal(users[0].isVerified, true, 'User must now be verified');

      // Attempt 6th registration — MUST be blocked with 400
      const blockedRes = await httpRequest(serverUrl, 'POST', '/api/auth/register', {
        fullName: 'Lock Test Imposter',
        email: email,
        password: 'ImposterPassword!'
      });

      assert.equal(blockedRes.status, 400, 'Subsequent registration must be rejected with 400');
      assert.equal(blockedRes.data.error, 'Email is already registered.');
      assert.equal(db.readUsers().length, 1, 'No new users should be added');
    });

    // =========================================================================
    // SUITE 2B: RESET PASSWORD CASE-INSENSITIVITY
    // =========================================================================
    console.log('\n--- SUITE 2B: Forgot & Reset Password Case-Insensitivity ---');

    await runTest('Suite 2: Case-Insensitivity', '2.6: Forgot password mixed-case email followed by lowercase reset-password', async () => {
      resetDatabaseTo([{
        id: 'reset-user-id',
        fullName: 'Reset User',
        email: 'reset.user@example.com',
        password: 'hashed-old-password',
        role: 'customer',
        isVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]);

      let capturedResetOtp = null;
      emailService.sendOTPEmail = async (to, { otpCode }) => {
        capturedResetOtp = otpCode;
        return { messageId: 'ok' };
      };

      // 1. Forgot password with MixedCase
      const forgotRes = await httpRequest(serverUrl, 'POST', '/api/auth/forgot-password', {
        email: 'Reset.User@Example.Com'
      });
      assert.equal(forgotRes.status, 200);
      assert.ok(capturedResetOtp);
      const sessionCookie = forgotRes.cookie;

      // 2. Verify OTP with MixedCase (since verifyOtp currently requires exact match)
      const verifyRes = await httpRequest(serverUrl, 'POST', '/api/auth/verify-otp', {
        email: 'Reset.User@Example.Com',
        otp: capturedResetOtp
      }, sessionCookie);
      assert.equal(verifyRes.status, 200);

      // 3. Reset password with lowercase email: reset.user@example.com
      const resetRes = await httpRequest(serverUrl, 'POST', '/api/auth/reset-password', {
        email: 'reset.user@example.com',
        password: 'BrandNewPassword123!'
      }, sessionCookie);

      console.log(`\n       -> Reset password with lowercase: HTTP ${resetRes.status} (${JSON.stringify(resetRes.data)})`);
      if (resetRes.status === 400 && resetRes.data.error === 'Invalid or expired password reset session.') {
        throw new Error(`CASE SENSITIVITY BUG IN RESET-PASSWORD: sessionOtpData.email !== email rejected lowercase email matching mixed-case session!`);
      }
      assert.equal(resetRes.status, 200);
    });

    // =========================================================================
    // SUITE 1B: DUPLICATE RECORD ORPHANING AFTER CONCURRENCY
    // =========================================================================
    console.log('\n--- SUITE 1B: Duplicate Record Consequences ---');

    await runTest('Suite 1: Concurrency', '1.4: deleteUser only removes first duplicate, leaving second duplicate as orphan', async () => {
      // Simulate state left after concurrent registration race condition:
      resetDatabaseTo([
        { id: 'dup-1', email: 'dup@example.com', fullName: 'Dup 1', isVerified: false },
        { id: 'dup-2', email: 'dup@example.com', fullName: 'Dup 2', isVerified: false }
      ]);

      const deleted = db.deleteUser('dup@example.com');
      assert.equal(deleted, true);

      const remaining = db.readUsers().filter(u => u.email === 'dup@example.com');
      console.log(`\n       -> Remaining duplicate records after deleteUser: ${remaining.length}`);
      if (remaining.length > 0) {
        throw new Error(`ORPHAN DUPLICATE PERSISTS: deleteUser only deleted the first matching index, leaving ${remaining.length} duplicate record(s) in users.json!`);
      }
      assert.equal(remaining.length, 0);
    });

  } finally {
    // Restore mocks and database
    emailService.sendOTPEmail = originalSendOTPEmail;
    server.close();
    restoreDatabase();
  }

  // Print Summary
  console.log('\n===============================================================');
  console.log(`SUMMARY: Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
  console.log('===============================================================');

  if (summary.findings.length > 0) {
    console.log('\n--- FINDINGS / FAILURE DETAILS ---');
    for (const f of summary.findings) {
      console.log(`\n❌ [${f.suite}] ${f.test}`);
      console.log(`   Error: ${f.error}`);
    }
  }

  return summary.failed === 0;
}

if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { main };

