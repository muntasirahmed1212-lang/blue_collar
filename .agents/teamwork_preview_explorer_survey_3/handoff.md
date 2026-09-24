# Dynamic Rendering & DOM Injection Explorer Report (Explorer 3)

## 1. Observation

### 1.1 Dynamic Templates & Injection Points
Inspection of all files in `js/pages/*.js` and `js/components/*.js` revealed the following template generation and DOM injection sites:

1. **`js/pages/home.js`**:
   - **Category Grid** (lines 10–28):
     - Container: `const grid = document.getElementById('home-categories-grid');`
     - Template generation:
       ```javascript
       const markup = homeCategories.map(cat => `
         <a href="/category.html?cat=${cat.slug}" class="category-card card" style="text-decoration: none; color: inherit;">
           <div class="category-icon-wrapper">
             <i data-lucide="${cat.icon}"></i>
           </div>
           <h3>${cat.name}</h3>
           <span>${cat.serviceCount} Pros <i data-lucide="chevron-right" class="icon-sm"></i></span>
         </a>
       `).join('');
       ```
     - Injection call: Line 27: `grid.innerHTML = markup;`
   - **Featured Professionals Grid** (lines 30–67):
     - Container: `const grid = document.getElementById('featured-pros-grid');`
     - Template generation:
       ```javascript
       const markup = featuredPros.map(pro => `
         <div class="pro-card card">
           <div class="pro-card-header">...</div>
           <div class="pro-card-body">...</div>
           <div class="pro-card-footer">...</div>
         </div>
       `).join('');
       ```
     - Injection call: Line 66: `grid.innerHTML = markup;`

2. **`js/pages/services.js`**:
   - **All Categories Service Grid** (lines 11–38):
     - Container: `const grid = document.getElementById('all-categories-grid');`
     - Template generation:
       ```javascript
       const markup = data.map(cat => `
         <a href="/category.html?cat=${cat.slug}" class="service-card-full">
           <div class="service-icon-box"><i data-lucide="${cat.icon}"></i></div>
           <h3>${cat.name}</h3>
           <p>${cat.description}</p>
           <div class="service-popular">...</div>
         </a>
       `).join('');
       ```
     - Injection call: Line 36: `grid.innerHTML = markup;`
     - Icon refresh: Line 37: `if (window.lucide) window.lucide.createIcons();`
     - Invoked on initial render (line 41) AND on filter input (line 52).

3. **`js/pages/category.js`**:
   - **Category Hero Icon** (line 25):
     - Injection call: `document.getElementById('category-icon').innerHTML = `<i data-lucide="${category.icon}"></i>`;`
   - **Professionals Grid** (lines 44–88):
     - Container: `const grid = document.getElementById('pros-grid');`
     - Template generation:
       ```javascript
       const markup = pros.map(pro => `
         <div class="pro-card card">
           <div class="pro-card-header">...</div>
           <div class="pro-card-body">...</div>
           <div class="pro-card-footer">...</div>
         </div>
       `).join('');
       ```
     - Injection call: Line 86: `grid.innerHTML = markup;`
     - Icon refresh: Line 87: `if (window.lucide) window.lucide.createIcons();`
     - Invoked on initial render (line 134) AND on filter/sort change (lines 148, 153, 162).

4. **`js/pages/professional.js`**:
   - **Skills List** (lines 55–58):
     - Container: `const skillsEl = document.getElementById('pro-skills');`
     - Injection call: Line 57: `skillsEl.innerHTML = skillsMarkup;`
   - **Gallery Images** (lines 61–67):
     - Container: `document.getElementById('pro-gallery')`
     - Injection call: Line 64: `document.getElementById('pro-gallery').innerHTML = galleryMarkup;`
   - **Reviews List** (lines 70–87):
     - Container: `document.getElementById('pro-reviews')`
     - Injection call: Line 84: `document.getElementById('pro-reviews').innerHTML = reviewsMarkup;`
   - Icon refresh: Line 97: `if (window.lucide) window.lucide.createIcons();`

5. **`js/components/footer.js`**:
   - **Global Footer** (lines 4–89):
     - Container: `const footerEl = document.querySelector('footer');`
     - Injection call: Line 70: `footerEl.innerHTML = footerMarkup;`
     - Icon refresh: Line 74: `lucide.createIcons(...)`

6. **`js/components/location.js`**:
   - Location button updates at line 42 & line 132 (`btnUseCurrent.innerHTML = ...`).

7. **`js/utils/helpers.js`**:
   - Toast notification DOM creation at lines 16, 26, 31 (`toast.innerHTML = ...; container.appendChild(toast);`).

---

### 1.2 Root Cause of the Existing Race Condition
In `js/app.js` (lines 10–36):
```javascript
document.addEventListener('DOMContentLoaded', () => {
  // ...
  initScrollAnimations(); // Line 19: Executes synchronously!
  
  // 2. Routing (Pseudo-routing based on path)
  const path = window.location.pathname;
  
  if (path === '/' || path.endsWith('index.html')) {
    import('./pages/home.js').then(module => { // Asynchronous dynamic import!
      module.initHome();
      if (window.lucide) window.lucide.createIcons();
    });
  } else if (path.includes('services.html')) {
    import('./pages/services.js').then(module => module.initServices());
  } else if (path.includes('category.html')) {
    import('./pages/category.js').then(module => module.initCategory());
  } else if (path.includes('professional.html')) {
    import('./pages/professional.js').then(module => module.initProfessional());
  }
  // ...
});
```
Meanwhile, in `js/utils/animations.js` (lines 7–54):
```javascript
export function initScrollAnimations() {
  const elementsToAnimate = document.querySelectorAll('.category-card, .service-card, .step-card, .feature-item, .pro-card');
  // ...
  elementsToAnimate.forEach(el => observer.observe(el));
}
```
At the moment `initScrollAnimations()` runs synchronously on `DOMContentLoaded`, `#home-categories-grid`, `#featured-pros-grid`, `#all-categories-grid`, and `#pros-grid` are completely empty in the DOM because their modules have not finished downloading or executing. Therefore, `document.querySelectorAll('.category-card, ...')` matches 0 dynamic cards. When the page modules finish rendering, those new elements are never observed.

---

### 1.3 Hero Section Structure
In `index.html` (lines 130–155):
```html
<section class="hero-section">
  <div class="hero-bg-elements">
    <i data-lucide="wrench" class="floating-icon icon-1"></i>
    <i data-lucide="hammer" class="floating-icon icon-2"></i>
    <i data-lucide="zap" class="floating-icon icon-3"></i>
    <i data-lucide="paint-bucket" class="floating-icon icon-4"></i>
  </div>
  
  <div class="container hero-content text-center">
    <h1 class="hero-title">Find Trusted <br><span class="text-primary">Professionals</span> Near You</h1>
    <p class="hero-subtitle">Connect with skilled, verified experts for electrical, plumbing, home repair, and more.</p>
    
    <div class="search-container glass-panel">
      <div class="search-input-group flex-1">
        <i data-lucide="search" class="text-muted"></i>
        <input type="text" id="service-search" placeholder="Find a service... (e.g. Electrician, Plumber)">
      </div>
      <button class="btn btn-primary btn-lg search-btn">Search Now</button>
      <div class="search-autocomplete hidden" id="search-autocomplete"></div>
    </div>
  </div>
</section>
```
CSS styles in `css/hero.css` (lines 2–7):
```css
.hero-section {
  position: relative;
  padding: calc(var(--spacing-24) + var(--spacing-16)) 0 var(--spacing-24) 0;
  overflow: hidden;
  background: radial-gradient(circle at top center, var(--accent-blue-transparent), transparent 60%);
}
```
Elements contained:
1. `.hero-bg-elements`: 4 floating Lucide tool icons with CSS floating keyframe animations.
2. `.container.hero-content`:
   - Title: `h1.hero-title` with gradient/primary accent text.
   - Subtitle: `p.hero-subtitle`.
   - Search Container: `div.search-container.glass-panel` containing `#service-search` and `.search-btn`.

---

### 1.4 Section Titles Across Views
Section titles identified across all pages and dynamic templates:
1. `index.html`:
   - Line 197: `<h2 class="section-title">Service Categories</h2>`
   - Line 211: `<h2 class="section-title">Featured Professionals</h2>`
   - Line 224: `<h2 class="mb-4">Are you a professional?</h2>`
2. `services.html`:
   - Line 129: `<h1 class="mb-4">All Service Categories</h1>`
3. `how-it-works.html`:
   - Line 125: `<h1 class="mb-4">How BlueCollar Connect Works</h1>`
   - Line 168: `<h2 class="mb-6">Ready to get started?</h2>`
4. `about.html`:
   - Line 124: `<h1 class="mb-6">About BlueCollar Connect</h1>`
5. `category.html`:
   - Line 137: `<h1 id="category-title">Loading...</h1>` (populated dynamically with `${category.name}s`)
6. `professional.html`:
   - Line 148: `<h3 class="mb-4">About the Professional</h3>`
   - Line 153: `<h3 class="mb-4">Skills & Expertise</h3>`
   - Line 161: `<h3 class="mb-4">Past Work</h3>`
   - Line 169: `<h3>Reviews (<span id="review-count">0</span>)</h3>`

---

### 1.5 Homepage CTA Card
In `index.html` (lines 220–229):
```html
<section class="section cta-section text-center">
  <div class="container">
    <div class="cta-card glass-panel">
      <h2 class="mb-4">Are you a professional?</h2>
      <p class="mb-8 text-secondary max-w-2xl mx-auto">Join BlueCollar Connect to reach more customers, manage your bookings easily, and grow your business.</p>
      <button class="btn btn-primary btn-lg">Register as a Pro</button>
    </div>
  </div>
</section>
```
Target element: Line 223: `<div class="cta-card glass-panel">`.
Needs attribute: `data-animate="scale-up"`.

---

### 1.6 Sticky & Fixed Constraints
1. **Fixed Header**:
   - `css/header.css` (lines 2–11): `header { position: fixed; top: 0; left: 0; width: 100%; z-index: var(--z-header); }`
2. **Category Sticky Sidebar**:
   - `css/category.css` (lines 41–47): `.sidebar-filters { position: sticky; top: 100px; height: fit-content; }`
3. **Professional Sticky Booking Card**:
   - `css/professional.css` (lines 140–148, 161–175):
     - Desktop: `.booking-card { position: sticky; top: 100px; }`
     - Mobile (< 1024px): `.booking-card { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 50; }`

---

## 2. Logic Chain

1. **Race Condition Resolution**:
   - Observation 1.2 showed `initScrollAnimations()` executes on `DOMContentLoaded` before dynamic page modules inject cards into the DOM.
   - Observation 1.1 pinpointed the exact lines where `grid.innerHTML = markup` is called in `home.js`, `services.js`, `category.js`, and `professional.js`.
   - Therefore, creating an exported function `observeNewElements(container = document)` in `js/utils/animations.js` and invoking it immediately after DOM injection in each page script will guarantee that all newly created cards are registered with the `IntersectionObserver` instance without delay.
   - Calling `observeNewElements()` inside re-render functions (such as `renderGrid` in `services.js` and `renderPros` in `category.js`) ensures that filtering, searching, and sorting operations also re-observe newly created elements.

2. **Hero Parallax Math and Mechanics**:
   - Observation 1.3 showed `.hero-section` is at the very top of `index.html`.
   - Acceptance criteria require: *"The auditor must verify that the hero section's inline `opacity` and `transform` values update dynamically as the page is scrolled."*
   - As `scrollY` increases from `0` to `heroHeight` (approx. 500–600px):
     - Scroll progress ratio: `progress = Math.min(Math.max(scrollY / heroHeight, 0), 1)`
     - Opacity fade: `opacity = Math.max(0, 1 - progress * 1.25)` (reaches 0 slightly before full hero height is passed).
     - Parallax translateY: `translateY = scrollY * 0.35` (moves content down at 35% of scroll rate, creating depth relative to the document flow).
     - Scale/shrink: `scale = 1 - progress * 0.08` (shrinks smoothly from 1.0 down to ~0.92).
   - These inline styles must be applied directly to `.hero-section`:
     `hero.style.opacity = opacity.toFixed(3);`
     `hero.style.transform = \`translate3d(0, \${translateY.toFixed(1)}px, 0) scale(\${scale.toFixed(3)})\`;`
   - Using `window.requestAnimationFrame()` with a ticking guard and `{ passive: true }` on the scroll listener ensures zero scroll-jank and 60fps/120fps responsiveness.
   - Respecting `prefers-reduced-motion: reduce` ensures full accessibility compliance.

3. **Character-by-Character Reveal (`initCharReveal`) Architecture**:
   - Observation 1.4 located all section titles across the project.
   - **Accessibility (a11y)**: If a heading like `<h2>Service Categories</h2>` is split directly into `<span>S</span><span>e</span>...`, screen readers may spell out letters or lose word pauses.
     - Solution: Store original text in `aria-label="Service Categories"` on the parent heading.
     - Enclose the animated character structure inside an `aria-hidden="true"` span.
   - **Layout & Word-Wrapping**: If characters are `display: inline-block` directly inside the heading, words can awkwardly break midway across lines when the viewport resizes, and spaces can collapse.
     - Solution: Tokenize by words (`text.split(/\s+/)`). Wrap each word in `<span class="char-word" style="display: inline-block; white-space: nowrap;">`.
     - Inside each word, wrap characters in `<span class="char" style="display: inline-block; transition-delay: ${index * 30}ms">${char}</span>`.
     - Insert a standard space between word wrappers.
   - **Intersection Animation**:
     - The target heading (`[data-char-reveal]`) is observed by the `IntersectionObserver`.
     - Upon intersection, the observer adds `is-visible` to the heading.
     - In `scroll-animations.css`:
       `[data-char-reveal] .char { opacity: 0; transform: translateY(12px); transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }`
       `[data-char-reveal].is-visible .char { opacity: 1; transform: translateY(0); }`

4. **CTA Card Animation**:
   - Observation 1.5 confirmed the homepage CTA card is `<div class="cta-card glass-panel">` at line 223 of `index.html`.
   - Adding `data-animate="scale-up"` connects it to the observer.
   - In `scroll-animations.css`:
     `[data-animate="scale-up"] { opacity: 0; transform: scale(0.92); transition: opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }`
     `[data-animate="scale-up"].is-visible { opacity: 1; transform: scale(1); }`

5. **Layout Constraint Preservation**:
   - Observation 1.6 confirmed that `.sidebar-filters` in `category.html` and `.booking-card` in `professional.html` rely on `position: sticky; top: 100px;`.
   - In CSS specification, any ancestor element having `overflow: hidden`, `overflow: clip`, `transform`, `filter`, or `perspective` will destroy `position: sticky` and break `position: fixed` relative positioning.
   - Therefore, animation wrappers or `[data-animate]` attributes must NEVER be placed on `main`, `.layout-with-sidebar`, `.main-content`, or `.profile-layout`. They must be applied strictly to leaf cards (`.pro-card`, `.category-card`, `.step-card`) or self-contained sections.

---

## 3. Caveats

1. **Dynamic Text Mutation in `category.html`**:
   `#category-title` is updated dynamically via `document.getElementById('category-title').textContent = \`\${category.name}s\`;` at line 23 of `category.js`. If `data-char-reveal` is applied to `#category-title`, `initCharReveal()` must be called *after* this text content is set; otherwise, the character spans will be overwritten by the plain string.
2. **Lucide Icons inside Injected Templates**:
   When `grid.innerHTML = markup` is called, any `<i data-lucide="...">` icons are raw HTML until `lucide.createIcons()` executes. `observeNewElements(grid)` should be called right after `lucide.createIcons()` so that the DOM nodes and layout boundaries are completely initialized.
3. **Filter Clearing & Zero-State Messages**:
   In `category.js` and `services.js`, when search or filter returns 0 results, the grid's `innerHTML` is set to `''` and `#no-results` / `#no-pros-message` is shown. `observeNewElements(grid)` safely handles empty containers without errors.
4. **Duplicate Observation Prevention**:
   When `observeNewElements` is called multiple times (e.g. user toggles filters repeatedly), previously animated elements or elements already marked `.is-visible` should not be re-hidden or doubly observed unless their DOM node is newly created.
5. **No External Libraries**:
   GSAP, ScrollTrigger, Framer Motion, and similar libraries are strictly forbidden. The entire system must use vanilla `IntersectionObserver`, `requestAnimationFrame`, and pure CSS transitions.

---

## 4. Conclusion

### 4.1 Exact Call Sites for `observeNewElements(container)`
The table below specifies every location in the codebase where `observeNewElements` must be placed:

| File | Function / Scope | Line Number (Approx) | Code Location | Container Passed |
|---|---|---|---|---|
| `js/pages/home.js` | `renderCategories()` | After line 27 | Immediately after `grid.innerHTML = markup;` | `observeNewElements(grid);` |
| `js/pages/home.js` | `renderFeaturedPros()` | After line 66 | Immediately after `grid.innerHTML = markup;` | `observeNewElements(grid);` |
| `js/pages/services.js` | `renderGrid(data)` | After line 37 | Immediately after `if (window.lucide) window.lucide.createIcons();` | `observeNewElements(grid);` |
| `js/pages/category.js` | `renderPros(pros)` | After line 87 | Immediately after `if (window.lucide) window.lucide.createIcons();` | `observeNewElements(grid);` |
| `js/pages/professional.js` | `initProfessional()` | After line 97 | Immediately after `if (window.lucide) window.lucide.createIcons();` | `observeNewElements(document.querySelector('.profile-main'));` |
| `js/components/footer.js` | `renderFooter()` | After line 78 | Immediately after `lucide.createIcons({ ... });` | `observeNewElements(footerEl);` |
| `js/app.js` | Page module imports | Lines 25–36 | In `.then()` callback after each page init | `observeNewElements();` (failsafe pass) |

---

### 4.2 Dynamic Card Templates with `data-animate` Injected
To ensure all cards are detected by the animation system, the template literals in `js/pages/*.js` must include `data-animate="fade-up"`:

1. **`js/pages/home.js` (line 18)**:
   ```javascript
   <a href="/category.html?cat=${cat.slug}" class="category-card card" data-animate="fade-up" style="text-decoration: none; color: inherit;">
   ```
2. **`js/pages/home.js` (line 37)**:
   ```javascript
   <div class="pro-card card" data-animate="fade-up">
   ```
3. **`js/pages/services.js` (line 20)**:
   ```javascript
   <a href="/category.html?cat=${cat.slug}" class="service-card-full" data-animate="fade-up">
   ```
4. **`js/pages/category.js` (line 56)**:
   ```javascript
   <div class="pro-card card" data-animate="fade-up">
   ```
5. **`js/pages/professional.js` (line 73)**:
   ```javascript
   <div class="review-item" data-animate="fade-up">
   ```

---

### 4.3 Proposed Implementation of `js/utils/animations.js`
The refactored animation utility must export:
- `initScrollAnimations()`
- `observeNewElements(container)`
- `initHeroParallax()`
- `initCharReveal(container)`
- `initPageTransitions()`

```javascript
// js/utils/animations.js

let globalObserver = null;

export function initScrollAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  globalObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        
        // Remove stagger delay after animation completes to keep hover effects snappy
        setTimeout(() => {
          entry.target.style.transitionDelay = '0ms';
        }, 800);
        
        globalObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  // Initialize static elements
  observeNewElements(document);
  initCharReveal(document);
  initHeroParallax();
  initCounterAnimation();
}

export function observeNewElements(container = document) {
  if (!globalObserver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Stagger grid containers
  const gridContainers = container.querySelectorAll(
    '.categories-grid, .featured-pros-grid, .all-categories-grid, .steps-grid, .features-grid, .profile-stats, .gallery-grid, .reviews-list'
  );

  gridContainers.forEach(grid => {
    const children = Array.from(grid.children).filter(child => 
      child.hasAttribute('data-animate') ||
      child.classList.contains('category-card') || 
      child.classList.contains('service-card') || 
      child.classList.contains('service-card-full') ||
      child.classList.contains('step-card') ||
      child.classList.contains('feature-item') ||
      child.classList.contains('pro-card') ||
      child.classList.contains('review-item')
    );

    children.forEach((child, index) => {
      if (!child.style.transitionDelay) {
        child.style.transitionDelay = `${(index % 8) * 60}ms`;
      }
      if (!child.hasAttribute('data-animate')) {
        child.setAttribute('data-animate', 'fade-up');
      }
    });
  });

  // Query all animatable elements in container
  const elements = container.querySelectorAll('[data-animate]:not(.is-visible), [data-char-reveal]:not(.is-visible)');
  elements.forEach(el => globalObserver.observe(el));
}

export function initHeroParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero = document.querySelector('.hero-section');
  if (!hero) return;

  let ticking = false;

  function updateParallax() {
    const scrollY = window.scrollY || window.pageYOffset;
    const heroHeight = hero.offsetHeight || 500;

    if (scrollY > heroHeight * 1.5) {
      hero.style.opacity = '0';
      return;
    }

    const progress = Math.min(Math.max(scrollY / heroHeight, 0), 1);
    const opacity = Math.max(0, 1 - progress * 1.25);
    const translateY = scrollY * 0.35;
    const scale = 1 - progress * 0.08;

    hero.style.opacity = opacity.toFixed(3);
    hero.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateParallax();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  updateParallax();
}

export function initCharReveal(container = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = container.querySelectorAll('[data-char-reveal]');
  targets.forEach(heading => {
    if (heading.dataset.charSplit === 'true') return;

    const originalText = heading.textContent.trim();
    if (!heading.getAttribute('aria-label')) {
      heading.setAttribute('aria-label', originalText);
    }

    const words = originalText.split(/\s+/);
    let charCounter = 0;

    const wrappedWords = words.map(word => {
      const chars = Array.from(word).map(char => {
        const span = `<span class="char" style="transition-delay: ${charCounter * 30}ms">${char}</span>`;
        charCounter++;
        return span;
      }).join('');
      return `<span class="char-word" style="display: inline-block; white-space: nowrap;">${chars}</span>`;
    });

    heading.innerHTML = `<span class="char-reveal-wrapper" aria-hidden="true">${wrappedWords.join(' ')}</span>`;
    heading.dataset.charSplit = 'true';

    if (globalObserver) {
      globalObserver.observe(heading);
    }
  });
}
```

---

### 4.4 Structure of `css/scroll-animations.css`
The new stylesheet required by R1:
```css
/* css/scroll-animations.css */

@media (prefers-reduced-motion: no-preference) {
  /* Base animation state: invisible and offset */
  [data-animate="fade-up"] {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity, transform;
  }

  [data-animate="scale-up"] {
    opacity: 0;
    transform: scale(0.92);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity, transform;
  }

  /* Triggered state */
  [data-animate="fade-up"].is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  [data-animate="scale-up"].is-visible {
    opacity: 1;
    transform: scale(1);
  }

  /* Character Reveal */
  [data-char-reveal] .char {
    display: inline-block;
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity, transform;
  }

  [data-char-reveal].is-visible .char {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reduced motion fallback: show everything without animation */
@media (prefers-reduced-motion: reduce) {
  [data-animate],
  [data-char-reveal] .char {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
```

---

## 5. Verification Method

To verify these findings and implementations independently:

1. **Verify Race Condition Fix**:
   - Serve the site using local HTTP server (`python -m http.server 8000`).
   - Navigate to `http://localhost:8000/index.html`.
   - Before scrolling: inspect `#home-categories-grid .category-card` in the DOM:
     - They must have `data-animate="fade-up"` and computed `opacity: 0; transform: matrix(...)`.
   - Scroll down to the categories section:
     - Each card must receive the class `is-visible` and computed `opacity: 1`.
   - Navigate to `http://localhost:8000/services.html` and type "Plumber" in the search box:
     - Re-rendered cards must receive `data-animate="fade-up"` and `.is-visible` upon view.

2. **Verify Hero Parallax**:
   - In browser console on `index.html`:
     ```javascript
     const hero = document.querySelector('.hero-section');
     console.log('Top:', hero.style.opacity, hero.style.transform);
     window.scrollTo(0, 300);
     setTimeout(() => {
       console.log('Scrolled 300px:', hero.style.opacity, hero.style.transform);
     }, 100);
     ```
   - Invalidation condition: `hero.style.opacity` remains empty/undefined, or `hero.style.transform` does not change during scroll.

3. **Verify Character Reveal & Accessibility**:
   - Inspect `document.querySelectorAll('[data-char-reveal]')`:
     - Must have valid `aria-label` matching original text.
     - Inner wrapper must have `aria-hidden="true"`.
     - Inner characters must be wrapped in `.char-word` and `.char` spans.
   - When scrolled into view, parent heading gets `.is-visible` and characters animate to `transform: translateY(0)`.

4. **Verify Homepage CTA Scale-Up**:
   - Inspect `.cta-card.glass-panel`:
     - Attribute `data-animate="scale-up"` is present.
     - When scrolled into view, it transitions from `scale(0.92)` to `scale(1)` with `.is-visible`.

5. **Verify Sticky & Fixed Integrity**:
   - Run in browser console on `category.html`:
     ```javascript
     const sidebar = document.querySelector('.sidebar-filters');
     const computed = window.getComputedStyle(sidebar);
     console.log('Position:', computed.position, 'Top:', computed.top);
     // Must be "sticky" and "100px"
     ```
   - On `index.html`:
     ```javascript
     const header = document.querySelector('header');
     console.log('Position:', window.getComputedStyle(header).position);
     // Must be "fixed"
     ```
