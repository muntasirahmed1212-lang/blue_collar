# Dispatch for Worker OTP Implementation 2 (Iteration 2)

## Mission
Remediate the 4 adversarial edge cases identified by `challenger_otp_1` in `tests/adversarial-registration.test.js`:
Full challenger report: `c:\Users\munta\Downloads\blue_collar\.agents\challenger_otp_1\handoff.md`

## Target Files (Exclusive Write Ownership)
1. `server/db/database.js`
2. `server/controllers/authController.js`

STRICTLY FORBIDDEN to modify:
- `js/components/authUI.js`
- `js/services/authService.js`
- Any frontend files.

## Specific Issues to Fix

### 1. Concurrency TOCTOU Race Condition in `createUser` / `register`:
- In `server/db/database.js`:
  In `createUser(userData)`, when writing to `users.json`:
  Check if a record with the same email already exists in `users`:
  ```javascript
  const existingIndex = users.findIndex(u => u.email && u.email.toLowerCase() === userData.email.toLowerCase());
  if (existingIndex !== -1) {
    if (users[existingIndex].isVerified) {
      return users[existingIndex]; // Do not overwrite verified user
    }
    users.splice(existingIndex, 1); // Prune any duplicate unverified record
  }
  users.push(userData);
  ```
  This ensures that even if concurrent requests pass `findUserByEmail` simultaneously, `createUser` deduplicates and NEVER leaves multiple records for the same email in `users.json`.

### 2. Case-Sensitivity in `verifyOtp` and `resetPassword`:
- In `server/controllers/authController.js`:
  - In `verifyOtp`:
    Change:
    `if (!sessionOtpData || sessionOtpData.email !== email)`
    To:
    `if (!sessionOtpData || !email || sessionOtpData.email.toLowerCase() !== email.toLowerCase().trim())`
  - In `resetPassword`:
    Change:
    `if (!sessionOtpData || sessionOtpData.email !== email || ...)`
    To:
    `if (!sessionOtpData || !email || sessionOtpData.email.toLowerCase() !== email.toLowerCase().trim() || ...)`
  - In `register`:
    Ensure `email` is normalized: `const normalizedEmail = email.toLowerCase().trim();` and `otpService.createOTPData(normalizedEmail, 'verification')` or store lowercase in session.

### 3. Type Confusion Protection (Non-string email):
- In `server/controllers/authController.js`:
  In `register`:
  Check:
  `if (typeof fullName !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !fullName.trim() || !email.trim() || !password)`
  return HTTP 400 `{ success: false, error: 'All fields are required.' }`.
- In `server/db/database.js`:
  In `findUserByEmail(email)`:
  `if (!email || typeof email !== 'string') return undefined;`
  In `deleteUser(email)`:
  `if (!email || typeof email !== 'string') return false;`

### 4. Complete Duplicate Pruning in `deleteUser`:
- In `server/db/database.js`:
  In `deleteUser(email)`:
  Use `.filter()` instead of `.findIndex() / .splice()`:
  ```javascript
  function deleteUser(email) {
    if (!email || typeof email !== 'string') return false;
    const users = readUsers();
    const initialLength = users.length;
    const target = email.toLowerCase();
    const filtered = users.filter(u => !u.email || u.email.toLowerCase() !== target);
    if (filtered.length !== initialLength) {
      writeUsers(filtered);
      return true;
    }
    return false;
  }
  ```

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification
Run both:
1. `node tests/adversarial-registration.test.js` (Must pass all 21/21 tests with 0 failures!)
2. `node tests/adversarial-secondary-db.test.js` (Must pass all tests!)

Write your report to `c:\Users\munta\Downloads\blue_collar\.agents\worker_otp_impl_2\handoff.md`.
Report back via `send_message`.
