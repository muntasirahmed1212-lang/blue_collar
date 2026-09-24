# BRIEFING — 2026-09-24T16:23:00Z

## Mission
Mine and document exact API contracts and requirements for POST /api/auth/register, POST /api/auth/forgot-password, GET /api/auth/me, and confirm zero frontend changes constraint.

## 🔒 My Identity
- Archetype: SPECIFICATION MINER
- Roles: API Spec Miner
- Working directory: c:\Users\munta\Downloads\blue_collar\.agents\spec_miner_otp_survey_2
- Original parent: 42b60d6a-04dc-421f-b1c0-6994049b33d4
- Milestone: OTP Registration & Auth API Spec Mining

## 🔒 Key Constraints
- Read-only on codebase outside .agents/spec_miner_otp_survey_2
- Mine exact API contracts and requirements
- Probe and document all discovered features and edge cases
- Strict zero frontend changes constraint

## Current Parent
- Conversation ID: 42b60d6a-04dc-421f-b1c0-6994049b33d4
- Updated: not yet

## Task Summary
- **What to build**: Specification report on auth APIs (registration, forgot-password, me)
- **Success criteria**: Exhaustive interface documentation, input/output shapes, status codes, error behaviors, edge cases, and zero frontend change verification.
- **Interface contracts**: c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md
- **Code layout**: c:\Users\munta\Downloads\blue_collar

## Key Decisions Made
- Analyzed frontend files `js/components/authUI.js` and `js/services/authService.js`: verified request/response contracts and confirmed zero frontend modifications are needed or permitted.
- Analyzed backend routes in `server/routes/auth.js` and controller in `server/controllers/authController.js`.
- Specified atomic registration contract (email first before DB persistence; unverified user cleanup; verified user conflict 400).
- Specified forgotPassword contract (fixing `this` binding error to call `sendOtp` properly).
- Specified getMe contract (refactoring to use exported `db.readUsers()` instead of raw `fs.readFileSync`).
- Documented full interface contracts, status codes, error handling, edge cases, and verification commands.

## Artifact Index
- handoff.md — Comprehensive API specification report
- progress.md — Liveness heartbeat and progress log
