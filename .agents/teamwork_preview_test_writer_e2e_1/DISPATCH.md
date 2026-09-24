## 2026-09-23T09:53:40Z
You are E2E Test Suite Architect.
Your working directory is: c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_test_writer_e2e_1
Your task is to design, implement, and prepare the automated E2E test suite for the BlueCollar Connect scroll animations project.

MANDATORY INPUT:
Read the authoritative user request and architectural blueprints:
- c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md
- c:\Users\munta\Downloads\blue_collar\.agents\PROJECT.md
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_explorer_survey_1\handoff.md
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_spec_miner_survey_2\handoff.md
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_explorer_survey_3\handoff.md

SCOPE & RESPONSIBILITIES:
1. Design and implement an automated, opaque-box E2E test suite across Tiers 1-4 per PROJECT.md and ORIGINAL_REQUEST.md:
   - Tier 1: Feature Coverage (fade-up, scale-up, char-by-char reveal, hero parallax, reduced motion gating, zero dependencies) >= 5 tests per feature.
   - Tier 2: Boundary & Corner Cases (empty grid containers, rapid scrolling, missing hero section, window resize, repeated filter toggling) >= 5 tests per feature.
   - Tier 3: Cross-Feature Combinations (pairwise interactions: dynamic card injection + stagger delay, reduced motion + dynamic reload, sticky sidebar during card entrance).
   - Tier 4: Real-World User Workloads (full user journeys: landing page scroll -> navigate to category -> filter pros -> sticky sidebar scroll -> profile view).
2. Build an executable test runner script (e.g. Node.js script using Puppeteer/Playwright or JSDOM/HTTP + browser automation) in tests/ (e.g. tests/e2e-scroll-animations.js) that:
   - Can start a local HTTP server or test local files directly.
   - Evaluates element computed styles before and after scroll (opacity: 0 -> opacity: 1, class is-visible).
   - Verifies dynamically injected cards in #home-categories-grid, #featured-pros-grid, and #all-categories-grid.
   - Verifies hero section inline opacity and transform change dynamically with scroll position.
   - Verifies fixed header (position: fixed) and category sidebar (position: sticky; top: 100px) bounding rects and computed styles during scroll.
   - Tests reduced motion behavior ((prefers-reduced-motion: reduce) renders all elements immediately visible without transitions).
   - Verifies zero external dependencies in package.json and HTML script tags.
3. Write TEST_INFRA.md and TEST_READY.md in c:\Users\munta\Downloads\blue_collar\.agents\TEST_INFRA.md and c:\Users\munta\Downloads\blue_collar\.agents\TEST_READY.md with the runner command, coverage table, and pass criteria.
4. Output your handoff report to:
   c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_test_writer_e2e_1\handoff.md
Notify the orchestrator with send_message when complete.
