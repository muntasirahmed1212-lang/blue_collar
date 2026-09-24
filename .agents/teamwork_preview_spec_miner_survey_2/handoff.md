# Specification Mining & Requirements Analysis Report: Native Scroll Animations System

**Author**: Spec Miner 2 (Requirements & Specification Miner)  
**Target Project**: BlueCollar Connect (`c:\Users\munta\Downloads\blue_collar`)  
**Working Directory**: `.agents/teamwork_preview_spec_miner_survey_2/`  
**Status**: Complete  

---

## 1. Observation

### 1.1 Authoritative Request Context
- **Source File**: `c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md` (Lines 1–40).
- **Core Objective**: "Implement native scroll-triggered content pop-up animations (fade-up, staggered grid reveal, scale-up, char-by-char reveal, parallax) in the BlueCollar Connect project based on the approved implementation plan."
- **Integrity Mode**: `development`.
- **Architectural Imperatives**:
  1. Pure native implementation (Zero external dependencies: GSAP, Framer Motion, Anime.js, etc. are strictly disallowed).
  2. Gated behind accessibility preferences: `prefers-reduced-motion: no-preference`.
  3. Decouple styling from JS runtime using CSS classes and `data-animate` / `data-char-reveal` attributes.
  4. Fix existing dynamic rendering race condition where cards injected after DOM load miss observer attachment.
  5. Preserve existing fixed (`header`) and sticky (`.sidebar-filters`, `.booking-card`) layout integrity without broken clipping or overflow constraints.

### 1.2 Codebase Baseline Observations
1. **Existing Animation Implementation (`js/utils/animations.js`, Lines 1–130)**:
   - Line 7: Statically queries `.category-card, .service-card, .step-card, .feature-item, .pro-card`.
   - Lines 28–33: Hardcodes initial hidden state via direct DOM inline styles:
     ```javascript
     el.style.opacity = '0';
     el.style.transform = 'translateY(20px)';
     el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
     ```
   - Lines 35–52: Instantiates a single `IntersectionObserver` that sets `entry.target.style.opacity = '1'` and `entry.target.style.transform = 'translateY(0)'`, unobserves the element, and uses `setTimeout(..., 600)` to reset `transitionDelay = '0ms'`.
   - Lines 56–76: Implements `initCounterAnimation()` using an `IntersectionObserver` on `.stat-number` with easing calculation in `animateValue()`.
   - Lines 109–129: Implements `initPageTransitions()` for fallback page exit animations.
   - **Race Condition Observed**: In `js/app.js` (lines 19–36), `initScrollAnimations()` executes synchronously on `DOMContentLoaded`. However, page routing dynamically imports page modules asynchronously (`import('./pages/home.js').then(module => module.initHome())`), which render cards into the DOM *after* `initScrollAnimations()` has already run. Consequently, dynamic cards miss the observer and remain hidden or unanimated.

2. **Dynamic Rendering Modules (`js/pages/*.js`)**:
   - `js/pages/home.js` (Lines 11–28, 31–67): `renderCategories()` injects 8 `.category-card` elements into `#home-categories-grid`; `renderFeaturedPros()` injects 6 `.pro-card` elements into `#featured-pros-grid`. Neither applies animation attributes nor notifies `animations.js`.
   - `js/pages/category.js` (Lines 44–88, 137–167): `renderPros()` injects `.pro-card` elements into `#pros-grid` and re-renders on filtering/sorting. Dynamic cards lack animation attributes and observer re-registration.
   - `js/pages/services.js` (Lines 11–54): `renderGrid()` injects `.service-card-full` elements into `#all-categories-grid` on initial load and upon real-time input filtering.
   - `js/pages/professional.js` (Lines 60–88): Injects dynamic `.gallery-img` and `.review-item` elements into `#pro-gallery` and `#pro-reviews`.

3. **Layout & Positioning Constraints (`css/` and HTML files)**:
   - `css/header.css` (Lines 2–19): `header { position: fixed; top: 0; left: 0; width: 100%; z-index: var(--z-header); }`.
   - `css/category.css` (Lines 41–47): `.sidebar-filters { position: sticky; top: 100px; height: fit-content; }`.
   - `css/professional.css` (Lines 140–148): `.sticky-top { position: sticky; top: 100px; }`.
   - Sticky positioning failure vector: Any parent container possessing `overflow: hidden`, `overflow-x: hidden`, active CSS `transform` (other than `none`), or `contain: paint` breaks `position: sticky` context for descendant sidebars.

4. **Design Tokens & Motion Values (`css/variables.css`, Lines 131–135)**:
   - `--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);`
   - `--transition-normal: 300ms cubic-bezier(0.4, 0, 0.2, 1);`
   - `--transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);`

---

## 2. Logic Chain

1. **Separation of Concerns (CSS Declarative vs. JS Reactive)**:
   - *Observation*: Existing code directly mutates inline styles in JavaScript, which causes style recalculations, conflicts with hover/active transitions, and fails if elements are inserted dynamically.
   - *Deduction*: By moving presentation rules to a dedicated `scroll-animations.css` with attribute selectors (`[data-animate="fade-up"]`, `[data-animate="scale-up"]`, `[data-char-reveal]`) and state class `.is-visible`, JavaScript's role is narrowed to setting the `.is-visible` class upon intersection. This satisfies R1 and simplifies debugging.

2. **Gating Behind Accessibility Standards**:
   - *Observation*: ORIGINAL_REQUEST.md R1 explicitly mandates `prefers-reduced-motion: no-preference`.
   - *Deduction*: In `scroll-animations.css`, all transform and opacity transitions must be enclosed inside `@media (prefers-reduced-motion: no-preference)`. A fallback `@media (prefers-reduced-motion: reduce)` block must ensure `[data-animate]` elements default to `opacity: 1 !important` and `transform: none !important`, preventing invisible content for vestibular-impaired users. JavaScript functions (`initHeroParallax`, `initCharReveal`) must likewise check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and abort early.

3. **Resolving the Race Condition via `observeNewElements(container)`**:
   - *Observation*: Page modules asynchronously populate grids via `.innerHTML = markup`. Synchronous DOMContentLoaded observation misses these elements. Furthermore, filtering on `category.html` and `services.html` creates new elements repeatedly.
   - *Deduction*: A reusable function `observeNewElements(container = document)` must be exported by `js/utils/animations.js`. Each page script must invoke `observeNewElements(grid)` immediately after updating `grid.innerHTML`. This guarantees all dynamic cards are registered with the observer regardless of render timing.

4. **Preserving Layout Integrity for Sticky & Fixed Components**:
   - *Observation*: Acceptance criteria specifies verifying that `header` (fixed) and `.sidebar-filters` (sticky in `category.html`) do not break.
   - *Deduction*: In CSS, once an animated element enters the viewport and `.is-visible` is applied, `transform` must resolve to `none` (or `matrix(1,0,0,1,0,0)` without persistent 3D context) so the element does not create a new containing block for sticky descendants. Global containers like `.layout-with-sidebar`, `.main-content`, and `body` must not have `overflow: hidden` or `overflow-x: clip` applied carelessly.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| F01 | CSS Animation | Base Animated Attribute System | Declares base transitions and initial hidden state for elements tagged with `data-animate` | HTML `data-animate` attribute on element | CSS rule: `opacity: 0`, transition properties applied | Graceful fallback if attribute value is unknown (applies base fade) | ORIGINAL_REQUEST.md § R1 |
| F02 | CSS Animation | `fade-up` Animation Variant | Translates element down initially (`translateY(24px)`) and animates to `translateY(0)` + `opacity: 1` when `.is-visible` is added | `data-animate="fade-up"` | Initial: `opacity: 0; transform: translateY(24px)`; Visible: `opacity: 1; transform: translateY(0)` | Fallback to `transform: none` on reduced motion | ORIGINAL_REQUEST.md § R1 |
| F03 | CSS Animation | `scale-up` Animation Variant | Scales element down initially (`scale(0.92)`) and animates to `scale(1)` + `opacity: 1` when `.is-visible` is added | `data-animate="scale-up"` | Initial: `opacity: 0; transform: scale(0.92)`; Visible: `opacity: 1; transform: scale(1)` | Fallback to `transform: none` on reduced motion | ORIGINAL_REQUEST.md § R1, § R3 |
| F04 | CSS Animation | Character Reveal Animation | Animates wrapped characters sequentially via staggered delay calculation | `[data-char-reveal]` parent with `.char` children | Initial: `.char { opacity: 0; transform: translateY(12px) }`; Visible: `.char { opacity: 1; transform: none }` | Displays intact text with `opacity: 1` under reduced motion | ORIGINAL_REQUEST.md § R1, § R2 |
| F05 | CSS Animation | Staggered Grid Reveal | Applies incremental delay to children of grids (`category-grid`, `pros-grid`, etc.) to create waterfall entry | `--stagger-index` CSS variable or inline `transitionDelay` | `transition-delay: calc(var(--stagger-index, 0) * 60ms)` | Fallback to 0ms delay if variable missing | ORIGINAL_REQUEST.md § R1, animations.js:9-25 |
| F06 | Accessibility | Reduced Motion Gating | Disables all animation transitions and displays elements fully visible when user prefers reduced motion | OS media query `(prefers-reduced-motion: reduce)` | Overrides: `opacity: 1 !important`, `transform: none !important`, `transition: none !important` | Silent accessibility guarantee | ORIGINAL_REQUEST.md § R1 |
| F07 | JS Engine | Core IntersectionObserver | Observes DOM elements entering the viewport, toggling `.is-visible` and unobserving | Threshold: `0.1`, rootMargin: `'0px 0px -40px 0px'` | Adds `is-visible` class to entry target | Ignores already observed or visible targets | ORIGINAL_REQUEST.md § R2 |
| F08 | JS Engine | `observeNewElements(container)` | Public API to query and attach `IntersectionObserver` to newly injected DOM nodes | `container: Element \| Document = document` | None (elements attached to observer) | If `container` is invalid or null, safely defaults or returns | ORIGINAL_REQUEST.md § R2 |
| F09 | JS Engine | Hero Parallax Fade-Out & Shrink | Dynamically modifies hero opacity and transform on scroll via `requestAnimationFrame` | Scroll position (`window.scrollY`) | Updates `hero.style.opacity` and `hero.style.transform` | Safe early exit if `.hero-section` is absent on current page | ORIGINAL_REQUEST.md § R2, § R3 |
| F10 | JS Engine | Character Tokenizer (`initCharReveal`) | Tokenizes title text into span elements with index variables and accessibility `aria-label` | Element with `[data-char-reveal]` | Wraps text in `<span class="char" style="--char-index: N">` | Preserves HTML entities, skips already initialized elements | ORIGINAL_REQUEST.md § R2, § R3 |
| F11 | JS Engine | Numeric Counter Animation | Counts numbers up smoothly upon scroll entry (`initCounterAnimation`) | Elements matching `.stat-number` | Animated numerical text value | Preserves suffix (`+`, `K+`) and floats | Existing animations.js:59-107 |
| F12 | JS Engine | Cross-Document Page Transitions | Smooth page exit transition fallback for older browsers | Click event on internal links | Adds `.page-exit` to body, delays navigation 150ms | Bypasses external/target="_blank" links | Existing animations.js:109-129 |
| F13 | HTML Markup | Static Page Animation Tagging | Tags static headings, heroes, and cards with `data-animate` across all 6 HTML pages | Static HTML elements in `*.html` | Static attributes `data-animate="..."` and `data-char-reveal` | Valid HTML5 compliant custom attributes | ORIGINAL_REQUEST.md § R3 |
| F14 | JS Template | Dynamic Template Tagging | Injects `data-animate="fade-up"` into template literals in `js/pages/*.js` | Card templates in `home.js`, `category.js`, `services.js`, `professional.js` | Rendered HTML strings include `data-animate="fade-up"` | Fallback styling applies if JS fails | ORIGINAL_REQUEST.md § R3 |
| F15 | JS Integration | Post-Injection Observer Call | Invokes `observeNewElements(grid)` after every dynamic DOM insertion | Grid container element | Newly injected cards are observed immediately | Eliminates rendering race condition | ORIGINAL_REQUEST.md § R3 |
| F16 | Architecture | Zero External Dependencies | Entire system implemented using native web APIs (`IntersectionObserver`, `rAF`, native CSS) | Native browser runtime | No external script tags or npm packages added | Rejects GSAP/Framer Motion | ORIGINAL_REQUEST.md § R4 |
| F17 | Layout Stability | Sticky & Fixed Layout Integrity | Ensures sticky sidebars and fixed header maintain continuous functional geometry during scroll | CSS rules on animated parent containers | Header stays fixed at viewport top; category sidebar sticks at 100px | Prevents containing-block trapping caused by lingering `transform` | ORIGINAL_REQUEST.md § Acceptance Criteria |

---

## 4. Edge Cases

| # | Feature | Input / Condition | Observed / Mandated Behavior |
|---|---------|-------------------|-----------------------------|
| E01 | Reduced Motion | User has `prefers-reduced-motion: reduce` active in OS/browser | All elements must be immediately visible (`opacity: 1 !important`), `transform: none !important`, transitions disabled (0s). JS hero parallax and char reveals must bypass style/DOM mutations. |
| E02 | Race Condition | `DOMContentLoaded` fires and `initScrollAnimations` executes before page module fetches data and renders cards | `initScrollAnimations` registers static elements; dynamic page script invokes `observeNewElements(grid)` immediately post-render, attaching observer without delay. |
| E03 | Dynamic Re-filtering | User types in service search filter or changes category filter repeatedly (`category.js`, `services.js`) | Container `.innerHTML` is replaced. `observeNewElements(grid)` must be re-invoked. Observer gracefully attaches to fresh nodes; garbage-collected old nodes are unobserved by browser. |
| E04 | Complex Title Text | Title has HTML child nodes (e.g. `<span class="text-primary">Professionals</span>`) or `<br>` tags | Tokenizer must preserve child tags/spans and word breaks, tokenizing only text nodes while maintaining inline nesting, or apply `data-char-reveal` specifically to inner text targets. Parent receives `aria-label` with complete string. |
| E05 | Missing Hero Section | Secondary pages (`category.html`, `services.html`, etc.) execute `initHeroParallax()` | Function checks `const hero = document.querySelector('.hero-section'); if (!hero) return;`. Exits silently with no console errors or detached scroll listeners. |
| E06 | Instant Scroll / Fast Scroll | User scrolls rapidly (e.g., page refresh at mid-page, anchor jump, or fast flick) | `IntersectionObserver` fires for all intersected elements simultaneously. Elements transition smoothly; `threshold: 0.1` ensures triggers activate even on rapid traversal. |
| E07 | Above-the-Fold Content | Elements with `data-animate` (e.g., Hero subtitle, search bar) visible immediately upon page load | `IntersectionObserver` fires on initial load turn. `.is-visible` is attached within the first frame (~16ms). User experiences a clean entry transition rather than a blank page. |
| E08 | Sticky Sidebar Breakage | Parent of `.sidebar-filters` has `transform` or `overflow: hidden` applied | In CSS, `.is-visible` must set `transform: none;`. No ancestor container of the sidebar (`.layout-with-sidebar`, `.section`, `main`) may specify `overflow: hidden` or permanent 3D transforms. |
| E09 | Hover Transition Blocking | Card has `transition-delay: 240ms` from stagger; user hovers card immediately after it appears | Observer attaches a one-time `transitionend` listener (or `setTimeout` fallback of 600ms) that clears `style.transitionDelay = '0ms'`, restoring instant interactive hover lifts. |
| E10 | Null / Invalid Container | `observeNewElements(null)` or `observeNewElements(document.getElementById('non-existent'))` called | Function defaults safely: `const root = container || document;` and validates `root.querySelectorAll` before executing queries. No exceptions thrown. |
| E11 | Screen Reader Pronunciation | Screen reader encounters character-by-character span markup (`<span class="char">H</span><span class="char">e</span>...`) | Without mitigation, screen reader pronounces each letter as an isolated word. Spec mandates setting `aria-label="Full Title"` on heading and `aria-hidden="true"` on the tokenized span container. |
| E12 | View Transition Navigation | Page navigation occurs via View Transitions API | Animations must not conflict with `::view-transition-old` or `::view-transition-new`. Gating animations behind `.is-visible` ensures clean cross-document fades without mid-flight transform collisions. |

---

## 5. Detailed Requirements Extraction

### R1. CSS Animation System (`css/scroll-animations.css`)
1. **File Location**: New stylesheet at `c:\Users\munta\Downloads\blue_collar\css\scroll-animations.css`.
2. **Linked In**: All 6 HTML pages (`index.html`, `services.html`, `category.html`, `professional.html`, `how-it-works.html`, `about.html`) in `<head>` after `components.css`.
3. **Core Selectors**:
   - `[data-animate]`: Base selector establishing `opacity: 0`, transition curve (`cubic-bezier(0.16, 1, 0.3, 1)` or `ease-out`), duration (`0.6s`), and `will-change: opacity, transform`.
   - `[data-animate="fade-up"]`: Initial transform `translateY(24px)`.
   - `[data-animate="scale-up"]`: Initial transform `scale(0.92)`.
   - `[data-animate].is-visible`: State selector restoring `opacity: 1`, `transform: none`.
   - `[data-char-reveal] .char`: Display `inline-block`, initial `opacity: 0; transform: translateY(12px)`.
   - `[data-char-reveal].is-visible .char`: `opacity: 1; transform: translateY(0); transition-delay: calc(var(--char-index, 0) * 30ms)`.
4. **Accessibility Gating**:
   - All animation and transition styles wrapped in `@media (prefers-reduced-motion: no-preference)`.
   - Explicit fallback in `@media (prefers-reduced-motion: reduce)`:
     ```css
     @media (prefers-reduced-motion: reduce) {
       [data-animate],
       [data-char-reveal] .char {
         opacity: 1 !important;
         transform: none !important;
         transition: none !important;
       }
     }
     ```

### R2. Refactor Animation Engine (`js/utils/animations.js`)
1. **File Location**: `c:\Users\munta\Downloads\blue_collar\js\utils\animations.js`.
2. **Global Observer Management**:
   - Single shared `IntersectionObserver` configured with `threshold: 0.1` and `rootMargin: '0px 0px -40px 0px'`.
   - Entry callback: adds `is-visible` to `entry.target`, unobserves `entry.target`, and sets a timer/listener to reset `transitionDelay` to `0ms`.
3. **Exported Public Functions**:
   - `export function initScrollAnimations()`: Entrypoint initializing static elements, hero parallax, character reveal, and number counters.
   - `export function observeNewElements(container = document)`: Attaches the observer to all unobserved elements matching `[data-animate]:not(.is-visible)` and `[data-char-reveal]:not(.is-visible)` within the specified container.
   - `export function initHeroParallax()`: Scroll event listener with `requestAnimationFrame` ticking that calculates `scrollY / heroHeight` and applies inline `opacity` (1 to 0) and `transform` (`translateY` + `scale`) to `.hero-section` or `.hero-content`.
   - `export function initCharReveal()`: Finds all `[data-char-reveal]` elements, splits text content into accessible span tokens with `--char-index`, and tags them for intersection observation.
   - `export function initPageTransitions()`: Retained for cross-page transition support.

### R3. HTML and Dynamic Rendering Updates
1. **Static HTML Tagging**:
   - **`index.html`**:
     - Hero title: `data-char-reveal`
     - Hero subtitle, search bar: `data-animate="fade-up"`
     - Stats section items: `data-animate="fade-up"`
     - Trust bar: `data-animate="fade-up"`
     - Section titles (Categories, Featured Pros): `data-char-reveal`
     - Homepage CTA card (`.cta-card`): `data-animate="scale-up"` (Mandatory explicit requirement)
   - **`services.html`**:
     - Header title: `data-char-reveal`
     - Header subtitle & search filter box: `data-animate="fade-up"`
   - **`category.html`**:
     - Category hero elements: `data-animate="fade-up"`
     - Sidebar filters: `data-animate="fade-up"` (ensuring `transform: none` on `.is-visible`)
   - **`professional.html`**:
     - Profile header, stats boxes, bio, skills, past work, review sections: `data-animate="fade-up"`
     - Section headings: `data-char-reveal`
   - **`how-it-works.html`**:
     - Hero title: `data-char-reveal`
     - All 4 step cards (`.step-card`): `data-animate="fade-up"`
     - CTA card: `data-animate="scale-up"`
   - **`about.html`**:
     - Hero title: `data-char-reveal`
     - Feature cards (`.feature-item`): `data-animate="fade-up"`
2. **Dynamic Rendering Modules**:
   - **`js/pages/home.js`**:
     - Update `renderCategories()`: Add `data-animate="fade-up"` and `--stagger-index` to `.category-card` template string. Call `observeNewElements(grid)` after `grid.innerHTML = markup`.
     - Update `renderFeaturedPros()`: Add `data-animate="fade-up"` and `--stagger-index` to `.pro-card` template string. Call `observeNewElements(grid)` after `grid.innerHTML = markup`.
   - **`js/pages/category.js`**:
     - Update `renderPros()`: Add `data-animate="fade-up"` and `--stagger-index` to `.pro-card` template string. Call `observeNewElements(grid)` after `grid.innerHTML = markup`.
   - **`js/pages/services.js`**:
     - Update `renderGrid()`: Add `data-animate="fade-up"` and `--stagger-index` to `.service-card-full` template string. Call `observeNewElements(grid)` after `grid.innerHTML = markup`.
   - **`js/pages/professional.js`**:
     - Call `observeNewElements()` on gallery and review containers after populating.

### R4. Zero Dependencies
1. **Rule**: Strict prohibition of external animation runtimes (GSAP, Framer Motion, Anime.js, Lottie, Velocity, jQuery).
2. **Acceptable Primitives**:
   - Native ECMAScript standard features (ES Modules, DOM APIs, `requestAnimationFrame`, `matchMedia`, `IntersectionObserver`).
   - Native CSS3/CSS4 features (Transitions, Transforms, Custom Properties, Media Queries).

---

## 6. Contract Signatures & Data Specifications

### Contract 1: `observeNewElements(container)`
```typescript
/**
 * Observes newly injected DOM elements for scroll-triggered animations.
 * Connects elements matching `[data-animate]:not(.is-visible)` and
 * `[data-char-reveal]:not(.is-visible)` to the shared IntersectionObserver.
 *
 * @param {Element | Document} [container=document] - The parent DOM node containing new elements.
 * @returns {void}
 */
export function observeNewElements(container: Element | Document = document): void;
```
- **Preconditions**:
  - `container` is a valid DOM node or defaults to `document`.
  - DOM contains elements with `data-animate` or `data-char-reveal` attributes.
- **Postconditions**:
  - Unobserved elements inside `container` are registered with the observer.
  - If `container` is a grid, children receive progressive `transitionDelay` or `--stagger-index`.
  - Under `prefers-reduced-motion: reduce`, candidates immediately receive `.is-visible`.
- **Exception Safety**: Does not throw on empty NodeLists or invalid container arguments.

### Contract 2: `initHeroParallax()`
```typescript
/**
 * Binds a throttled scroll listener to animate hero section fade-out and scale shrink.
 * Modifies inline `opacity` and `transform` on the target hero element dynamically.
 *
 * @returns {void}
 */
export function initHeroParallax(): void;
```
- **Preconditions**:
  - Page may or may not contain `.hero-section` or `.hero-content`.
- **Postconditions**:
  - If hero element exists and reduced motion is false, scroll listener is bound.
  - While scrolling through hero height:
    - `opacity` scales from `1.0` down to `0.0`.
    - `transform` applies downward parallax translate and subtle scale down (e.g. `scale(0.95)`).
  - When scrolled back to top (`scrollY = 0`), values reset to `opacity = 1` and `transform = translate3d(0, 0, 0) scale(1)`.
- **Exception Safety**: Safely returns early if target element does not exist.

### Contract 3: `initCharReveal()`
```typescript
/**
 * Splits section titles tagged with `data-char-reveal` into individual character span tokens.
 * Configures accessibility attributes (aria-label, aria-hidden) and attaches elements to observer.
 *
 * @returns {void}
 */
export function initCharReveal(): void;
```
- **Preconditions**:
  - DOM contains elements with attribute `[data-char-reveal]`.
- **Postconditions**:
  - Element text content is preserved in `aria-label`.
  - Text is tokenized into `<span class="char" style="--char-index: N">` wrapped in `<span aria-hidden="true">`.
  - Spaces are preserved using `&nbsp;` or spacing tokens.
  - Element is registered with the IntersectionObserver to receive `.is-visible` upon entry.
- **Exception Safety**: Ignores empty headings or elements already tokenized (`data-char-initialized="true"`).

### Contract 4: Data Attributes & CSS State Specification
```
[data-animate="fade-up"]
├── Pre-scroll: opacity: 0; transform: translateY(24px);
└── Intersected: class="is-visible" -> opacity: 1; transform: none;

[data-animate="scale-up"]
├── Pre-scroll: opacity: 0; transform: scale(0.92);
└── Intersected: class="is-visible" -> opacity: 1; transform: none;

[data-char-reveal]
├── Markup: <h2 class="section-title" data-char-reveal aria-label="Title">
│             <span aria-hidden="true" class="char-reveal-wrapper">
│               <span class="char" style="--char-index: 0">T</span>...
│             </span>
│           </h2>
├── Pre-scroll: .char { opacity: 0; transform: translateY(12px); }
└── Intersected: class="is-visible" -> .char { opacity: 1; transform: translateY(0); transition-delay: calc(var(--char-index) * 30ms); }
```

---

## 7. Acceptance Criteria Analysis & Verification Checklist

The implementation must be evaluated by an independent auditing agent ("Agent-as-Judge") using headless/live browser automation tools (e.g., Chrome DevTools MCP or Playwright). The following checklist specifies the exact evaluation criteria:

### Acceptance Checklist
- [ ] **Check 1: Static Scroll Entry Verification**
  - *Method*: Load `index.html` in browser. Before scrolling, verify that off-screen elements with `data-animate` (e.g., `.trust-bar`, `.cta-card`) have computed `opacity === "0"`. Scroll down to bring them into view. Confirm that the class `is-visible` is appended and computed `opacity` changes to `"1"`.
- [ ] **Check 2: Dynamic Card Intersection Verification**
  - *Method*: Load `index.html` and `services.html`. Wait for dynamic card population. Confirm that cards in `#home-categories-grid`, `#featured-pros-grid`, and `#all-categories-grid` possess `data-animate="fade-up"`. Scroll each grid into the viewport. Confirm that each card receives `.is-visible` and transitions to `opacity: 1`.
- [ ] **Check 3: Hero Parallax Dynamic Inline Style Verification**
  - *Method*: Load `index.html` at `scrollY = 0`. Read `heroElement.style.opacity` (or computed opacity). Execute `window.scrollTo(0, 150)`. Verify that `heroElement.style.opacity` decreases dynamically (e.g., `< 0.9`) and `heroElement.style.transform` reflects active `translate` / `scale`. Execute `window.scrollTo(0, 0)` and confirm values restore.
- [ ] **Check 4: Fixed and Sticky Layout Stability Verification**
  - *Method*: Load `category.html?cat=plumbing`. Scroll down by 600px. Verify that `header.getBoundingClientRect().top === 0` (fixed positioning unbroken). Verify that `.sidebar-filters.getBoundingClientRect().top` stabilizes at approximately `100px` (sticky positioning unbroken). Ensure no horizontal overflow scrollbars appear.
- [ ] **Check 5: Reduced Motion Compliance Verification**
  - *Method*: Emulate `prefers-reduced-motion: reduce`. Load `index.html`. Verify that all `[data-animate]` elements and cards have computed `opacity === "1"` immediately upon load without requiring scroll triggers, and no parallax transform styles are attached on scroll.
- [ ] **Check 6: Zero Dependencies Verification**
  - *Method*: Inspect `package.json`, HTML `<script>` tags, and network activity. Verify that no libraries (GSAP, Framer Motion, Anime, CDN scripts) are included.

---

## 8. Caveats

1. **Inline Lucide Icon Re-rendering**: `js/app.js` runs `lucide.createIcons()` after dynamic template injection. Character reveal tokenization must be careful not to corrupt SVG elements if headings contain icons. In BlueCollar Connect, section headings with icons (e.g., in `about.html` feature items) should either keep icons outside the tokenized text wrapper or apply `data-char-reveal` strictly to text nodes.
2. **Browser Scroll Restoration**: Some browsers restore previous scroll position on page reload. The `IntersectionObserver` handles this natively because elements already in view immediately fire intersection entries upon creation.
3. **Filter Re-renders on `category.html`**: When the user toggles filters (e.g. Rating, Verified), `renderPros()` completely clears and rewrites `#pros-grid.innerHTML`. Calling `observeNewElements(grid)` inside `renderPros()` ensures new cards animate in cleanly every time filters are applied.

---

## 9. Conclusion

The specification for the native scroll-triggered animation system is fully enumerated, bounded, and verified against the existing project structure. 

The required engineering deliverables for the subsequent implementation phases are:
1. **`css/scroll-animations.css`**: Define declarative classes for `fade-up`, `scale-up`, `data-char-reveal`, staggered delays, and `prefers-reduced-motion` gating.
2. **`js/utils/animations.js`**: Refactor to export `observeNewElements(container)`, `initHeroParallax()`, `initCharReveal()`, and `initScrollAnimations()`.
3. **`js/pages/*.js` (`home.js`, `category.js`, `services.js`, `professional.js`)**: Inject `data-animate` into template literals and call `observeNewElements(grid)` post-injection.
4. **HTML Files (`index.html`, `services.html`, `category.html`, `professional.html`, `how-it-works.html`, `about.html`)**: Link `scroll-animations.css` and tag static sections, hero, section titles (`data-char-reveal`), and homepage CTA card (`scale-up`).

This approach completely solves the race condition, strictly preserves zero external dependencies, maintains fixed/sticky layout stability, and conforms to web accessibility standards.

---

## 10. Verification Method

To independently verify this specification report:
1. **Inspect Target Files**:
   - `c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md`
   - `c:\Users\munta\Downloads\blue_collar\js\utils\animations.js`
   - `c:\Users\munta\Downloads\blue_collar\js\pages\home.js`
   - `c:\Users\munta\Downloads\blue_collar\css\category.css`
2. **Confirm Contract Alignment**:
   - Check that `observeNewElements(container)` accepts a container argument matching the dynamic DOM insertion pattern.
   - Check that `initHeroParallax()` and `initCharReveal()` match all requirements in R2 and R3.
3. **Run Pre-implementation Baseline Check**:
   - Open PowerShell or terminal in `c:\Users\munta\Downloads\blue_collar`.
   - Verify git status is clean: `git status`.
