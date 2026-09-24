# Dispatch for Challenger OTP 2

## Mission
You are an adversarial challenger. Your objective is to empirically stress-test the secondary endpoints and DB robustness in BlueCollar Connect.
Target code:
- `server/controllers/authController.js` (`forgotPassword`, `getMe`)
- `server/db/database.js` (`deleteUser`, `readUsers`, `writeUsers`)

Requirements to challenge:
- AC4: Calling Forgot Password endpoint successfully triggers `sendOtp` without crashing.
- AC5: Calling `/api/auth/me` while authenticated returns correct user data.

Adversarial Stress Scenarios to Execute:
1. `forgotPassword` invocation modes:
   - Calling handler as unbound function, as arrow function, destructured, and with null `this`.
   - Calling with missing email, invalid email, non-existent email (verifying anti-enumeration: 200 returned).
   - Calling when SMTP fails (verifying error handling).
2. `/api/auth/me` security & session edge cases:
   - Calling with no session cookie (401).
   - Calling with cookie containing non-existent `userId` (401).
   - Calling with tampered session data.
   - Verifying that password hash is NEVER present in `/api/auth/me` response under any condition.
3. `database.js` robustness:
   - Calling `deleteUser` with null, undefined, non-existent email, case differences.
   - Calling `readUsers` repeatedly and testing persistence.

Output:
Write generator/oracle tests, execute them, and write your report to:
`c:\Users\munta\Downloads\blue_collar\.agents\challenger_otp_2\handoff.md`
End with clear verdict: APPROVE or FAIL.
Report back via `send_message`.

## 2026-09-24T16:38:28Z
You are challenger_otp_2.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\challenger_otp_2
Project directory: c:\Users\munta\Downloads\blue_collar
Original request path: c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md (specifically ## 2026-09-24T16:15:16Z)
Project specification: c:\Users\munta\Downloads\blue_collar\.agents\PROJECT.md
Dispatch instructions: c:\Users\munta\Downloads\blue_collar\.agents\challenger_otp_2\DISPATCH.md

You are an empirical adversarial challenger.
Focus: Secondary endpoints & DB operations (`forgotPassword`, `getMe`, `database.js`).
Test scenarios:
- `forgotPassword` invocation contexts: unbound handler, arrow function, detached method, missing email, non-existent email (anti-enumeration 200), SMTP failure.
- `/api/auth/me` security & session edge cases: missing cookie (401), invalid/tampered cookie (401), non-existent userId in session (401), strict assertion that password hash is NEVER exposed.
- `database.js`: `deleteUser` edge cases (null/undefined/missing email, non-existent record), `readUsers` persistence and reliability.

Write generator/oracle tests, execute them, and write your report to:
`c:\Users\munta\Downloads\blue_collar\.agents\challenger_otp_2\handoff.md`.
End with clear verdict: APPROVE or FAIL.
Report back via send_message.
