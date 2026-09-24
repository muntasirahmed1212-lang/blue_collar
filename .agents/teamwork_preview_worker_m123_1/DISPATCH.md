## 2026-09-23T15:23:40Z

You are Worker 1 (Animation Systems Implementation Worker).
Your working directory is: c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_worker_m123_1
Your task is to implement the native scroll-triggered animation system for BlueCollar Connect according to the project specifications.

MANDATORY INPUT:
Read the authoritative user request and architectural blueprints before writing code:
- c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md
- c:\Users\munta\Downloads\blue_collar\.agents\PROJECT.md
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_explorer_survey_1\handoff.md
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_spec_miner_survey_2\handoff.md
- c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_explorer_survey_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

WRITE OWNERSHIP:
You exclusively own and may edit the following files:
- css/scroll-animations.css (new file)
- js/utils/animations.js
- HTML files: index.html, services.html, category.html, professional.html, how-it-works.html, about.html
- JS page files: js/pages/home.js, js/pages/services.js, js/pages/category.js, js/pages/professional.js

IMPLEMENTATION SCOPE:
1. R1: Create css/scroll-animations.css
   - Pure CSS classes for scroll animations using data-animate attributes:
     - [data-animate="fade-up"]: starts at opacity: 0; transform: translateY(24px); transitions to opacity: 1; transform: translateY(0); when .is-visible is present.
     - [data-animate="scale-up"]: starts at opacity: 0; transform: scale(0.92); transitions to opacity: 1; transform: scale(1); when .is-visible is present.
     - [data-char-reveal] .char: starts at opacity: 0; transform: translateY(14px); transitions to opacity: 1; transform: translateY(0); when parent has .is-visible.
   - Gated strictly inside @media (prefers-reduced-motion: no-preference).
   - In @media (prefers-reduced-motion: reduce): all [data-animate] and [data-char-reveal] .char have opacity: 1 !important; transform: none !important; transition: none !important;.
2. R2: Refactor js/utils/animations.js
   - Robust IntersectionObserver (threshold: 0.1, rootMargin: '0px 0px -40px 0px').
   - Export observeNewElements(container = document): queries [data-animate]:not(.is-visible) and [data-char-reveal]:not(.is-visible), applies staggered transitionDelay or CSS variables to grid children, and attaches them to the observer. Resets transitionDelay after animation to ensure snappy hover effects.
   - Export initHeroParallax(): scroll event listener with requestAnimationFrame ticking modifying inline opacity (1 -> 0) and transform (translateY + scale) on .hero-section dynamically as user scrolls down.
   - Export initCharReveal(container = document): tokenizes section title characters into accessible spans with aria-label on parent and aria-hidden="true" on wrapper.
   - Preserve existing initCounterAnimation() and initPageTransitions().
3. R3: HTML and Dynamic Template Updates
   - Link css/scroll-animations.css in all 6 HTML files.
   - In index.html: Hero title has data-char-reveal, Hero subtitle/search bar has data-animate="fade-up", section titles have data-char-reveal, and the CTA card (.cta-card.glass-panel) has data-animate="scale-up".
   - In services.html, category.html, professional.html, how-it-works.html, about.html: tag appropriate static headings and cards with data-animate and data-char-reveal.
   - In js/pages/home.js, js/pages/services.js, js/pages/category.js, js/pages/professional.js: inject data-animate="fade-up" into dynamic card template literals, and invoke observeNewElements(grid) immediately after innerHTML is injected and icons are initialized.
   - Ensure sticky positioning (.sidebar-filters in category.html, .sticky-top in professional.html) and fixed header are NOT broken. Never add overflow-x: hidden to html or body.
4. R4: Zero Dependencies
   - Pure native JS and CSS. No GSAP, Framer Motion, Anime.js, etc.

VERIFICATION:
Run tests/verification locally using a local HTTP server and console/browser scripts.
Verify that:
- Scrolling down triggers elements to gain .is-visible and transition to opacity: 1.
- Dynamically rendered cards receive .is-visible upon intersection.
- Hero section inline opacity and transform update dynamically during scroll.
- Sticky and fixed elements stay functional.
- Reduced motion setting shows all content immediately.

Output your comprehensive handoff report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork_preview_worker_m123_1\handoff.md
Notify the orchestrator with send_message when complete.
