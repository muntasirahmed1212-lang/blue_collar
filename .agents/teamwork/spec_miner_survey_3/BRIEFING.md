# BRIEFING — 2026-09-25T18:38:00Z

## Mission
Extract and document the complete specification and acceptance criteria for the "Post Jobs" feature in blue_collar.

## 🔒 My Identity
- Archetype: specification_miner
- Roles: specification miner, teamwork specialist
- Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3
- Original parent: 351c76c1-e33d-43bb-9963-aff2c2f2d29b
- Milestone: survey_spec_mining

## 🔒 Key Constraints
- Read-only specification extraction. DO NOT modify any source code files.
- NEVER touch or modify js/components/authUI.js or js/services/authService.js.
- Write only to .agents/teamwork/spec_miner_survey_3/
- Send all results/handoff via send_message to parent (id: 351c76c1-e33d-43bb-9963-aff2c2f2d29b).

## Current Parent
- Conversation ID: 351c76c1-e33d-43bb-9963-aff2c2f2d29b
- Updated: not yet

## Task Summary
- **What to build**: Extract and document complete specification and acceptance criteria for "Post Jobs" feature across R1, R2, R3, R4, field specifications, auth rules, test suite specs, edge cases, and forbidden constraints.
- **Success criteria**: Comprehensive survey_spec.md and handoff.md written to working directory, verified against ORIGINAL_REQUEST.md and codebase, parent notified.
- **Interface contracts**: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md
- **Code layout**: c:\Users\munta\Downloads\blue_collar

## Key Decisions Made
- Confirmed existing 12 categories (`cat-1` to `cat-12`) in `js/data/categories.js` will serve as the category set for jobs.
- Confirmed existing auth pattern stores user in `users.json` with `role: "customer"|"admin"` and `isVerified: boolean`, with session managed via `express-session` (`req.session.userId`).
- Verified forbidden files (`js/components/authUI.js` and `js/services/authService.js`) are protected by existing regression test suite `tests/verify-all-ac.js`.
- Identified that "Post a Job" buttons in desktop header and mobile menu currently show a toast in `js/components/modal.js:9-19`, which must be wired to auth check and `#job-post-modal`.
- Produced comprehensive `survey_spec.md` with complete data dictionary, auth matrix, edge cases, and test specifications.

## Artifact Index
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\survey_spec.md — Detailed feature spec and edge cases
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\handoff.md — 5-component handoff report
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\progress.md — Liveness and progress tracking

## Loaded Skills
None
