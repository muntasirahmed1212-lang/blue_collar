# Orchestration Plan: BlueCollar Connect Scroll Animations

## Objective
Implement native scroll-triggered content pop-up animations (fade-up, staggered grid reveal, scale-up, char-by-char reveal, parallax) with zero external dependencies according to `ORIGINAL_REQUEST.md`.

## Workflow Phases

### Phase 0: Survey & Requirements Mapping
- **Action**: Spawn 3 survey agents in parallel:
  - Agent 1: `teamwork_preview_explorer` (Codebase architecture, existing animation system, CSS/HTML structure).
  - Agent 2: `teamwork_preview_spec_miner` (Requirements extraction from `ORIGINAL_REQUEST.md`, contracts, data attributes, reduced motion).
  - Agent 3: `teamwork_preview_explorer` (Dynamic rendering pipelines in `js/pages/*.js`, DOM injection points, sticky/fixed layouts).
- **Deliverable**: Synthesized `PROJECT.md` at project root with Feature Inventory, Milestones, Interface Contracts, and Code Layout.

### Phase 1: Dual Track Execution
#### Track A: Implementation Track
- **Milestone 1**: CSS Animation System (`scroll-animations.css`)
  - Pure CSS classes for scroll animations using `data-animate` attributes.
  - Gated behind `@media (prefers-reduced-motion: no-preference)`.
  - Keyframes & utilities for `fade-up`, `scale-up`, and character-by-character reveals.
- **Milestone 2**: Animation Engine Refactor (`js/utils/animations.js`)
  - Robust `IntersectionObserver` supporting dynamically rendered elements.
  - Exported `observeNewElements(container)` to eliminate race conditions.
  - `initHeroParallax()` for hero section fade-out and shrink effect.
  - `initCharReveal()` for section titles.
- **Milestone 3**: HTML & Dynamic Rendering Updates
  - Static HTML markup updates across all pages.
  - Dynamic JS template literals in `js/pages/*.js` updated with `data-animate`.
  - Integration of `observeNewElements()` post-render.
  - Verification of fixed/sticky positioning integrity.
- **Milestone 4**: Final E2E Pass (Tiers 1-4)
  - Execute all E2E tests, resolve failures.
- **Milestone 5**: Adversarial Coverage Hardening (Tier 5)
  - Challenger stress-testing and edge-case hardening.

#### Track B: E2E Testing Track
- Develop comprehensive test harness and test suites (Tiers 1-4).
- Verify browser rendering, dynamic card intersection, hero parallax math, and fixed/sticky element stability.
- Publish `TEST_READY.md`.

### Phase 2: Verification, Forensic Audit & Reporting
- Final Reviewer and Challenger sign-offs.
- Mandatory Forensic Auditor check (`teamwork_preview_auditor`).
- Generate final completion report to user.
