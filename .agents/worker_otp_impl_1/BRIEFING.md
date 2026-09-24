# BRIEFING — 2026-09-24T16:25:03Z

## Mission
Implement the Registration/OTP bug fix in `server/db/database.js` and `server/controllers/authController.js` to ensure atomic registration, unverified stale user cleanup, robust `forgotPassword` invocation, and secure `getMe` user querying.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: c:\Users\munta\Downloads\blue_collar\.agents\worker_otp_impl_1
- Original parent: 42b60d6a-04dc-421f-b1c0-6994049b33d4
- Milestone: M1 & M2 (Database Extensions and Auth Controller Implementation)

## 🔒 Key Constraints
- EXCLUSIVE FILE OWNERSHIP: Modify ONLY `server/db/database.js` and `server/controllers/authController.js`.
- STRICTLY FORBIDDEN to modify any frontend files (`js/components/authUI.js`, `js/services/authService.js`, etc.).
- Mandatory Integrity Mandate: Genuine logic only; no hardcoded test outputs or dummy facades. Independent auditor will verify.
- Backward compatibility: API endpoints, request bodies, and response shapes must remain 100% identical.

## Current Parent
- Conversation ID: 42b60d6a-04dc-421f-b1c0-6994049b33d4
- Updated: 2026-09-24T16:25:03Z

## Task Summary
- **What to build**:
  1. In `server/db/database.js`: Implement `deleteUser(email)` (case-insensitive, persist to `users.json`, return boolean), ensure `readUsers()` is exported, update `module.exports`.
  2. In `server/controllers/authController.js`:
     - `register`: Check existing user; if verified return 400; if unverified call `db.deleteUser(email)` to prune stale record. Send OTP email *before* persisting user. Persist user only on email success. If email fails, catch and leave DB clean, returning 500.
     - `forgotPassword`: Call `exports.sendOtp(req, res)` or direct internal function to fix `this` binding crash.
     - `getMe`: Use `db.readUsers()` instead of raw `fs.readFileSync`, check `req.session.userId`, return sanitized `{ fullName, email, role }` without password.
- **Success criteria**:
  - All 5 acceptance criteria pass.
  - Zero modifications to frontend files.
- **Interface contracts**: `c:\Users\munta\Downloads\blue_collar\.agents\PROJECT.md` § Interface Contracts
- **Code layout**: `c:\Users\munta\Downloads\blue_collar\.agents\PROJECT.md` § Code Layout

## Key Decisions Made
- Use case-insensitive matching (`toLowerCase()`) for `deleteUser(email)`.
- In `register`, await `emailService.sendOTPEmail` prior to `bcrypt.hash` and `db.createUser`.
- Call `exports.sendOtp(req, res)` in `forgotPassword` to avoid detached `this` runtime errors.
- In `getMe`, retrieve all users via `db.readUsers()`, find user by `id === req.session.userId`, and return sanitized `{ fullName, email, role }`.

## Artifact Index
- `server/db/database.js` — Target file 1
- `server/controllers/authController.js` — Target file 2
- `.agents/worker_otp_impl_1/progress.md` — Liveness and execution heartbeat
- `.agents/worker_otp_impl_1/handoff.md` — 5-Component final handoff report

## Change Tracker
- **Files modified**:
  - `server/db/database.js`: Added `deleteUser(email)` with case-insensitive filtering, exported `readUsers()` and `deleteUser()`.
  - `server/controllers/authController.js`: Made `register` atomic (email first, stale unverified prune), fixed `forgotPassword` this binding (`exports.sendOtp`), refactored `getMe` to use `db.readUsers()`.
- **Build status**: Pass (node -c and test suite exit 0)
- **Pending issues**: None

## Quality Status
- **Build/test result**: All 5 Acceptance Criteria + 4 edge cases passed 100%
- **Lint status**: 0 syntax/runtime violations (node -c passed)
- **Tests added/modified**: Comprehensive unit & integration verification covering AC1 through AC5 and edge cases

## Loaded Skills
- None
