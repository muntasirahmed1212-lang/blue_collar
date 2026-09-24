# Dispatch History

## 2026-09-24T16:16:19Z

You are the Project Orchestrator for the Registration/OTP bug fix task on the BlueCollar Connect project.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\orchestrator_2
Project directory: c:\Users\munta\Downloads\blue_collar
Original request: Refer to c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md (specifically the latest request under ## 2026-09-24T16:15:16Z).

Requirements:
R1. Atomic Registration (Email First):
Modify `server/controllers/authController.js` so that `register` attempts to send the OTP email *before* saving the user to the database. If the email fails, return an error and leave the database clean. If an unverified user record already exists for the email, delete it and allow re-registration.

R2. Fix Secondary Bugs:
- Fix `forgotPassword` `this` binding in `authController.js`.
- Refactor `getMe` to use the `db` module instead of raw `fs.readFileSync`.
- Add a `deleteUser(email)` and `readUsers()` function to `server/db/database.js`.

R3. Strict Backward Compatibility:
Make zero modifications to the frontend code (`authUI.js`, `authService.js`). The API endpoints, request bodies, and response shapes must remain identical.

Acceptance Criteria:
- Attempting registration with a broken SMTP configuration returns a 500 error and does NOT add the user to `users.json`.
- Registering with an email that is already in `users.json` with `isVerified: false` succeeds (overwriting/cleaning up the stale record).
- Registering with an email that is in `users.json` with `isVerified: true` returns a 400 error 'Email is already registered'.
- Calling the Forgot Password endpoint successfully triggers `sendOtp` without crashing.
- Calling `/api/auth/me` while authenticated returns the correct user data.

Maintain your plan in plan.md, track your progress in progress.md and BRIEFING.md in your working directory, decompose the task, spawn specialist agents as needed, execute robust automated tests for all acceptance criteria, and deliver your handoff report when complete. Send a completion message back to the sentinel when done.
