# Execution Plan: Registration & OTP Bug Fix

## Objective
Implement atomic registration (email sent before persisting user, clean database on failure, allow re-registration for unverified users), fix `forgotPassword` `this` binding, refactor `getMe` to use `db` module, add `deleteUser` and `readUsers` to `database.js`, while maintaining strict backward compatibility with frontend code.

## Architecture & Boundary Principles
- Source files to modify:
  - `server/db/database.js`
  - `server/controllers/authController.js`
- Strictly forbidden to modify:
  - Frontend files (`authUI.js`, `authService.js`, etc.)
- Verification requirements:
  - Broken SMTP returns 500 error and leaves `users.json` untouched.
  - Re-registering email with `isVerified: false` succeeds (overwriting/cleaning up stale record).
  - Registering email with `isVerified: true` returns 400 error 'Email is already registered'.
  - Forgot password triggers `sendOtp` without crashing.
  - `/api/auth/me` while authenticated returns correct user data.

## Phase Breakdown
1. **Phase 0: Survey & Exploration**
   - Dispatch 3 exploratory subagents (Explorers / Spec Miner) to inspect `server/controllers/authController.js`, `server/db/database.js`, `server/services/emailService.js`, server routes, and existing test setup.
   - Aggregate findings into architecture notes and interface contracts.
2. **Phase 1: Project & Specification Documentation**
   - Update `PROJECT.md` at `.agents/PROJECT.md` with new feature inventory and milestones for the Registration/OTP fix.
3. **Phase 2: Milestone 1 — Database Module**
   - Dispatch Worker to implement `deleteUser(email)` and `readUsers()` in `server/db/database.js`.
   - Dispatch Reviewers & Challenger to verify DB functions.
4. **Phase 3: Milestone 2 — Auth Controller**
   - Dispatch Worker to implement atomic registration, fix `forgotPassword` `this` context, and refactor `getMe`.
   - Dispatch Reviewers & Challenger to verify controller logic.
5. **Phase 4: Milestone 3 — Automated Test Suite & E2E Verification**
   - Dispatch Test Writer / Worker to create comprehensive automated test scripts covering all 5 acceptance criteria (Broken SMTP, Unverified overwrite, Verified conflict, Forgot Password OTP, Authenticated `/api/auth/me`).
   - Run tests and verify 100% pass rate.
6. **Phase 5: Milestone 4 — Adversarial Hardening & Forensic Integrity Audit**
   - Dispatch 2 Challengers for edge-case stress testing (concurrency, malformed inputs, error propagation).
   - Dispatch Forensic Auditor to check for genuine implementation (no hardcoded responses, no bypasses).
7. **Phase 6: Delivery & Handoff**
   - Synthesize final findings, compile `handoff.md`, report to parent/sentinel.
