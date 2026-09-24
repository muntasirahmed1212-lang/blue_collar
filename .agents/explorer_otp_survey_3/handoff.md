# Handoff Report: Email Service & Test Infrastructure Survey

- **Agent**: `explorer_otp_survey_3`
- **Working Directory**: `c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_3`
- **Mission**: Survey Email Service (`emailService.js`), error propagation, Node test infrastructure, and develop a comprehensive testing strategy for the 5 OTP/Registration acceptance criteria.

---

## 1. Observation

### 1.1 Email Service Architecture (`server/services/emailService.js`)
Direct examination of `server/services/emailService.js` (lines 1–45):
- **Transporter Configuration**:
  ```javascript
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
  ```
- **Startup Connection Verification**:
  Lines 16–19 execute connection verification eagerly on module load:
  ```javascript
  transporter.verify()
    .then(() => console.log('✅ Gmail SMTP connected'))
    .catch(err => console.error('❌ Gmail SMTP error:', err.message));
  ```
  In this environment, execution outputs verbatim:
  `❌ Gmail SMTP error: 535-5.7.8 Username and Password not accepted. For more information, go to 535 5.7.8 https://support.google.com/mail/?p=BadCredentials - gsmtp`
- **Email Generation & Sending (`sendOTPEmail`)**:
  Lines 21–42 define:
  ```javascript
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
        'X-Priority': '3',
        'X-Mailer': 'BlueCollar Connect Mailer'
      }
    };

    return transporter.sendMail(mailOptions);
  }
  ```
- **Export Scope**: Only `{ sendOTPEmail }` is exported (`module.exports = { sendOTPEmail };`). The `transporter` instance is private to the module.

### 1.2 Error Handling & Propagation
- **In `emailService.js`**: `sendOTPEmail` directly returns `transporter.sendMail(mailOptions)`. It does NOT catch errors. If SMTP fails (invalid auth, connection refused, network timeout), the returned Promise rejects with the raw nodemailer Error.
- **In `authController.js` (`register`, lines 14–57)**:
  ```javascript
  // Line 39: Database mutation occurs BEFORE email is attempted!
  db.createUser(newUser);

  // Line 45: Email delivery attempted
  await emailService.sendOTPEmail(email, { ... });

  res.json({ success: true, message: 'OTP sent to your email.' });
  ```
  When `sendOTPEmail` rejects:
  The catch block at lines 53–56 logs `Register error:` and returns HTTP 500 `{ success: false, error: 'Server error during registration.' }`.
  However, `newUser` has ALREADY been written to `server/db/users.json` with `isVerified: false`.
  On subsequent registration attempts with the same email, lines 21–24 execute:
  ```javascript
  const existingUser = db.findUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ success: false, error: 'Email is already registered.' });
  }
  ```
  The user is permanently locked out because `findUserByEmail` checks only for existence, ignoring `isVerified`.
- **In `authController.js` (`forgotPassword`, lines 145–148)**:
  ```javascript
  exports.forgotPassword = async (req, res) => {
    req.body.purpose = 'password-reset';
    return this.sendOtp(req, res);
  };
  ```
  When invoked via Express route `router.post('/forgot-password', otpLimiter, authController.forgotPassword)`, Express calls `fn(req, res, next)` unbound.
  Empirical run with Node.js confirmed verbatim error:
  `TypeError: this.sendOtp is not a function at exports.forgotPassword (server/controllers/authController.js:147:15)`
  Express default error handler renders an HTML 500 error page. Because the frontend (`js/services/authService.js:16`) calls `response.json()`, it throws `SyntaxError: Unexpected token '<'` and displays `"Network error. Please try again."`.
- **In `authController.js` (`getMe`, lines 175–190)**:
  ```javascript
  const users = require('../db/database').readUsers 
    ? require('../db/database').readUsers() 
    : require('fs').readFileSync(require('path').join(__dirname, '../db/users.json'), 'utf8');
  ```
  Direct inspection of `server/db/database.js` (lines 42) shows:
  `module.exports = { findUserByEmail, createUser, updateUser };`
  - `readUsers` exists as an internal helper at line 12 but is NOT exported.
  - `deleteUser(email)` does NOT exist anywhere in `database.js`.

### 1.3 Repository Test Infrastructure (`package.json`, `tests/`)
- **Node Runtime**: Node.js `v24.19.0` is installed.
- **Dependencies (`package.json`)**:
  - `dependencies`: `bcryptjs`, `cors`, `dotenv`, `express`, `express-rate-limit`, `express-session`, `helmet`, `nodemailer`.
  - `devDependencies`: None (zero external test frameworks installed; no jest, mocha, or supertest).
  - Scripts: `"test": "echo \"Error: no test specified\" && exit 1"`.
- **Existing Test Suite (`tests/`)**:
  Contains 7 standalone Node scripts (`tests/e2e-login-modal.js`, `tests/adversarial-stress-harness.js`, etc.) that execute via `node tests/<script>.js` with zero npm dependencies.
- **Node v24 Capabilities**:
  Node 24 includes built-in `node:test`, `node:assert`, and global `fetch()`. It also supports direct module function mocking in CommonJS.
- **Server Startup Constraints**:
  `server.js` executes `app.listen(PORT, ...)` immediately upon module load and does NOT export `app`. Re-requiring `server.js` in a test creates port conflicts with any running instance. Tests should instantiate an Express instance mounting `server/routes/auth` on an ephemeral port (`port 0`).

---

## 2. Logic Chain

1. **Root Cause of Registration Lockout**:
   - In `authController.register`, `db.createUser(newUser)` is executed before `await emailService.sendOTPEmail(...)`.
   - When SMTP fails (as it currently does with invalid Gmail credentials in `.env`), the Promise rejects and triggers the 500 catch block.
   - Because no rollback occurs, an unverified record remains persisted in `users.json`.
   - On retry, `db.findUserByEmail(email)` encounters this unverified record and aborts with HTTP 400 `'Email is already registered.'`.
   - *Inference*: To make registration atomic, `emailService.sendOTPEmail` MUST be awaited *before* `db.createUser`. If an unverified user record already exists prior to registration, `db.deleteUser(email)` must remove the stale record first.

2. **Root Cause of `forgotPassword` Crash**:
   - `exports.forgotPassword` calls `this.sendOtp(req, res)`.
   - Express router invokes route callbacks as detached functions (`fn(req, res, next)`). In this execution context, `this` is not bound to `exports`.
   - *Inference*: Changing `this.sendOtp(req, res)` to `exports.sendOtp(req, res)` eliminates the `this` binding dependency and resolves the crash completely.

3. **Root Cause of Database Layer Leak in `getMe`**:
   - `authController.getMe` relies on a ternary checking `db.readUsers ? db.readUsers() : fs.readFileSync(...)` because `database.js` neglected to export `readUsers`.
   - *Inference*: Exporting `readUsers` and adding `deleteUser(email)` to `server/db/database.js` allows `getMe` to cleanly use `const users = db.readUsers();` and provides the necessary deletion hook for unverified re-registration.

4. **Zero-Dependency Test Infrastructure Viability**:
   - Node `v24.19.0` provides `node:test`, `node:assert`, and native `fetch`.
   - In CommonJS, `const emailService = require('../server/services/emailService')` exposes the mutable exports object `{ sendOTPEmail }`.
   - Replacing `emailService.sendOTPEmail` at runtime allows tests to simulate broken SMTP (throwing an Error) and successful SMTP (capturing sent email parameters) without real network calls or third-party mocking libraries.
   - An ephemeral Express test server (`app.listen(0)`) allows isolated, parallel-safe HTTP requests against `/api/auth/*`.

---

## 3. Caveats

1. **Rate Limiting (`otpLimiter`)**:
   `server/routes/auth.js` attaches `otpLimiter` (max 3 requests per 15 minutes) to `/send-otp` and `/forgot-password`. If automated test suites make more than 3 requests to these endpoints against the same IP, `express-rate-limit` will return HTTP 429. The test suite design isolates requests or calls `otpLimiter.resetKey('127.0.0.1')` between runs.
2. **Password Hashing Latency**:
   `bcrypt.hash(password, 12)` is computationally intensive (~100–150ms per call). A test suite executing 10+ registrations sequentially will take ~1.5–2 seconds. Timeouts should be at least 10,000ms.
3. **Database File State**:
   Because `server/db/database.js` operates directly on `server/db/users.json`, tests that create or delete users mutate this file. The test runner MUST snapshot `users.json` before test execution and restore it in an `afterAll`/`finally` block.

---

## 4. Conclusion

The Registration/OTP defects are isolated to 2 files: `server/controllers/authController.js` and `server/db/database.js`.

### Recommended Code Modifications

#### A. `server/db/database.js`
Add `deleteUser(email)` and export both `deleteUser` and `readUsers`:
```javascript
function deleteUser(email) {
  const users = readUsers();
  const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (index === -1) return false;
  users.splice(index, 1);
  writeUsers(users);
  return true;
}

module.exports = { findUserByEmail, createUser, updateUser, deleteUser, readUsers };
```

#### B. `server/controllers/authController.js`
1. **Atomic `register` (Email First + Clean Stale)**:
   ```javascript
   exports.register = async (req, res) => {
     try {
       const { fullName, email, password, role } = req.body;
       if (!fullName || !email || !password) {
         return res.status(400).json({ success: false, error: 'All fields are required.' });
       }

       const existingUser = db.findUserByEmail(email);
       if (existingUser) {
         if (existingUser.isVerified) {
           return res.status(400).json({ success: false, error: 'Email is already registered.' });
         }
         // Unverified user already exists: clean up/delete stale record to allow re-registration
         db.deleteUser(email);
       }

       const hashedPassword = await bcrypt.hash(password, 12);

       // Generate OTP and store in session
       const otpData = otpService.createOTPData(email, 'verification');
       req.session.otpData = otpData;

       // Attempt email delivery FIRST before database persistence
       await emailService.sendOTPEmail(email, {
         userName: fullName,
         otpCode: otpData.code,
         purpose: 'verification',
         expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5
       });

       // Email succeeded -> persist user record
       const newUser = {
         id: generateUUID(),
         fullName,
         email: email.toLowerCase(),
         password: hashedPassword,
         role: role || 'customer',
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
   ```

2. **Fix `forgotPassword` Binding**:
   ```javascript
   exports.forgotPassword = async (req, res) => {
     req.body.purpose = 'password-reset';
     return exports.sendOtp(req, res);
   };
   ```

3. **Refactor `getMe`**:
   ```javascript
   exports.getMe = (req, res) => {
     if (!req.session.userId) {
       return res.status(401).json({ success: false, error: 'Not authenticated' });
     }

     const users = db.readUsers();
     const user = users.find(u => u.id === req.session.userId);
     if (!user) return res.status(401).json({ success: false, error: 'User not found' });

     res.json({ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } });
   };
   ```

---

## 5. Verification Method & Test Strategy

### 5.1 Test Architecture
Create a dedicated automated test suite at `tests/test-registration-otp.js` and add `"test": "node tests/test-registration-otp.js"` to `package.json`.

The test runner will:
1. Snapshot `server/db/users.json` into memory.
2. Spin up an Express test server on ephemeral port `0` with `session` and `authRoutes`.
3. Intercept `emailService.sendOTPEmail` to toggle between SMTP failure and mock success.
4. Execute tests covering all 5 Acceptance Criteria.
5. Restore `server/db/users.json` in a `finally` block and shut down the test server.

### 5.2 Test Blueprint for the 5 Acceptance Criteria

```javascript
/**
 * tests/test-registration-otp.js
 * Automated Verification Suite for OTP Registration Fix
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');

const DB_PATH = path.join(__dirname, '../server/db/users.json');
const authRoutes = require('../server/routes/auth');
const emailService = require('../server/services/emailService');
const db = require('../server/db/database');

async function runTests() {
  console.log('🚀 Starting Registration & OTP Verification Suite...\n');
  const originalUsersJson = fs.readFileSync(DB_PATH, 'utf8');
  const originalSendOTPEmail = emailService.sendOTPEmail;

  let testServer, baseUrl;
  let sentEmails = [];

  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }));
  app.use('/api/auth', authRoutes);

  try {
    await new Promise((resolve) => {
      testServer = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${testServer.address().port}/api/auth`;
        resolve();
      });
    });

    // ─────────────────────────────────────────────────────────────
    // AC1: Broken SMTP -> 500 & database left clean
    // ─────────────────────────────────────────────────────────────
    console.log('Testing AC1: Broken SMTP -> 500 & database left clean...');
    const brokenEmail = 'broken-smtp@test.com';
    db.deleteUser(brokenEmail);

    emailService.sendOTPEmail = async () => {
      throw new Error('SMTP connection error: Bad Credentials');
    };

    const res1 = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Broken User', email: brokenEmail, password: 'Password123!' })
    });
    const data1 = await res1.json();

    assert.equal(res1.status, 500, 'Expected status 500 when SMTP fails');
    assert.equal(data1.success, false);
    assert.equal(data1.error, 'Server error during registration.');
    assert.equal(db.findUserByEmail(brokenEmail), undefined, 'Database MUST NOT contain user on SMTP failure');
    console.log('  ✅ AC1 Passed: Returned 500 and left database clean\n');

    // ─────────────────────────────────────────────────────────────
    // AC2: Unverified email re-registration -> 200/201 success & stale record overwritten/cleaned
    // ─────────────────────────────────────────────────────────────
    console.log('Testing AC2: Unverified email re-registration...');
    const unverifiedEmail = 'stale-unverified@test.com';
    db.deleteUser(unverifiedEmail);

    // Seed stale unverified record
    db.createUser({
      id: 'stale-id-123',
      fullName: 'Old Stale Name',
      email: unverifiedEmail,
      password: 'old-password-hash',
      role: 'customer',
      isVerified: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    emailService.sendOTPEmail = async (to, opts) => {
      sentEmails.push({ to, ...opts });
      return { messageId: 'mock-msg-1' };
    };

    const res2 = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Fresh Name', email: unverifiedEmail, password: 'NewPassword123!' })
    });
    const data2 = await res2.json();

    assert.equal(res2.status, 200, 'Expected status 200 on unverified re-registration');
    assert.equal(data2.success, true);
    assert.equal(data2.message, 'OTP sent to your email.');

    const updatedUser = db.findUserByEmail(unverifiedEmail);
    assert.ok(updatedUser, 'User must exist in database');
    assert.equal(updatedUser.fullName, 'Fresh Name', 'Stale user record must be replaced with fresh data');
    assert.equal(updatedUser.isVerified, false, 'User must remain unverified until OTP check');
    assert.equal(db.readUsers().filter(u => u.email === unverifiedEmail).length, 1, 'Only one record must exist');
    console.log('  ✅ AC2 Passed: Stale record successfully cleaned and re-registered\n');

    // ─────────────────────────────────────────────────────────────
    // AC3: Verified email re-registration -> 400 error 'Email is already registered'
    // ─────────────────────────────────────────────────────────────
    console.log('Testing AC3: Verified email re-registration...');
    const verifiedEmail = 'already-verified@test.com';
    db.deleteUser(verifiedEmail);

    db.createUser({
      id: 'verified-id-456',
      fullName: 'Legitimate Owner',
      email: verifiedEmail,
      password: 'legit-password-hash',
      role: 'customer',
      isVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    const res3 = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Intruder', email: verifiedEmail, password: 'IntruderPassword!' })
    });
    const data3 = await res3.json();

    assert.equal(res3.status, 400, 'Expected status 400 for already verified email');
    assert.equal(data3.success, false);
    assert.equal(data3.error, 'Email is already registered.');

    const untouchedUser = db.findUserByEmail(verifiedEmail);
    assert.equal(untouchedUser.fullName, 'Legitimate Owner', 'Existing verified user MUST NOT be modified');
    console.log('  ✅ AC3 Passed: Verified user registration blocked with 400\n');

    // ─────────────────────────────────────────────────────────────
    // AC4: Forgot password -> triggers sendOtp without crashing
    // ─────────────────────────────────────────────────────────────
    console.log('Testing AC4: Forgot password triggers sendOtp without crashing...');
    sentEmails = [];
    const res4 = await fetch(`${baseUrl}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: verifiedEmail })
    });
    const data4 = await res4.json();

    assert.equal(res4.status, 200, 'Expected status 200 on forgot-password');
    assert.equal(data4.success, true);
    assert.equal(sentEmails.length, 1, 'OTP email must be sent');
    assert.equal(sentEmails[0].to, verifiedEmail);
    assert.equal(sentEmails[0].purpose, 'password-reset');
    console.log('  ✅ AC4 Passed: Forgot password invoked sendOtp without crashing\n');

    // ─────────────────────────────────────────────────────────────
    // AC5: Authenticated GET /api/auth/me -> returns user data
    // ─────────────────────────────────────────────────────────────
    console.log('Testing AC5: Authenticated GET /api/auth/me...');
    // Login to obtain cookie
    const loginEmail = 'me-test@test.com';
    const bcrypt = require('bcryptjs');
    const loginHash = await bcrypt.hash('LoginPass123!', 10);
    db.deleteUser(loginEmail);
    db.createUser({
      id: 'me-user-id-789',
      fullName: 'Profile User',
      email: loginEmail,
      password: loginHash,
      role: 'customer',
      isVerified: true
    });

    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: 'LoginPass123!' })
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie');
    assert.ok(cookie, 'Session cookie must be returned on login');

    // Call /api/auth/me with cookie
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: { 'Cookie': cookie }
    });
    const meData = await meRes.json();
    assert.equal(meRes.status, 200);
    assert.equal(meData.success, true);
    assert.equal(meData.user.fullName, 'Profile User');
    assert.equal(meData.user.email, loginEmail);
    assert.equal(meData.user.password, undefined, 'Password must not be returned');

    // Call /api/auth/me without cookie (unauthenticated)
    const unauthRes = await fetch(`${baseUrl}/me`);
    assert.equal(unauthRes.status, 401);
    console.log('  ✅ AC5 Passed: GET /api/auth/me authenticated data retrieved cleanly\n');

    console.log('🎉 ALL 5 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
  } finally {
    if (testServer) testServer.close();
    fs.writeFileSync(DB_PATH, originalUsersJson, 'utf8');
    emailService.sendOTPEmail = originalSendOTPEmail;
    console.log('🧹 Cleaned up test artifacts and restored users.json.');
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
```

### 5.3 Verification Execution Commands
To independently verify:
```powershell
node tests/test-registration-otp.js
```
Expected output:
- `All 5 AC test suites pass with code 0.`
- `users.json remains intact post-run.`
