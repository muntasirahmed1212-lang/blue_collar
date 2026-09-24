# Dispatch for Worker OTP Implementation 1

## Mission
Implement the Registration/OTP bug fix per specifications in `c:\Users\munta\Downloads\blue_collar\.agents\PROJECT.md` and the survey findings in:
- `c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_1\handoff.md`
- `c:\Users\munta\Downloads\blue_collar\.agents\spec_miner_otp_survey_2\handoff.md`
- `c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_3\handoff.md`
- `c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md` (section ## 2026-09-24T16:15:16Z)

## Exclusive File Ownership
You own and may modify ONLY these two files:
1. `server/db/database.js`
2. `server/controllers/authController.js`

STRICTLY FORBIDDEN to modify:
- `js/components/authUI.js`
- `js/services/authService.js`
- Any other frontend files.

## Tasks to Implement
1. **`server/db/database.js`**:
   - Ensure `readUsers()` safely reads and parses `server/db/users.json`.
   - Implement `deleteUser(email)`:
     - Case-insensitive search: `email.toLowerCase()`.
     - Filter out the user with matching email.
     - If user was found and removed, write updated array via `writeUsers` and return `true`.
     - Otherwise return `false`.
   - Export `{ findUserByEmail, createUser, updateUser, deleteUser, readUsers }`.

2. **`server/controllers/authController.js`**:
   - **`register`**:
     - Validate `fullName`, `email`, `password`. If missing, return 400 `{ success: false, error: 'All fields are required.' }`.
     - Query `existingUser = db.findUserByEmail(email)`.
     - If `existingUser` exists:
       - If `existingUser.isVerified === true`, return 400 `{ success: false, error: 'Email is already registered.' }`.
       - If `!existingUser.isVerified`, call `db.deleteUser(email)` to delete the stale unverified record.
     - Prepare OTP data: `const otpData = otpService.createOTPData(email, 'verification'); req.session.otpData = otpData;`.
     - Send OTP email *before* persisting user:
       ```javascript
       await emailService.sendOTPEmail(email, {
         userName: fullName,
         otpCode: otpData.code,
         purpose: 'verification',
         expiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5
       });
       ```
     - Only after `sendOTPEmail` resolves successfully:
       - Hash password: `const hashedPassword = await bcrypt.hash(password, 12);`
       - Create `newUser` object with `id: generateUUID()`, `fullName`, `email: email.toLowerCase()`, `password: hashedPassword`, `role: role || 'customer'`, `isVerified: false`, `createdAt`, `updatedAt`.
       - Persist user: `db.createUser(newUser);`.
       - Return 200 `{ success: true, message: 'OTP sent to your email.' }`.
     - In `catch (error)`:
       - Ensure `users.json` is clean (no user created).
       - Return 500 `{ success: false, error: 'Server error during registration.' }` (or descriptive error).
   - **`forgotPassword`**:
     - Fix `this` binding: call `exports.sendOtp(req, res)` instead of `this.sendOtp(req, res)`.
   - **`getMe`**:
     - Validate `if (!req.session || !req.session.userId) return res.status(401).json({ success: false, error: 'Not authenticated' });`.
     - Use `db.readUsers()` to find user by `id === req.session.userId`.
     - If not found, return 401 `{ success: false, error: 'User not found' }`.
     - Return 200 `{ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } }`.
     - Do NOT use `fs.readFileSync` or expose password hash.

3. **Verification**:
   - Write and run unit / integration verification script to confirm:
     a. Broken SMTP fails with 500 and does NOT add user to `users.json`.
     b. Re-registration of unverified email succeeds and overwrites/cleans stale record.
     c. Registration with verified email returns 400 'Email is already registered'.
     d. Forgot password triggers `sendOtp` without crashing.
     e. `/api/auth/me` while authenticated returns correct user data.
     f. Frontend files have zero git modifications.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Output:
Write full report and test output to `c:\Users\munta\Downloads\blue_collar\.agents\worker_otp_impl_1\handoff.md`.
Use `send_message` to report completion back to parent.

## 2026-09-24T16:25:03Z
TASK:
1. In `server/db/database.js`:
   - Implement `deleteUser(email)` with case-insensitive comparison, writing to `users.json` when found, returning boolean.
   - Ensure `readUsers()` is exported.
   - Update `module.exports = { findUserByEmail, createUser, updateUser, deleteUser, readUsers };`
2. In `server/controllers/authController.js`:
   - In `register`:
     - Validate required fields.
     - Check `existingUser = db.findUserByEmail(email)`.
     - If `existingUser?.isVerified === true`, return 400 `{ success: false, error: 'Email is already registered.' }`.
     - If `existingUser && !existingUser.isVerified`, call `db.deleteUser(email)` to clean the stale unverified record.
     - Prepare OTP data: `const otpData = otpService.createOTPData(email, 'verification'); req.session.otpData = otpData;`.
     - Await `emailService.sendOTPEmail(...)` BEFORE creating user.
     - Only if email send succeeds: hash password with bcrypt, construct user object with `isVerified: false`, call `db.createUser(newUser)`, return 200 `{ success: true, message: 'OTP sent to your email.' }`.
     - If email send fails (catch): do not create user (DB remains clean), return 500 error.
   - In `forgotPassword`:
     - Fix `this` binding by calling `exports.sendOtp(req, res)` or direct internal `sendOtp` handler.
   - In `getMe`:
     - Refactor to use `db.readUsers()` instead of raw `fs.readFileSync`.
     - Check `req.session.userId`, find user, return sanitized `{ fullName, email, role }` without password. Return 401 if unauthenticated or not found.
3. VERIFICATION:
   - Run verification tests to prove all 5 acceptance criteria pass.
   - Document commands, results, and write handoff report to `c:\Users\munta\Downloads\blue_collar\.agents\worker_otp_impl_1\handoff.md`.
   - Send completion message to parent via send_message.
