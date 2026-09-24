# Dispatch for Spec Miner OTP Survey 2

## Mission
Mine and document exact API requirements and specifications for the Registration/OTP bug fix.
Reference:
1. `c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md` (section ## 2026-09-24T16:15:16Z)
2. Frontend integration points: `js/components/authUI.js` and `js/services/authService.js` (inspect read-only to verify expected request paths, headers, bodies, status codes, and response JSON formats).
3. Server route definitions (`server/routes/` or `server/server.js`).

Requirements to document:
- Exact endpoints (POST /api/auth/register, POST /api/auth/forgot-password, GET /api/auth/me, etc.)
- Request bodies, HTTP headers, success response codes & payloads.
- Error codes and messages (e.g. 400 'Email is already registered', 500 on SMTP failure, etc.)
- Strict backward compatibility constraints: verify zero modifications needed or allowed in frontend files.

Output:

## 2026-09-24T16:17:45Z
You are spec_miner_otp_survey_2.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\spec_miner_otp_survey_2
Original request path: c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md (read section ## 2026-09-24T16:15:16Z first).
Dispatch file: c:\Users\munta\Downloads\blue_collar\.agents\spec_miner_otp_survey_2\DISPATCH.md

Your role is API Spec Miner.
Mine and document exact API contracts and requirements:
1. Read `ORIGINAL_REQUEST.md` requirements R1, R2, R3 and acceptance criteria.
2. Read frontend files `js/components/authUI.js` and `js/services/authService.js` (read-only) to extract exact expectations: endpoint URLs, request payload fields, headers, expected response format/fields, error toast messages.
3. Read server routes in `server/routes/authRoutes.js` (or similar) to check route bindings.
4. Document the exact specifications for:
   - POST /api/auth/register (inputs, status codes, success response, error responses for SMTP error vs verified email conflict vs invalid input).
   - POST /api/auth/forgot-password (inputs, status codes, response).
   - GET /api/auth/me (auth header, status codes, response data shape).
   - Confirmation of zero frontend changes constraint.

Write your specification report to `c:\Users\munta\Downloads\blue_collar\.agents\spec_miner_otp_survey_2\handoff.md`.
Use send_message to report completion to parent.
