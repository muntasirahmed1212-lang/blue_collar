# E2E Test Infrastructure Specification: BlueCollar Connect Scroll Animations

## 1. Executive Overview

The End-to-End (E2E) testing infrastructure for BlueCollar Connect provides automated, opaque-box browser testing of native scroll-triggered animations (`fade-up`, `scale-up`, `data-char-reveal`, hero parallax), layout stability (fixed header, sticky sidebars), and accessibility compliance (`prefers-reduced-motion: reduce`).

The test runner operates with **zero external npm dependencies**, executing directly via standard Node.js runtime APIs (`http`, `child_process`, `os`, `WebSocket`) and communicating with a headless Chromium browser (Microsoft Edge or Google Chrome) over the Chrome DevTools Protocol (CDP).

---

## 2. Infrastructure Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Node.js Test Runner                             │
│                  (tests/e2e-scroll-animations.js)                      │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌─────────────────────────────────────┐   ┌──────────────────────────────┐
│       Embedded HTTP Server          │   │      BrowserDriver (CDP)     │
│   - Ephemeral port (127.0.0.1)      │   │  - Spawns headless browser   │
│   - Correct MIME types (ES Modules) │   │  - Native WebSocket over CDP │
│   - Network request auditor         │   │  - Viewport & Media queries  │
└──────────────────┬──────────────────┘   └──────────────┬───────────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      ▼
                   ┌─────────────────────────────────────┐
                   │       Headless Chromium Browser     │
                   │    (Microsoft Edge / Google Chrome) │
                   │  - Real layout & box tree engine    │
                   │  - Real IntersectionObserver        │
                   │  - Real requestAnimationFrame       │
                   │  - Real CSS computed styles         │
                   └─────────────────────────────────────┘
```

### 2.1 Embedded Static HTTP Server
- **Implementation**: Built with Node.js native `http` module.
- **Port Allocation**: Dynamic ephemeral port (`server.listen(0, '127.0.0.1')`) to avoid port collisions in CI/CD or concurrent environments.
- **MIME Resolution**: Resolves `.html`, `.css`, `.js` (`application/javascript`), `.json`, `.svg`, etc., allowing ES module imports (`import('./pages/home.js')`) to execute without CORS or MIME type errors.
- **Request Auditing**: Tracks all outgoing network asset requests to verify zero external CDN animation dependencies.

### 2.2 Native Chrome DevTools Protocol (CDP) Driver
- **Browser Discovery**: Automatically locates installed Chromium binaries (Microsoft Edge on Windows/macOS/Linux or Google Chrome).
- **Process Isolation**: Spawns browser with `--headless=new`, `--remote-debugging-port=0`, and a dedicated temporary profile directory in `os.tmpdir()` that is cleaned up after execution.
- **WebSocket Protocol**: Establishes direct duplex JSON-RPC communication over Node.js v24 global `WebSocket` to CDP domains:
  - `Page`: Navigation, lifecycle event tracking (`Page.loadEventFired`).
  - `Runtime`: Evaluation of DOM state, computed styles, scroll dispatching.
  - `Emulation`: Emulating `prefers-reduced-motion: reduce` and screen viewport sizing.
  - `Network`: Intercepting requests and validating asset origins.

---

## 3. Test Runner CLI & Commands

### 3.1 Run Entire Test Suite (All Tiers)
```bash
node tests/e2e-scroll-animations.js
```
*Or explicitly:*
```bash
node tests/e2e-scroll-animations.js --tier=all
```

### 3.2 Run Individual Tiers
```bash
node tests/e2e-scroll-animations.js --tier=1    # Tier 1: Feature Coverage (32 tests)
node tests/e2e-scroll-animations.js --tier=2    # Tier 2: Boundary & Corner Cases (25 tests)
node tests/e2e-scroll-animations.js --tier=3    # Tier 3: Cross-Feature Combinations (10 tests)
node tests/e2e-scroll-animations.js --tier=4    # Tier 4: Real-World User Workloads (5 tests)
```

### 3.3 Verbose Mode
```bash
node tests/e2e-scroll-animations.js --verbose
```

---

## 4. Test Suite Coverage & Tier Taxonomy

| Tier | Category | Target Scope | Test Count | Pass Threshold |
|:---:|:---|:---|:---:|:---:|
| **Tier 1** | Feature Coverage | `fade-up`, `scale-up`, `char-reveal`, hero parallax, reduced motion, zero dependencies | 32 tests | 100% |
| **Tier 2** | Boundary & Corner Cases | Empty grids, rapid scrolling, missing hero, window resize, dynamic filter churn | 25 tests | 100% |
| **Tier 3** | Cross-Feature Combinations | Pairwise: dynamic cards + stagger, reduced motion + reload, sticky sidebar during entrance | 10 tests | 100% |
| **Tier 4** | Real-World User Workloads | Full multi-step user journeys across Home, Services, Category, Professional pages | 5 tests | 100% |
| **Total** | **Comprehensive E2E Suite** | **Complete project functionality and layout** | **72 tests** | **100%** |

---

## 5. Verification Capabilities & Assertions

1. **Computed Style Traversal**:
   - Evaluates `window.getComputedStyle(el)` before and after scroll.
   - Asserts transitions from `opacity: 0` -> `opacity: 1` and `transform: translateY(24px)` / `scale(0.92)` -> `matrix(1, 0, 0, 1, 0, 0)`.
2. **Dynamic Card Lifecycle**:
   - Asserts `data-animate="fade-up"` on dynamically injected elements in `#home-categories-grid`, `#featured-pros-grid`, `#all-categories-grid`, and `#pros-grid`.
   - Confirms `.is-visible` is appended when scrolled into viewport.
3. **Parallax Mechanics**:
   - Asserts dynamic decrement of `hero.style.opacity` (< 1.0) and increment of downward `translate3d(0, Ypx, 0)` as `scrollY` advances.
   - Verifies complete reset to `1.0` upon scrolling back to top.
4. **Layout Geometry (Fixed & Sticky)**:
   - Evaluates `header.getBoundingClientRect().top === 0` and `position: fixed`.
   - Evaluates `.sidebar-filters.getBoundingClientRect().top === 100px` and `position: sticky` within container boundaries.
5. **Accessibility Emulation**:
   - Uses CDP `Emulation.setEmulatedMedia` to emulate `prefers-reduced-motion: reduce`.
   - Asserts elements render with `opacity: 1 !important` and `transition: none` with zero scroll listeners executed.
6. **Zero Dependencies Audit**:
   - Inspects `package.json`, HTML `<script>` tags, CSS files, and `PerformanceResourceTiming` network entries to enforce zero external animation packages (GSAP, Framer Motion, Anime.js, etc.).

---

## 6. Exit Codes & CI Integration

- **Code `0`**: All executed tests passed successfully.
- **Code `1`**: One or more tests failed, or fatal runner exception occurred.
- Logs detail the exact failing assertion, expected value, received value, and execution duration.
