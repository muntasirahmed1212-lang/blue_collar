# Dispatch: worker_m4
Mission: Execute Milestone M4 Master Verification & Regression Suite
Working Directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m4

## 2026-09-25T20:20:14Z
You are worker_m4.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m4
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\TEST_READY.md

YOUR MISSION: Implement and execute Milestone M4: Full E2E & Zero Regression Verification.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

FORBIDDEN FILES (DO NOT TOUCH UNDER ANY CIRCUMSTANCES):
- js/components/authUI.js
- js/services/authService.js

YOUR TASKS:
1. Create a unified, comprehensive master test runner: `tests/verify-all.js`.
   This script must run all test suites across the project and ensure 100% pass rate:
   - `node tests/verify-jobs.js` (Tier 1-4 Post Jobs E2E Suite - 34 tests)
   - `node tests/verify-all-ac.js` (Auth, OTP, and regression criteria - 6 tests)
   - `node tests/verify-m2.js` (Milestone M2 component verification - 7 tests)
   - `node tests/verify-m3.js` (Milestone M3 component verification - 8 tests)
   - `node tests/adversarial-fuzzing-m1.test.js` (M1 fuzzing suite - 125 tests)
   - `node tests/adversarial-stress-m1.test.js` (M1 stress suite - 18 tests)
   - `node tests/adversarial-m2-buttons.test.js` (M2 button wiring suite - 25 tests)
   - `node tests/adversarial-m2-cdp.test.js` (M2 CDP browser suite - 33 tests)
   - `node tests/adversarial-m3-preview-nav.test.js` (M3 homepage & nav suite - 13 tests)
   - `node tests/adversarial-m3-review.js` (M3 adversarial review suite - 11 tests)
   - `node tests/challenger-m3-jobs-page.test.js` (M3 jobs page interaction suite - 40 tests)
   And output a unified summary table with total passed and failed counts.
2. Execute `node tests/verify-all.js` and verify all test suites succeed with 0 failures and exit code 0.
3. Check forbidden files:
   Run: `git status --porcelain js/components/authUI.js js/services/authService.js`
   Verify 100% clean output (zero lines/zero bytes modified).
4. Run a server smoke test: boot `node server.js` briefly to confirm clean startup without errors.
5. Write your comprehensive handoff report to:
   c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m4\handoff.md
When finished, send a message to parent summarizing results.
