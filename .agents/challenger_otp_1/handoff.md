# Adversarial Challenge Report: Registration Flow & Database Integrity Under Stress

- **Agent**: `challenger_otp_1`
- **Role**: Empirical Adversarial Challenger (critic, specialist)
- **Target Files**:
  - `server/controllers/authController.js`
  - `server/db/database.js`
  - `server/services/emailService.js`
- **Test Suite**: `tests/adversarial-registration.test.js`
- **Date**: 2026-09-24T16:45:00Z
- **Verdict**: **FAIL**

---

## 1. Observation

### 1.1 Test Suite Execution
The adversarial test harness `tests/adversarial-registration.test.js` was executed against an isolated Express test server with realistic network latency simulation and strict database state restoration.
```powershell
node tests/adversarial-registration.test.js
```

**Overall Results**:
- **Total Tests**: 21
- **Passed**: 15
- **Failed**: 6

### 1.2 Observed Failures & Verbatim Outputs

#### Failure 1 & 2: Concurrency TOCTOU Race Condition Creating Duplicate Accounts
- **Test 1.1**: `Simultaneous registration of brand new email (5 concurrent requests)`
- **Test 1.2**: `Simultaneous re-registration of existing unverified user (5 concurrent requests)`
- **Verbatim Error**:
  ```
  ❌ [Suite 1: Concurrency] 1.1: Simultaneous registration of brand new email (5 concurrent requests)
     Error: CONCURRENCY RACE CONDITION: Found 5 duplicate user records in users.json for concurrency_new@example.com!
  ❌ [Suite 1: Concurrency] 1.2: Simultaneous re-registration of existing unverified user (5 concurrent requests)
     Error: CONCURRENCY RACE CONDITION ON UNVERIFIED: Found 5 duplicate user records in users.json!
  ```
- **Code Observation (`server/controllers/authController.js` lines 21–56)**:
  ```javascript
  21: const existingUser = db.findUserByEmail(email);
  22: if (existingUser) {
  23:   if (existingUser.isVerified) {
  24:     return res.status(400).json({ success: false, error: 'Email is already registered.' });
  25:   }
  26:   // If user exists and is unverified, prune stale record to allow re-registration
  27:   db.deleteUser(email);
  28: }
  ...
  35: await emailService.sendOTPEmail(email, { ... });
  ...
  43: const hashedPassword = await bcrypt.hash(password, 12);
  ...
  56: db.createUser(newUser);
  ```
- **Code Observation (`server/db/database.js` lines 26–31)**:
  ```javascript
  26: function createUser(userData) {
  27:   const users = readUsers();
  28:   users.push(userData);
  29:   writeUsers(users);
  30:   return userData;
  31: }
  ```
  `findUserByEmail` executes at line 21, followed by asynchronous network I/O (`await emailService.sendOTPEmail`) and asynchronous CPU work (`await bcrypt.hash`). During this ~150–250ms asynchronous window, concurrent requests arrive, see no existing user, pass the check, and all execute `db.createUser(newUser)`. Because `createUser` does not enforce uniqueness or re-check the database, all 5 requests succeed with HTTP 200 and write 5 duplicate user records with distinct IDs into `users.json`.

#### Failure 3 & 4: Case-Sensitivity Rejection in `verifyOtp` and `resetPassword`
- **Test 2.5**: `Full lifecycle with casing: register mixed, verify lower, login upper`
- **Test 2.6**: `Forgot password mixed-case email followed by lowercase reset-password`
- **Verbatim Errors**:
  ```
  ❌ [Suite 2: Case-Insensitivity] 2.5: Full lifecycle with casing: register mixed, verify lower, login upper
     Error: OTP verification failed: {"success":false,"error":"No OTP requested or session expired."}
  ❌ [Suite 2: Case-Insensitivity] 2.6: Forgot password mixed-case email followed by lowercase reset-password
     Error: CASE SENSITIVITY BUG IN RESET-PASSWORD: sessionOtpData.email !== email rejected lowercase email matching mixed-case session!
  ```
- **Code Observation (`server/controllers/authController.js` lines 31, 98, 161)**:
  - In `register` (line 31):
    ```javascript
    const otpData = otpService.createOTPData(email, 'verification');
    req.session.otpData = otpData;
    ```
    Raw `email` (e.g. `'LifeCycle.User@Domain.Com'`) is stored in `req.session.otpData.email`, while the database user record is saved with normalized lowercase `email.toLowerCase()` (line 48).
  - In `verifyOtp` (line 98):
    ```javascript
    if (!sessionOtpData || sessionOtpData.email !== email) {
      return res.status(400).json({ success: false, error: 'No OTP requested or session expired.' });
    }
    ```
    Uses strict inequality `!==` without `.toLowerCase()`. When a user submits their normalized email `'lifecycle.user@domain.com'`, `sessionOtpData.email !== email` evaluates to `true`, rejecting the verification with HTTP 400 `'No OTP requested or session expired.'`.
  - In `resetPassword` (line 161):
    ```javascript
    if (!sessionOtpData || sessionOtpData.email !== email || !sessionOtpData.verified || sessionOtpData.purpose !== 'password-reset') {
      return res.status(400).json({ success: false, error: 'Invalid or expired password reset session.' });
    }
    ```
    Uses the exact same strict inequality `!==`, locking users out from resetting their password if case variation occurs.

#### Failure 5: Type Confusion Causing Unhandled TypeError and HTTP 500
- **Test 3.3**: `Type confusion: non-string email (integer, boolean, array, object)`
- **Verbatim Error**:
  ```
  ❌ [Suite 3: Fuzzing] 3.3: Type confusion: non-string email (integer, boolean, array, object)
     Error: UNHANDLED TYPE CONFUSION: Passing integer email caused server 500 error instead of 400 Bad Request!
  ```
- **Code Observation (`server/controllers/authController.js` lines 17–21 and `server/db/database.js` lines 21–24)**:
  - `authController.js`:
    ```javascript
    const { fullName, email, password, role } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
    const existingUser = db.findUserByEmail(email);
    ```
    `if (!fullName || !email || !password)` only checks truthiness. When `email` is a number (`12345`), boolean (`true`), object (`{}`), or array (`[]`), the check passes.
  - `database.js`:
    ```javascript
    function findUserByEmail(email) {
      const users = readUsers();
      return users.find(u => u.email.toLowerCase() === email.toLowerCase());
    }
    ```
    Invokes `email.toLowerCase()`, throwing `TypeError: email.toLowerCase is not a function`. The exception is caught by the generic catch block in `register`, responding with HTTP 500 `{ success: false, error: 'Server error during registration.' }` rather than HTTP 400 Bad Request.

#### Failure 6: Incomplete Duplicate Pruning in `db.deleteUser`
- **Test 1.4**: `deleteUser only removes first duplicate, leaving second duplicate as orphan`
- **Verbatim Error**:
  ```
  ❌ [Suite 1: Concurrency] 1.4: deleteUser only removes first duplicate, leaving second duplicate as orphan
     Error: ORPHAN DUPLICATE PERSISTS: deleteUser only deleted the first matching index, leaving 1 duplicate record(s) in users.json!
  ```
- **Code Observation (`server/db/database.js` lines 42–50)**:
  ```javascript
  function deleteUser(email) {
    if (!email) return false;
    const users = readUsers();
    const index = users.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (index === -1) return false;
    users.splice(index, 1);
    writeUsers(users);
    return true;
  }
  ```
  `deleteUser` only splices a single index (`users.splice(index, 1)`). If duplicate records were created via race conditions, only the first occurrence is pruned, leaving orphan duplicates indefinitely in `users.json`.

### 1.3 Observed Passing Areas (Robust Implementations)
- **AC1: Broken SMTP Resilience**:
  - Test 4.1 subjected the registration endpoint to 25 consecutive SMTP failures (`Error: connect ECONNREFUSED`). All 25 requests returned HTTP 500 `{ success: false, error: 'Server error during registration.' }` and zero user records were leaked into `users.json`.
  - Test 4.2 subjected unverified re-registration to broken SMTP: the stale unverified user was pruned and no new user was persisted, preserving DB integrity.
  - Test 4.3 verified that attempts to register an already verified email with broken SMTP return HTTP 400 `'Email is already registered.'` immediately *before* attempting SMTP, preserving verified users.
- **AC2: Sequential Unverified Re-Registration Cycles**:
  - Test 5.1 executed 20 sequential re-registration cycles on the same unverified email. The previous unverified record was consistently pruned, leaving exactly 1 record in `users.json` at all times.
  - Test 5.2 executed 10 alternating casing re-registration cycles (`Alternating@Domain.Com` -> `ALTERNATING@DOMAIN.COM` -> `alternating@domain.com`). Stored email was properly lowercased and no duplicate records accumulated.
  - Test 5.3 verified that after 5 unverified cycles, submitting the valid OTP successfully transitions `isVerified` to `true` and subsequent registration attempts are blocked with HTTP 400.
- **Input Fuzzing**:
  - Missing fields (fullName, email, password) correctly return HTTP 400.
  - Empty strings (`""`) correctly return HTTP 400.
  - Payloads containing HTML/XSS tags (`<script>alert('xss')</script>`), SQL injection syntax (`Robert'); DROP TABLE users;--`), unicode emojis, and 5,000-character strings were handled safely without crashing.

---

## 2. Logic Chain

1. **TOCTOU Race Condition**:
   - *Observation*: In `authController.js`, lines 21–28 check for existing user and prune unverified records. Between line 28 and line 56, two asynchronous operations occur: `await emailService.sendOTPEmail` (network) and `await bcrypt.hash(password, 12)` (crypto thread pool).
   - *Logic*: Because Node processes incoming requests on the event loop, multiple concurrent requests for the same email will all evaluate line 21 before any request reaches line 56.
   - *Empirical Proof*: When 5 concurrent requests were fired, all 5 passed the check and executed `db.createUser`, writing 5 distinct user objects for the same email to `users.json`.
   - *Impact*: Compromises database consistency, corrupts account ownership, and causes subsequent authentication ambiguities.

2. **Case-Sensitivity Mismatch in OTP Flow**:
   - *Observation*: `register` lowercases the email when saving to `users.json` (`email: email.toLowerCase()`, line 48), but passes the raw casing into `otpService.createOTPData(email, ...)` (line 31).
   - *Logic*: In `verifyOtp` (line 98) and `resetPassword` (line 161), the incoming `email` from `req.body` is compared against `sessionOtpData.email` via strict equality `sessionOtpData.email !== email`.
   - *Empirical Proof*: Registering with `LifeCycle.User@Domain.Com` and attempting OTP verification with `lifecycle.user@domain.com` returned HTTP 400 `'No OTP requested or session expired.'`.
   - *Impact*: Real users using mixed-case email or mobile keyboard auto-capitalization are locked out from completing registration or password reset.

3. **Missing Type Guard Leading to HTTP 500**:
   - *Observation*: In `authController.js` line 17, `if (!fullName || !email || !password)` allows truthy non-string primitives (numbers, booleans, arrays, objects).
   - *Logic*: `db.findUserByEmail` unconditionally executes `email.toLowerCase()`.
   - *Empirical Proof*: Sending `{ email: 12345 }` threw `TypeError: email.toLowerCase is not a function` and returned HTTP 500 instead of HTTP 400.
   - *Impact*: Allows malicious clients or malformed API consumers to trigger uncaught TypeErrors and generate false server error alerts.

4. **Incomplete Duplicate Cleanup**:
   - *Observation*: `db.deleteUser(email)` uses `findIndex` and `splice(index, 1)`.
   - *Logic*: `splice(index, 1)` only deletes the first occurrence.
   - *Empirical Proof*: When duplicate records were present in `users.json`, `db.deleteUser` left 1 duplicate record behind.
   - *Impact*: Makes database recovery from race conditions impossible without manual administrative intervention.

---

## 3. Caveats

- **Load Profile**: Testing was performed with concurrency levels up to 5 simultaneous requests per batch. Under heavier enterprise loads (e.g. 50–100 simultaneous requests), filesystem race conditions on `users.json` may further trigger file lock collisions or partial read corruptions.
- **Process Model**: Tests ran within a single Node.js process using `http.createServer`. In a multi-worker cluster (e.g. PM2), the race condition between `readUsers()` and `writeUsers()` across processes would be even more severe without file locking.
- **No Scope Tampering**: The challenger strictly refrained from altering implementation code (`authController.js`, `database.js`), in accordance with Key Constraints.

---

## 4. Conclusion

**Verdict: FAIL**

The implementation succeeds on basic sequential flows and satisfies the baseline requirement that broken SMTP does not leak unverified users. However, it **fails critical production resilience criteria**:

1. **CRITICAL**: Concurrency TOCTOU race condition allows multiple simultaneous registrations for the same email to bypass uniqueness checks and persist duplicate records in `users.json`.
2. **HIGH**: Case-sensitivity comparison bug in `verifyOtp` (`line 98`) and `resetPassword` (`line 161`) rejects legitimate OTP verification and password reset when email casing varies.
3. **MEDIUM**: Lack of type validation on `email` (`typeof email !== 'string'`) allows non-string payloads to trigger internal `TypeError` and return HTTP 500 instead of HTTP 400.
4. **MEDIUM**: `db.deleteUser` only removes the first matching record (`findIndex` + `splice(index, 1)`) instead of filtering all matching records (`users.filter(...)`).

### Required Worker Remediations:
1. In `server/controllers/authController.js`:
   - Validate field types: `if (typeof fullName !== 'string' || typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ success: false, error: 'Invalid input types.' });`.
   - Normalize email immediately: `const normalizedEmail = email.trim().toLowerCase();`.
   - Use `normalizedEmail` in `createOTPData`: `otpService.createOTPData(normalizedEmail, 'verification')`.
   - In `verifyOtp` and `resetPassword`, normalize comparison: `if (!sessionOtpData || sessionOtpData.email.toLowerCase() !== email.toLowerCase())`.
   - Concurrency guard: Before `db.createUser(newUser)`, perform a secondary atomic check or deduplicate in `db.createUser`.
2. In `server/db/database.js`:
   - In `deleteUser`, filter out ALL matching users: `const filtered = users.filter(u => !u.email || u.email.toLowerCase() !== email.toLowerCase());`.
   - In `createUser`, ensure existing records with the same email are replaced or uniqueness is enforced.
   - In `findUserByEmail`, guard against non-string `email`: `if (!email || typeof email !== 'string') return null;`.

---

## 5. Verification Method

To independently reproduce all observations and verify the findings:

1. **Run the full adversarial test suite**:
   ```powershell
   node tests/adversarial-registration.test.js
   ```
2. **Inspect failed assertions**:
   - Check lines 177–180: Concurrency duplicate count `usersInDb.length > 1`.
   - Check line 720: Reset password case-sensitivity rejection `sessionOtpData.email !== email`.
   - Check line 475: Type confusion 500 error on integer email.
   - Check line 748: Orphan duplicate persistence after `deleteUser`.
3. **Invalidation Condition**:
   This FAIL verdict is invalidated only when `node tests/adversarial-registration.test.js` completes with `Total: 21 | Passed: 21 | Failed: 0`.
