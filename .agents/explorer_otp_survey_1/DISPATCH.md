# Dispatch for Explorer OTP Survey 1

## Mission
Investigate `server/controllers/authController.js`, `server/db/database.js`, and `server/data/` (or wherever users are stored).
Analyze:
1. Current implementation of `register` in `authController.js` — trace how user is saved vs how email/OTP is sent.
2. The `forgotPassword` function and the exact `this` binding issue.
3. The `getMe` function and how it uses `fs.readFileSync` vs the `db` module.
4. The structure of `server/db/database.js`, how users are queried, added, and what is needed for `deleteUser(email)` and `readUsers()`.
5. How unverified users (`isVerified: false`) vs verified users (`isVerified: true`) are represented and handled.

Output:
Write a comprehensive report to `c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_1\handoff.md`.
Include exact file paths, line numbers, function signatures, and recommendations.

## 2026-09-24T16:17:45Z
You are explorer_otp_survey_1.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_1
Original request path: c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md (read section ## 2026-09-24T16:15:16Z first).
Dispatch file: c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_1\DISPATCH.md

Your role is Auth & DB Codebase Explorer.
Investigate:
1. `server/controllers/authController.js` — inspect register, forgotPassword, getMe, login, verifyOtp, etc.
   - Trace current `register` flow: where user is created/saved vs where OTP is sent.
   - Trace `forgotPassword`: why is `this` failing/unbound?
   - Trace `getMe`: how does it currently access files via `fs.readFileSync` instead of the db module?
2. `server/db/database.js` — inspect current db methods (`findUserByEmail`, `saveUser`, etc.), how users are stored in `users.json`, and what functions exist.
   - Specify implementation requirements for `deleteUser(email)` and `readUsers()`.
3. Check `users.json` schema and how `isVerified` is used.

Write your complete findings and recommendations to `c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_1\handoff.md`.
Use send_message to report completion to parent.
