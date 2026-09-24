# Dispatch for Explorer OTP Survey 3

## Mission
Investigate email service, OTP handling, and server testing infrastructure.
Analyze:
1. `server/services/emailService.js` (or email utility) — how is SMTP configured? What nodemailer / mailer setup is used? How does `sendOtp` work?
2. How email delivery errors are caught, formatted, and propagated when SMTP is broken or fails.
3. Existing test setup in the repo (package.json scripts, test frameworks like mocha/jest/supertest/native node test runner).
4. Recommended strategy for automated testing of:
   - Broken SMTP causing 500 and zero database mutation in `users.json`.
   - Re-registration with unverified email replacing stale record.
   - Registration with verified email returning 400 'Email is already registered'.
   - `forgotPassword` triggering `sendOtp` without crashing.
   - Authenticated `/api/auth/me` returning correct user data.

Output:
Write a comprehensive report to `c:\Users\munta\Downloads\blue_collar\.agents\explorer_otp_survey_3\handoff.md`.

## 2026-09-24T16:17:45Z
Investigate:
1. `server/services/emailService.js` (or mailer setup): how OTP emails are generated and sent, how nodemailer is configured, what environment variables or mocks are used.
2. How errors from `emailService.sendOtp` or nodemailer are caught/handled or thrown.
3. Test infrastructure in `package.json`, existing tests in `server/tests` or `tests/`. How backend server tests are currently run or can be executed (e.g. node --test, jest, mocha, supertest, or standalone node scripts).
4. Concrete test strategy for the 5 acceptance criteria:
   - Broken SMTP -> 500 & database left clean
   - Unverified email re-registration -> 200/201 success & stale record overwritten/cleaned
   - Verified email re-registration -> 400 error 'Email is already registered'
   - Forgot password -> triggers sendOtp without crashing
   - Authenticated GET /api/auth/me -> returns user data
