# Handoff Report: Auth & DB Codebase Survey

## 1. Observation

### 1.1 `server/controllers/authController.js` Analysis

#### A. Registration Flow (`register`)
- **File**: `server/controllers/authController.js`, lines 14–57
- **Direct Code**:
  ```javascript
  14: exports.register = async (req, res) => {
  15:   try {
  16:     const { fullName, email, password, role } = req.body;
  17:     if (!fullName || !email || !password) {
  18:       return res.status(400).json({ success: false, error: 'All fields are required.' });
  19:     }
  20: 
  21:     const existingUser = db.findUserByEmail(email);
  22:     if (existingUser) {
  23:       return res.status(400).json({ success: false, error: 'Email is already registered.' });
  24:     }
  25: 
  26:     const hashedPassword = await bcrypt.hash(password, 12);
  27: 
  28:     const newUser = {
  29:       id: generateUUID(),
  30:       fullName,
  31:       email: email.toLowerCase(),
  32:       password: hashedPassword,
  33:       role: role || 'customer',
  34:       isVerified: false,
  35:       createdAt: new Date().toISOString(),
  36:       updatedAt: new Date().toISOString()
  37:     };
  38: 
  39:     db.createUser(newUser);
  40: 
  41:     // Generate OTP and send email
  42:     const otpData = otpService.createOTPData(email, 'verification');
  43:     req.session.otpData = otpData; // Store in session
  44: 
  45:     await emailService.sendOTPEmail(email, {
  46:       userName: fullName,
  47:       otpCode: otpData.code,
  48:       purpose: 'verification',
  49:       expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5
  50:     });
  51: 
  52:     res.json({ success: true, message: 'OTP sent to your email.' });
  53:   } catch (error) {
  54:     console.error('Register error:', error);
  55:     res.status(500).json({ success: false, error: 'Server error during registration.' });
  56:   }
  57: };
  ```
- **Observations**:
  1. `db.createUser(newUser)` is executed at **line 39**, *before* `emailService.sendOTPEmail` is called at **line 45**.
  2. If `emailService.sendOTPEmail` throws an error (e.g. SMTP connection timeout, authentication failure, network error), the exception is caught on line 53 and HTTP 500 is returned.
  3. However, `newUser` was already written to `server/db/users.json`. The user is stuck in `users.json` with `isVerified: false`.
  4. At lines 21–24, `db.findUserByEmail(email)` does not inspect `existingUser.isVerified`. It rejects any existing record unconditionally with HTTP 400: `'Email is already registered.'`.
  5. Thus, if email delivery fails, the user is permanently locked out from registering with that email, cannot verify the account, and cannot log in (`login` on line 134 rejects unverified users with HTTP 403).

#### B. Forgot Password Flow (`forgotPassword`) & `this` Binding
- **File**: `server/controllers/authController.js`, lines 145–148
- **Direct Code**:
  ```javascript
  145: exports.forgotPassword = async (req, res) => {
  146:   req.body.purpose = 'password-reset';
  147:   return this.sendOtp(req, res);
  148: };
  ```
- **Routes Wiring**: `server/routes/auth.js`, line 24:
  ```javascript
  router.post('/forgot-password', otpLimiter, authController.forgotPassword);
  ```
- **Observations**:
  1. In Express routing, middleware and controllers are passed by reference and invoked as bare functions (`fn(req, res, next)`).
  2. In `authController.js`, `exports.forgotPassword` calls `this.sendOtp(req, res)`.
  3. If `forgotPassword` is extracted/destructured (`const { forgotPassword } = require(...)`), or invoked in strict mode or ES modules, or converted to a method/standard function without explicit binding, `this` is `undefined`, triggering:
     `TypeError: Cannot read properties of undefined (reading 'sendOtp')`.
  4. Even in CommonJS where top-level arrow functions capture lexical `this` as `exports`, invoking `this.sendOtp` rather than a direct function reference (`sendOtp` or `exports.sendOtp`) creates a fragile coupling to `this` context that breaks under standard JavaScript function detachment and mocking/testing harnesses.

#### C. Current User Lookup (`getMe`)
- **File**: `server/controllers/authController.js`, lines 175–190
- **Direct Code**:
  ```javascript
  175: exports.getMe = (req, res) => {
  176:   if (!req.session.userId) {
  177:     return res.status(401).json({ success: false, error: 'Not authenticated' });
  178:   }
  179:   
  180:   const users = require('../db/database').readUsers ? require('../db/database').readUsers() : require('fs').readFileSync(require('path').join(__dirname, '../db/users.json'), 'utf8');
  181:   let userList = [];
  182:   try {
  183:       userList = Array.isArray(users) ? users : JSON.parse(users);
  184:   } catch(e){}
  185: 
  186:   const user = userList.find(u => u.id === req.session.userId);
  187:   if (!user) return res.status(401).json({ success: false, error: 'User not found' });
  188: 
  189:   res.json({ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } });
  190: };
  ```
- **Observations**:
  1. Line 180 attempts to check `require('../db/database').readUsers`. Because `database.js` did not export `readUsers`, it fell back to raw synchronous file I/O: `require('fs').readFileSync(require('path').join(__dirname, '../db/users.json'), 'utf8')`.
  2. `authController.js` already requires `const db = require('../db/database');` at line 3, making dynamic inline `require(...)` redundant and anti-pattern.
  3. The raw file read completely bypasses the database abstraction layer.

#### D. Other Controller Methods
- `sendOtp` (lines 59–85): Reads `db.findUserByEmail(email)`. For `purpose === 'password-reset'`, avoids email enumeration by returning `{ success: true, message: 'If the email exists, an OTP has been sent.' }` when user is absent. Generates OTP, stores in `req.session.otpData`, dispatches `emailService.sendOTPEmail`.
- `verifyOtp` (lines 87–120): Validates submitted OTP against `req.session.otpData`. If valid and `purpose === 'verification'`, runs `db.updateUser(email, { isVerified: true })`, queries `db.findUserByEmail(email)`, assigns `req.session.userId = user.id`, deletes `req.session.otpData`, and returns user session object `{ fullName, email, role }`.
- `login` (lines 122–143): Finds user by email via `db.findUserByEmail(email)`. Compares bcrypt hash. Rejects unverified user with HTTP 403: `{ success: false, error: 'Please verify your email first.', needsVerification: true }`. Sets `req.session.userId = user.id`.
- `resetPassword` (lines 150–168): Validates `req.session.otpData.verified === true` and `purpose === 'password-reset'`. Hashes new password (`bcrypt.hash(password, 12)`), updates record via `db.updateUser(email, { password: hashedPassword })`, clears `otpData`.
- `logout` (lines 170–173): Calls `req.session.destroy()`.

---

### 1.2 `server/db/database.js` Analysis

- **File**: `server/db/database.js`, lines 1–43
- **Direct Code**:
  ```javascript
  1: // Simple JSON-file-based database utility
  2: const fs = require('fs');
  3: const path = require('path');
  4: 
  5: const DB_PATH = path.join(__dirname, 'users.json');
  6: 
  7: // Ensure file exists
  8: if (!fs.existsSync(DB_PATH)) {
  9:   fs.writeFileSync(DB_PATH, '[]', 'utf8');
  10: }
  11: 
  12: function readUsers() {
  13:   const data = fs.readFileSync(DB_PATH, 'utf8');
  14:   return JSON.parse(data);
  15: }
  16: 
  17: function writeUsers(users) {
  18:   fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf8');
  19: }
  20: 
  21: function findUserByEmail(email) {
  22:   const users = readUsers();
  23:   return users.find(u => u.email.toLowerCase() === email.toLowerCase());
  24: }
  25: 
  26: function createUser(userData) {
  27:   const users = readUsers();
  28:   users.push(userData);
  29:   writeUsers(users);
  30:   return userData;
  31: }
  32: 
  33: function updateUser(email, updates) {
  34:   const users = readUsers();
  35:   const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  36:   if (index === -1) return null;
  37:   users[index] = { ...users[index], ...updates };
  38:   writeUsers(users);
  39:   return users[index];
  40: }
  41: 
  42: module.exports = { findUserByEmail, createUser, updateUser };
  ```
- **Observations**:
  1. `readUsers()` exists on line 12 as an internal helper, but line 42 exports only `{ findUserByEmail, createUser, updateUser }`. `readUsers` is NOT exported.
  2. No `deleteUser(email)` function exists in `database.js`.
  3. All reads and writes are synchronous (`fs.readFileSync`, `fs.writeFileSync`).
  4. Lookup is case-insensitive for email (`u.email.toLowerCase() === email.toLowerCase()`).

---

### 1.3 `server/db/users.json` Schema & `isVerified` Usage

- **File**: `server/db/users.json`
- **Sample Existing Record**:
  ```json
  [
    {
      "id": "86929117-0bf7-450c-b3e1-75fd92b073ba",
      "fullName": "Test",
      "email": "test@example.com",
      "password": "$2b$12$HCPMCtFKB0vTaWHxP5oNhuy58oI825Tvr.Jty60ovOL3aH2d.zc.i",
      "role": "customer",
      "isVerified": false,
      "createdAt": "2026-09-24T08:29:24.273Z",
      "updatedAt": "2026-09-24T08:29:24.273Z"
    }
  ]
  ```
- **Schema Fields**:
  - `id` (String): UUID format
  - `fullName` (String): Display name
  - `email` (String): Normalized to lowercase
  - `password` (String): Bcrypt hash (12 salt rounds)
  - `role` (String): Role (`'customer'`, `'professional'`)
  - `isVerified` (Boolean): Verification flag (`true` or `false`)
  - `createdAt` (String): ISO 8601 timestamp
  - `updatedAt` (String): ISO 8601 timestamp

- **Usage of `isVerified` across the system**:
  1. In `register`: Initially set to `false`.
  2. In `verifyOtp`: Updated to `true` upon valid OTP match.
  3. In `login`: Checked; if `false`, blocks login and returns HTTP 403 `{ success: false, error: 'Please verify your email first.', needsVerification: true }`.
  4. In `authUI.js`: When receiving `needsVerification: true`, triggers `authService.sendOtp` and opens OTP verification modal.
  5. In current `register` duplicate check: **Ignored!** A record with `isVerified: false` blocks re-registration just as a verified user would.

---

## 2. Logic Chain

1. **Premise 1 (From Section 1.1 A)**: `db.createUser(newUser)` is called at line 39 before `emailService.sendOTPEmail(...)` at line 45.
2. **Premise 2 (From Section 1.1 A)**: If email sending fails, the function throws and returns 500, but the newly created user record remains in `users.json` with `isVerified: false`.
3. **Premise 3 (From Section 1.1 A)**: Line 21–24 rejects any email that exists in the database regardless of `isVerified`.
4. **Deduction 1**: The registration flow is non-atomic. A failed email delivery corrupts the database state by leaving a "zombie" unverified user that cannot be verified or re-registered.
5. **Resolution 1**: In `register`, checking for duplicates must differentiate between `isVerified: true` (which should return 400) and `isVerified: false` (which should delete the stale record via `deleteUser(email)` and allow re-registration). Furthermore, the user must NOT be saved via `db.createUser` until `await emailService.sendOTPEmail` has successfully resolved. If email sending fails, the catch block catches the error and the DB remains untouched.

6. **Premise 4 (From Section 1.1 B)**: Express routes decouple method handlers from their objects. When calling `this.sendOtp`, `this` is context-dependent and fails if `this` is not the exports object (e.g. unbound, strict mode, destructuring, or standard function wrapper).
7. **Deduction 2**: Calling `this.sendOtp` is fragile and leads to unbound runtime errors.
8. **Resolution 2**: In `authController.js`, `forgotPassword` should call `exports.sendOtp(req, res)` directly or call an internal shared `sendOtpHandler(req, res)` that does not rely on `this`.

9. **Premise 5 (From Section 1.1 C & 1.2)**: `database.js` defines `readUsers()` but omits it from `module.exports`. As a result, `getMe` implemented an inline `fs.readFileSync` fallback.
10. **Deduction 3**: `getMe` violates data access layering due to an incomplete export list in `database.js`.
11. **Resolution 3**: Export `readUsers` (and add `deleteUser`) in `database.js`, and simplify `getMe` in `authController.js` to use `db.readUsers()`.

---

## 3. Caveats

1. **Email Service Dependency**: `emailService.js` is configured to connect to Gmail SMTP using credentials in `.env`. During offline tests or broken credential tests, `sendOTPEmail` will throw an error. This behavior must be properly stubbed or mocked in test suites to verify atomic rollback vs success without hitting external rate limits.
2. **Session Dependence**: `verifyOtp` and `resetPassword` depend on `req.session.otpData`. Tests verifying the full flow must maintain session cookies across requests (e.g., using `supertest.agent`).
3. **Concurrency on `users.json`**: `database.js` uses synchronous file I/O (`fs.readFileSync`, `fs.writeFileSync`). In high-concurrency environments, rapid simultaneous writes could cause race conditions. For the current single-instance node application, this simple model suffices as long as reads and writes remain synchronous.

---

## 4. Conclusion & Concrete Implementation Requirements

### 4.1 Changes for `server/db/database.js`

1. **Export `readUsers`**: Add `readUsers` to `module.exports`.
2. **Implement `deleteUser(email)`**:
   ```javascript
   function deleteUser(email) {
     if (!email) return false;
     const users = readUsers();
     const lowerEmail = email.toLowerCase();
     const initialLength = users.length;
     const filteredUsers = users.filter(u => u.email.toLowerCase() !== lowerEmail);
     if (filteredUsers.length !== initialLength) {
       writeUsers(filteredUsers);
       return true;
     }
     return false;
   }
   ```
3. **Make `readUsers()` defensive**:
   Wrap in `try/catch` with fallback to `[]` if file read or parse fails:
   ```javascript
   function readUsers() {
     try {
       if (!fs.existsSync(DB_PATH)) {
         fs.writeFileSync(DB_PATH, '[]', 'utf8');
         return [];
       }
       const data = fs.readFileSync(DB_PATH, 'utf8');
       return JSON.parse(data);
     } catch (err) {
       console.error('Error reading users database:', err);
       return [];
     }
   }
   ```
4. **Update `module.exports`**:
   ```javascript
   module.exports = {
     findUserByEmail,
     createUser,
     updateUser,
     deleteUser,
     readUsers
   };
   ```

### 4.2 Changes for `server/controllers/authController.js`

1. **Refactor `register` (Atomic, Email-First & Stale Unverified Handling)**:
   - Check if user exists.
   - If `existingUser?.isVerified === true`: return 400 `'Email is already registered.'`.
   - If `existingUser && !existingUser.isVerified`: call `db.deleteUser(email)` to prune stale registration.
   - Generate OTP data and store in session:
     ```javascript
     const otpData = otpService.createOTPData(email, 'verification');
     req.session.otpData = otpData;
     ```
   - Send OTP email **BEFORE** creating the database record:
     ```javascript
     await emailService.sendOTPEmail(email, {
       userName: fullName,
       otpCode: otpData.code,
       purpose: 'verification',
       expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5
     });
     ```
   - Only after `sendOTPEmail` succeeds, hash password and persist user:
     ```javascript
     const hashedPassword = await bcrypt.hash(password, 12);
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
     ```
   - Return `{ success: true, message: 'OTP sent to your email.' }`.
   - If `sendOTPEmail` fails, error caught by catch block, returns 500 `'Server error during registration.'`, and `newUser` is never persisted to `users.json`.

2. **Fix `forgotPassword` (`this` binding)**:
   Change:
   ```javascript
   exports.forgotPassword = async (req, res) => {
     req.body.purpose = 'password-reset';
     return exports.sendOtp(req, res);
   };
   ```
   (Replaces `this.sendOtp` with `exports.sendOtp` or a direct local function reference).

3. **Refactor `getMe`**:
   Replace the raw `fs.readFileSync` check with clean `db.readUsers()`:
   ```javascript
   exports.getMe = (req, res) => {
     if (!req.session.userId) {
       return res.status(401).json({ success: false, error: 'Not authenticated' });
     }
     
     const users = db.readUsers();
     const user = users.find(u => u.id === req.session.userId);
     if (!user) return res.status(401).json({ success: false, error: 'User not found' });

     res.json({
       success: true,
       user: {
         fullName: user.fullName,
         email: user.email,
         role: user.role
       }
     });
   };
   ```

---

## 5. Verification Method

### 5.1 Independent Code Verification
Inspect the modified files:
- Check `server/db/database.js`: Confirm `deleteUser` and `readUsers` are implemented and exported in `module.exports`.
- Check `server/controllers/authController.js`:
  - Verify line order in `register`: `emailService.sendOTPEmail` occurs before `db.createUser`.
  - Verify `existingUser.isVerified` branch in `register`: `db.deleteUser(email)` is called for unverified accounts.
  - Verify `forgotPassword`: `exports.sendOtp` or local `sendOtp` is called instead of `this.sendOtp`.
  - Verify `getMe`: Uses `db.readUsers()` without `fs.readFileSync` or inline `require('fs')`.

### 5.2 Independent Test Commands
Once implemented, run automated Node verification scripts against the endpoints:

1. **Verify Broken SMTP Handling**:
   - Temporarily point `GMAIL_USER` or `GMAIL_APP_PASSWORD` to invalid credentials (or mock `emailService.sendOTPEmail` to throw).
   - Attempt `POST /api/auth/register` with `{"fullName":"Atomic Test","email":"atomic@example.com","password":"Password123!"}`.
   - Assert response status is 500.
   - Inspect `server/db/users.json` via `db.findUserByEmail("atomic@example.com")`: assert result is `undefined`.

2. **Verify Stale Unverified User Cleanup & Re-registration**:
   - Insert dummy unverified user: `db.createUser({ id: "test-id", fullName: "Old", email: "unverified@example.com", password: "hash", role: "customer", isVerified: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })`.
   - Call `register` with `unverified@example.com` (with working SMTP or mocked email).
   - Assert response is 200 `{ success: true, message: 'OTP sent to your email.' }`.
   - Inspect `db.findUserByEmail("unverified@example.com")`: assert `id` is the new UUID and fullName matches new input.

3. **Verify Verified User Conflict**:
   - Insert dummy verified user: `db.createUser({ id: "verified-id", fullName: "Verified", email: "verified@example.com", password: "hash", role: "customer", isVerified: true, ... })`.
   - Call `register` with `verified@example.com`.
   - Assert response status is 400 with `{ success: false, error: 'Email is already registered.' }`.

4. **Verify `forgotPassword` without Crash**:
   - Make a `POST /api/auth/forgot-password` with `{"email":"test@example.com"}`.
   - Confirm handler routes to `sendOtp` without throwing `TypeError: this.sendOtp is not a function`.

5. **Verify `/api/auth/me`**:
   - Establish an authenticated session with `req.session.userId`.
   - Call `GET /api/auth/me`.
   - Assert response status is 200 with `{ success: true, user: { fullName, email, role } }`.

### 5.3 Invalidation Conditions
- If frontend code (`authUI.js`, `authService.js`) requires modification, this assessment is invalidated (violates Requirement R3).
- If changing `register` execution order prevents `verifyOtp` from finding the user in the database after OTP delivery, this assessment is invalidated (saving user upon email success preserves compatibility with `verifyOtp`).
