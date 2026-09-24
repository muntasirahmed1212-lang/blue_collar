# Specification Mining Report: Auth & OTP API Contracts

**Agent:** `spec_miner_otp_survey_2`  
**Role:** API Spec Miner  
**Date:** 2026-09-24  
**Workspace:** `c:\Users\munta\Downloads\blue_collar`  
**Target Output:** `c:\Users\munta\Downloads\blue_collar\.agents\spec_miner_otp_survey_2\handoff.md`  
**Reference Document:** `c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md` (Section `## 2026-09-24T16:15:16Z`)  

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth API | `POST /api/auth/register` | Registers a new user. Must be atomic: verify SMTP/send OTP *before* saving user; clean unverified duplicate; block verified duplicate. | JSON Body: `{ fullName: string, email: string, password: string }` | `200 OK`: `{ success: true, message: 'OTP sent to your email.' }` | `400`: Missing fields (`'All fields are required.'`); `400`: Verified email conflict (`'Email is already registered.'`); `500`: SMTP delivery failure (DB remains completely unmutated/clean) | `ORIGINAL_REQUEST.md` § R1, `authService.js:20`, `authUI.js:233`, `authController.js:14` |
| 2 | Auth API | `POST /api/auth/forgot-password` | Initiates password reset OTP flow. Must fix `this` binding bug when invoking OTP generation. | JSON Body: `{ email: string }` | `200 OK`: `{ success: true, message: 'OTP sent to your email.' }` (or generic anti-enumeration message if not found) | `400`: Missing email (`'Email is required.'`); `429`: Rate limit exceeded (`'Too many OTP requests. Please try again in 15 minutes.'`); `500`: Server error | `ORIGINAL_REQUEST.md` § R2, `authService.js:48`, `authUI.js:256`, `authController.js:145` |
| 3 | Auth API | `GET /api/auth/me` | Returns current authenticated user profile using session cookie. Must use `db` module instead of `fs.readFileSync`. | Headers: Session cookie (`connect.sid`). No body. | `200 OK`: `{ success: true, user: { fullName: string, email: string, role: string } }` | `401`: Unauthorized / no session (`'Not authenticated'`) or user not found (`'User not found'`) | `ORIGINAL_REQUEST.md` § R2, `authService.js:62`, `authUI.js:381`, `authController.js:175` |
| 4 | Auth API | `POST /api/auth/send-otp` | Sends/resends a 6-digit OTP code for verification or password-reset. | JSON Body: `{ email: string, purpose: 'verification' \| 'password-reset' }` | `200 OK`: `{ success: true, message: 'OTP sent to your email.' }` | `400`: Missing email; `429`: Rate limited (max 3 per 15 min); `500`: SMTP error | `authService.js:34`, `authUI.js:220,369`, `authController.js:59` |
| 5 | Auth API | `POST /api/auth/verify-otp` | Validates submitted 6-digit code against session OTP data. Transitions user to verified/logged-in or reset stage. | JSON Body: `{ email: string, otp: string }` | `200 OK`: Verification: `{ success: true, message: '...', user: {...} }`; Reset: `{ success: true, message: '...' }` | `400`: No OTP in session / expired session (`'No OTP requested or session expired.'`); `400`: Invalid OTP / max attempts exceeded; `500`: Server error | `authService.js:41`, `authUI.js:277`, `authController.js:87` |
| 6 | Auth API | `POST /api/auth/reset-password` | Resets user password following successful OTP verification. | JSON Body: `{ email: string, password: string }` | `200 OK`: `{ success: true, message: 'Password reset successfully.' }` | `400`: Session invalid/unverified (`'Invalid or expired password reset session.'`); `500`: Server error | `authService.js:55`, `authUI.js:310`, `authController.js:150` |
| 7 | Auth API | `POST /api/auth/login` | Authenticates email & password. Sets session cookie. Rejects unverified accounts with `needsVerification`. | JSON Body: `{ email: string, password: string }` | `200 OK`: `{ success: true, user: { fullName, email, role } }` | `400`: Missing inputs; `401`: Invalid credentials; `403`: `{ success: false, error: 'Please verify your email first.', needsVerification: true }`; `429`: Rate limited | `authService.js:27`, `authUI.js:203`, `authController.js:122` |
| 8 | Auth API | `POST /api/auth/logout` | Destroys current express session. | Headers: Session cookie. No body. | `200 OK`: `{ success: true, message: 'Logged out successfully.' }` | N/A | `authService.js:68`, `authUI.js:409`, `authController.js:170` |
| 9 | DB Module | `db.deleteUser(email)` | Deletes a user record by email (case-insensitive) from `users.json`. | Argument: `email: string` | Returns boolean: `true` if user found & deleted, `false` otherwise | Throws on JSON/file write failure | `ORIGINAL_REQUEST.md` § R2, `server/db/database.js` |
| 10 | DB Module | `db.readUsers()` | Reads and parses all users from `users.json`. Exported from `database.js`. | None | Returns array of `User` objects | Returns `[]` or throws on malformed JSON | `ORIGINAL_REQUEST.md` § R2, `server/db/database.js` |

---

## Edge Cases

| # | Feature | Input | Observed / Expected Behavior |
|---|---------|-------|------------------------------|
| E1 | `POST /register` | SMTP connection fails / throws error during `emailService.sendOTPEmail` | **Observed (Current Bug)**: User was already written to `users.json` with `isVerified: false`. Returns 500 error. User remains in `users.json` forever.<br>**Required (Spec)**: OTP email attempt must precede `db.createUser`. When SMTP fails, catch block catches error, returns status `500` `{ success: false, error: '...' }`, and `users.json` contains zero additions (atomic guarantee). |
| E2 | `POST /register` | Email already exists in `users.json` with `isVerified: false` (stale attempt) | **Observed (Current Bug)**: `db.findUserByEmail(email)` triggers line 22 check `if (existingUser)`, returning `400` `{ success: false, error: 'Email is already registered.' }`, permanently blocking user.<br>**Required (Spec)**: Detect `existingUser && !existingUser.isVerified`. Delete stale record via `db.deleteUser(email)`. Proceed with sending OTP email and only save upon success. Registration succeeds (`200 OK`). |
| E3 | `POST /register` | Email already exists in `users.json` with `isVerified: true` | Returns status `400 Bad Request` with `{ success: false, error: 'Email is already registered.' }`. No database mutation, no OTP sent. |
| E4 | `POST /register` | Missing one or more required fields (`fullName`, `email`, or `password`) | Returns status `400 Bad Request` with `{ success: false, error: 'All fields are required.' }`. |
| E5 | `POST /register` | Case sensitivity in email (e.g. `User@Example.COM` vs `user@example.com`) | Must normalize email via `.toLowerCase().trim()`. Comparison in `database.js` uses `toLowerCase()`. User saved with lowercase email. |
| E6 | `POST /forgot-password` | Form submitted with valid existing email | **Observed (Current Bug)**: Controller executes `this.sendOtp(req, res)` where `this` is `undefined`, causing runtime crash `TypeError: Cannot read properties of undefined (reading 'sendOtp')`.<br>**Required (Spec)**: Must invoke `exports.sendOtp(req, res)` or a direct internal reference. Sends reset OTP email, stores `req.session.otpData`, returns status `200 OK` `{ success: true, message: 'OTP sent to your email.' }`. |
| E7 | `POST /forgot-password` | Form submitted with email that does NOT exist in database | Anti-enumeration protection: Returns status `200 OK` with `{ success: true, message: 'If the email exists, an OTP has been sent.' }`. No OTP sent, no session OTP stored. |
| E8 | `GET /me` | Invoked with active session (`req.session.userId` set) | **Observed (Current Code)**: Checks `readUsers ? db.readUsers() : fs.readFileSync(...)` directly reading `users.json`.<br>**Required (Spec)**: Must use `db.readUsers()` (or `db.findUserById(req.session.userId)`). Returns status `200 OK` `{ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } }`. Password hash must NOT be returned. |
| E9 | `GET /me` | Invoked with no session or expired session | Returns status `401 Unauthorized` with `{ success: false, error: 'Not authenticated' }`. Frontend sets `currentUser = null` and preserves Login button in header. |
| E10 | `GET /me` | Session contains `userId` that no longer exists in `users.json` | Returns status `401 Unauthorized` with `{ success: false, error: 'User not found' }`. |

---

## 1. Observation

### 1.1 Requirements Observed in `ORIGINAL_REQUEST.md` (Lines 78–113)
The authoritative request specifies three clear requirements and five acceptance criteria:
- **R1. Atomic Registration (Email First)**:
  > "Modify `server/controllers/authController.js` so that `register` attempts to send the OTP email *before* saving the user to the database. If the email fails, return an error and leave the database clean. If an unverified user record already exists for the email, delete it and allow re-registration."
- **R2. Fix Secondary Bugs**:
  > "- Fix `forgotPassword` `this` binding in `authController.js`.\n- Refactor `getMe` to use the `db` module instead of raw `fs.readFileSync`.\n- Add a `deleteUser(email)` and `readUsers()` function to `server/db/database.js`."
- **R3. Strict Backward Compatibility**:
  > "Make zero modifications to the frontend code (`authUI.js`, `authService.js`). The API endpoints, request bodies, and response shapes must remain identical."
- **Acceptance Criteria**:
  1. Broken SMTP configuration returns `500` error and does NOT add user to `users.json`.
  2. Registering with email in `users.json` with `isVerified: false` succeeds (overwriting/cleaning stale record).
  3. Registering with email in `users.json` with `isVerified: true` returns `400` error `"Email is already registered."`.
  4. Calling Forgot Password endpoint successfully triggers `sendOtp` without crashing.
  5. Calling `/api/auth/me` while authenticated returns correct user data.

### 1.2 Frontend Contracts Observed in `js/services/authService.js` and `js/components/authUI.js`
- **Base Route**: `const API_BASE = '/api/auth';` (`authService.js:3`).
- **Fetch Transport**: `fetchWithJSON(url, options)` (`authService.js:5-17`):
  ```javascript
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
  return response.json();
  ```
  Note: `fetchWithJSON` does not throw on HTTP status codes 4xx/5xx; it directly resolves the parsed JSON response body.
- **Frontend Registration Call** (`authUI.js:233-254`):
  ```javascript
  const res = await authService.register(name, email, password);
  if (res.success) {
    startOTPFlow(email, 'verification');
  } else {
    showError('register', res.error || 'Registration failed');
  }
  ```
  - Request: `POST /api/auth/register`, body: `JSON.stringify({ fullName, email, password })`.
  - On `res.success === true`: Calls `startOTPFlow(email, 'verification')`, which reveals `#otp-modal`, populates `#otp-email-display`, clears inputs, and starts a 60-second resend countdown timer.
  - On `res.success !== true`: Injects `res.error` into `#register-error` element.
- **Frontend Forgot Password Call** (`authUI.js:256-275`):
  ```javascript
  const res = await authService.forgotPassword(email);
  if (res.success) {
    startOTPFlow(email, 'password-reset');
  } else {
    showError('forgot', res.error || 'Failed to request reset');
  }
  ```
  - Request: `POST /api/auth/forgot-password`, body: `JSON.stringify({ email })`.
  - On `res.success === true`: Calls `startOTPFlow(email, 'password-reset')`.
  - On `res.success !== true`: Injects `res.error` into `#forgot-error` element.
- **Frontend Current User Check** (`authUI.js:381-392`):
  ```javascript
  const res = await authService.getMe();
  if (res.success && res.user) {
    updateHeaderState(res.user);
  } else {
    updateHeaderState(null);
  }
  ```
  - Request: `GET /api/auth/me`.
  - Header/Cookie: Session cookie `connect.sid` is passed automatically by standard browser fetch on same-origin requests.
  - Expected `user` object shape: must contain `user.fullName` because line 422 executes: `greeting.textContent = 'Hi, ' + user.fullName.split(' ')[0]`. Also contains `user.email` and `user.role`.

### 1.3 Server Implementation & Bug Observations
- **`server.js`**:
  - Express app mounts `authRoutes` on `/api/auth` (line 61).
  - Session middleware configured with cookie name default `connect.sid`, `resave: false`, `saveUninitialized: false`, `maxAge: 24h` (lines 41-50).
  - Global rate limiter on `/api/`: 100 requests per 15 min (lines 53-58).
- **`server/routes/auth.js`**:
  - Route definitions:
    ```javascript
    router.post('/register', authController.register);
    router.post('/login', loginLimiter, authController.login);
    router.post('/send-otp', otpLimiter, authController.sendOtp);
    router.post('/verify-otp', authController.verifyOtp);
    router.post('/forgot-password', otpLimiter, authController.forgotPassword);
    router.post('/reset-password', authController.resetPassword);
    router.post('/logout', authController.logout);
    router.get('/me', authController.getMe);
    ```
    Note: Both `/send-otp` and `/forgot-password` are governed by `otpLimiter` (max 3 calls per 15 min).
- **`server/controllers/authController.js`**:
  - **Registration Bug** (lines 38-52):
    ```javascript
    db.createUser(newUser); // <-- Written to database BEFORE sending email!
    const otpData = otpService.createOTPData(email, 'verification');
    req.session.otpData = otpData;
    await emailService.sendOTPEmail(email, { ... });
    ```
    If `sendOTPEmail` fails, an unverified user record remains in `users.json`. If user re-attempts registration, line 21:
    ```javascript
    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email is already registered.' });
    }
    ```
    rejects them with 400 even though they never verified!
  - **`forgotPassword` Crash Bug** (lines 145-148):
    ```javascript
    exports.forgotPassword = async (req, res) => {
      req.body.purpose = 'password-reset';
      return this.sendOtp(req, res); // <-- 'this' is undefined when invoked by Express router!
    };
    ```
  - **`getMe` DB bypass** (lines 180-184):
    ```javascript
    const users = require('../db/database').readUsers ? require('../db/database').readUsers() : require('fs').readFileSync(require('path').join(__dirname, '../db/users.json'), 'utf8');
    ```
- **`server/db/database.js`**:
  - Currently exports only `{ findUserByEmail, createUser, updateUser }`.
  - Missing exports: `readUsers` is defined locally but not exported; `deleteUser(email)` does not exist.
- **`server/db/users.json`**:
  - Currently contains two records (`test@example.com` and `muntasirahmed1212@gmail.com`), both stuck in `isVerified: false`.

---

## 2. Logic Chain

1. **Client Expectation Trace**:
   - The frontend (`authUI.js` and `authService.js`) expects standard JSON responses containing `{ success: boolean, ... }`.
   - On error, the frontend displays `res.error`. If `res.error` is absent, fallbacks like `'Registration failed'` or `'Failed to request reset'` are shown.
   - For `GET /me`, the frontend consumes `res.user.fullName` directly to construct the greeting.
   - The frontend files must remain untouched per R3. Therefore, all server responses must conform exactly to these expectations.

2. **Atomic Registration Logic**:
   - When a user submits `POST /api/auth/register`:
     1. Validate that `fullName`, `email`, and `password` are non-empty strings. If not, return HTTP `400` with `{ success: false, error: 'All fields are required.' }`.
     2. Query existing user by email: `const existingUser = db.findUserByEmail(email);`.
     3. If `existingUser` exists:
        - If `existingUser.isVerified === true`: return HTTP `400` with `{ success: false, error: 'Email is already registered.' }`.
        - If `!existingUser.isVerified`: delete the stale unverified user record using `db.deleteUser(email)`.
     4. Generate the OTP and store in `req.session.otpData = otpService.createOTPData(email, 'verification')`.
     5. Attempt to send OTP email via `emailService.sendOTPEmail(...)`.
     6. **Only if `sendOTPEmail` succeeds**: Hash the password with bcrypt, construct `newUser` object with `isVerified: false`, and invoke `db.createUser(newUser)`.
     7. Return HTTP `200` with `{ success: true, message: 'OTP sent to your email.' }`.
     8. **If `sendOTPEmail` fails (catch block)**: Ensure database is clean (no user was created; or if created, delete it). Return HTTP `500` with `{ success: false, error: 'Failed to send verification code. Please check your email or try again later.' }`.

3. **`forgotPassword` Logic**:
   - Express router passes `authController.forgotPassword` as an unbound handler reference.
   - Calling `this.sendOtp` evaluates `this` as `undefined` in strict CommonJS mode.
   - Replacing `this.sendOtp(req, res)` with `exports.sendOtp(req, res)` or calling a common internal helper `sendOtpHandler(req, res)` guarantees proper invocation without `this` dependency.
   - If email is not provided, returns HTTP `400` `{ success: false, error: 'Email is required.' }`.
   - If user is not found, returns HTTP `200` `{ success: true, message: 'If the email exists, an OTP has been sent.' }` to prevent email enumeration.
   - If user exists and email succeeds, returns HTTP `200` `{ success: true, message: 'OTP sent to your email.' }`.

4. **`getMe` Logic**:
   - Check `if (!req.session || !req.session.userId)` -> return HTTP `401` `{ success: false, error: 'Not authenticated' }`.
   - Call `db.readUsers()` (or `db.findUserById(req.session.userId)`) provided by `server/db/database.js`.
   - Find matching user by `id === req.session.userId`.
   - If not found, return HTTP `401` `{ success: false, error: 'User not found' }`.
   - Return HTTP `200` `{ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } }`.
   - Never expose `user.password` in the response.

5. **`server/db/database.js` Extensions**:
   - Export `readUsers`:
     ```javascript
     function readUsers() {
       const data = fs.readFileSync(DB_PATH, 'utf8');
       return JSON.parse(data);
     }
     ```
   - Implement and export `deleteUser(email)`:
     ```javascript
     function deleteUser(email) {
       const users = readUsers();
       const initialLength = users.length;
       const filtered = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
       if (filtered.length !== initialLength) {
         writeUsers(filtered);
         return true;
       }
       return false;
     }
     ```
   - Update exports:
     ```javascript
     module.exports = { findUserByEmail, createUser, updateUser, deleteUser, readUsers };
     ```

6. **Confirmation of Zero Frontend Changes**:
   - All proposed server payload shapes, endpoint paths, method verbs, and status codes correspond exactly to `js/services/authService.js` and `js/components/authUI.js`.
   - Neither `authUI.js` nor `authService.js` requires or tolerates any modifications.

---

## 3. Caveats

1. **Session Store Volatility**: The application uses `express-session` default in-memory storage. Any server restart drops active session data (`req.session.otpData`, `req.session.userId`). Automated testing must maintain session cookies across requests using an agent (e.g. Supertest cookie jar or session-persisting fetch helper).
2. **Rate Limiting**: `otpLimiter` in `server/routes/auth.js` enforces a limit of 3 requests per 15 minutes per IP on both `/api/auth/send-otp` and `/api/auth/forgot-password`. Test harnesses executing multiple reset or OTP requests must account for or bypass/reset rate limiting during automated test suites.
3. **Email Transporter Verification**: In `server/services/emailService.js`, `transporter.verify()` runs on module load. In environments without external internet or invalid credentials, the error logs to console, but the server continues running. When testing SMTP failure, stubbing or simulating network drop in `transporter.sendMail` is the cleanest opaque-box approach.

---

## 4. Conclusion

1. **POST `/api/auth/register`**:
   - Input: `{ "fullName": string, "email": string, "password": string }`.
   - Unverified duplicate: Cleaned via `db.deleteUser(email)` and allowed to re-register.
   - Verified duplicate: Rejected with `400` and error `"Email is already registered."`.
   - SMTP Error: Catches failure, returns `500` with descriptive error, leaves `users.json` untouched.
   - Success: Sends OTP, saves user with `isVerified: false`, returns `200` with `{ "success": true, "message": "OTP sent to your email." }`.
2. **POST `/api/auth/forgot-password`**:
   - Input: `{ "email": string }`.
   - Bug fix: Eliminate `this.sendOtp` by referencing `exports.sendOtp` or internal function.
   - Unknown email: Returns `200` anti-enumeration message without error.
   - Known email: Sends reset OTP and returns `200` `{ "success": true, "message": "OTP sent to your email." }`.
3. **GET `/api/auth/me`**:
   - Input: Cookie header `connect.sid`.
   - Bug fix: Eliminate `fs.readFileSync` fallback; call exported `db.readUsers()`.
   - Unauthenticated: Returns `401` `{ "success": false, "error": "Not authenticated" }`.
   - Authenticated: Returns `200` `{ "success": true, "user": { "fullName": "...", "email": "...", "role": "..." } }`.
4. **Zero Frontend Modifications**:
   - Fully confirmed. The client code is 100% compliant with the specified contracts.

---

## 5. Verification Method

### 5.1 Verification Checklist & Inspection Points
1. **Frontend Integrity**:
   - Verify `git diff js/components/authUI.js` and `git diff js/services/authService.js` are completely empty.
2. **Database Module Inspection**:
   - Inspect `server/db/database.js` to confirm `deleteUser` and `readUsers` are exported.
3. **Controller Bindings Inspection**:
   - Inspect `server/controllers/authController.js` to confirm `register` calls `emailService.sendOTPEmail` prior to `db.createUser`.
   - Confirm `forgotPassword` invokes `sendOtp` without relying on dynamic `this`.
   - Confirm `getMe` imports/invokes `db.readUsers()` instead of `fs.readFileSync`.

### 5.2 Independent Automated Verification Commands
Run node test scripts or curl commands verifying all five acceptance criteria:
- **Test 1 (Broken SMTP Registration)**:
  Simulate SMTP failure (e.g., invalid host/port or stub). Attempt registration.
  - Assert response status: `500`.
  - Assert `users.json` does not contain the new email.
- **Test 2 (Unverified Re-registration)**:
  Insert `{ email: 'unverified@test.com', isVerified: false }` into `users.json`. Attempt registration.
  - Assert response status: `200`.
  - Assert user is updated/re-created in `users.json`.
- **Test 3 (Verified Registration Conflict)**:
  Insert `{ email: 'verified@test.com', isVerified: true }` into `users.json`. Attempt registration.
  - Assert response status: `400`.
  - Assert response JSON: `{ "success": false, "error": "Email is already registered." }`.
- **Test 4 (Forgot Password `this` Binding)**:
  Send `POST /api/auth/forgot-password` with `{ "email": "verified@test.com" }`.
  - Assert response does not crash with `500 TypeError: Cannot read properties of undefined (reading 'sendOtp')`.
  - Assert response status is `200`.
- **Test 5 (Authenticated `GET /api/auth/me`)**:
  Authenticate via login or session cookie, then issue `GET /api/auth/me`.
  - Assert response status: `200`.
  - Assert response body has `{ success: true, user: { fullName: ..., email: ..., role: ... } }`.
  - Issue `GET /api/auth/me` without cookie: assert response status `401`.
