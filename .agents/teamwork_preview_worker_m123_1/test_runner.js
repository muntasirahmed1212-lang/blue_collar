// Comprehensive Test Suite for BlueCollar Connect Scroll Animation System
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const baseDir = 'c:/Users/munta/Downloads/blue_collar';
console.log('=== BLUECOLLAR CONNECT ANIMATION SYSTEM TEST SUITE ===');
console.log('Working Directory:', baseDir);

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`[PASS] ${message}`);
}

// ---------------------------------------------------------------------------
// TEST 1: CSS Animation Rules & Reduced Motion Gating (R1)
// ---------------------------------------------------------------------------
console.log('\n--- 1. Testing css/scroll-animations.css ---');
const cssPath = path.join(baseDir, 'css', 'scroll-animations.css');
assert(fs.existsSync(cssPath), 'css/scroll-animations.css exists');

const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('@media (prefers-reduced-motion: no-preference)'), 'prefers-reduced-motion: no-preference query present');
assert(css.includes('[data-animate="fade-up"]'), '[data-animate="fade-up"] defined');
assert(css.includes('opacity: 0;'), '[data-animate="fade-up"] initial opacity: 0');
assert(css.includes('transform: translateY(24px);'), '[data-animate="fade-up"] initial transform: translateY(24px)');
assert(css.includes('[data-animate="fade-up"].is-visible'), '[data-animate="fade-up"].is-visible defined');
assert(css.includes('transform: translateY(0);'), '[data-animate="fade-up"].is-visible translateY(0)');

assert(css.includes('[data-animate="scale-up"]'), '[data-animate="scale-up"] defined');
assert(css.includes('transform: scale(0.92);'), '[data-animate="scale-up"] initial scale(0.92)');
assert(css.includes('[data-animate="scale-up"].is-visible'), '[data-animate="scale-up"].is-visible defined');
assert(css.includes('transform: scale(1);'), '[data-animate="scale-up"].is-visible scale(1)');

assert(css.includes('[data-char-reveal] .char'), '[data-char-reveal] .char defined');
assert(css.includes('transform: translateY(14px);'), '[data-char-reveal] .char initial translateY(14px)');
assert(css.includes('[data-char-reveal].is-visible .char'), '[data-char-reveal].is-visible .char defined');

assert(css.includes('@media (prefers-reduced-motion: reduce)'), '@media (prefers-reduced-motion: reduce) present');
assert(css.includes('opacity: 1 !important;'), 'Reduced motion opacity: 1 !important');
assert(css.includes('transform: none !important;'), 'Reduced motion transform: none !important');
assert(css.includes('transition: none !important;'), 'Reduced motion transition: none !important');

// ---------------------------------------------------------------------------
// TEST 2: Layout Integrity & Overflow Constraints (R3, Acceptance Criteria)
// ---------------------------------------------------------------------------
console.log('\n--- 2. Testing Layout Integrity & Overflow Constraints ---');
const cssFiles = fs.readdirSync(path.join(baseDir, 'css')).filter(f => f.endsWith('.css'));
for (const f of cssFiles) {
  const content = fs.readFileSync(path.join(baseDir, 'css', f), 'utf8');
  const matches = content.match(/(html|body)[^{]*\{[^}]*overflow-x\s*:\s*hidden/i);
  assert(!matches, `No forbidden overflow-x: hidden on html/body in css/${f}`);
}

const categoryCss = fs.readFileSync(path.join(baseDir, 'css', 'category.css'), 'utf8');
assert(categoryCss.includes('position: sticky'), 'category.css has position: sticky on .sidebar-filters');
assert(categoryCss.includes('top: 100px'), 'category.css has top: 100px on .sidebar-filters');

const professionalCss = fs.readFileSync(path.join(baseDir, 'css', 'professional.css'), 'utf8');
assert(professionalCss.includes('position: sticky'), 'professional.css has position: sticky on .sticky-top');

const headerCss = fs.readFileSync(path.join(baseDir, 'css', 'header.css'), 'utf8');
assert(headerCss.includes('position: fixed'), 'header.css has position: fixed');

// ---------------------------------------------------------------------------
// TEST 3: HTML Links & Markup Attributes (R3)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Testing HTML Files & Animation Attributes ---');
const htmlFiles = [
  'index.html',
  'services.html',
  'category.html',
  'professional.html',
  'how-it-works.html',
  'about.html'
];

for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(baseDir, file), 'utf8');
  assert(content.includes('scroll-animations.css'), `${file} links scroll-animations.css`);
}

// index.html specific checks
const indexHtml = fs.readFileSync(path.join(baseDir, 'index.html'), 'utf8');
assert(indexHtml.includes('<h1 class="hero-title" data-char-reveal>'), 'index.html hero-title has data-char-reveal');
assert(indexHtml.includes('class="hero-subtitle" data-animate="fade-up"'), 'index.html hero-subtitle has data-animate="fade-up"');
assert(indexHtml.includes('class="search-container glass-panel" data-animate="fade-up"'), 'index.html search container has data-animate="fade-up"');
assert(indexHtml.includes('data-char-reveal>Service Categories</h2>'), 'index.html Service Categories has data-char-reveal');
assert(indexHtml.includes('data-char-reveal>Featured Professionals</h2>'), 'index.html Featured Professionals has data-char-reveal');
assert(indexHtml.includes('class="cta-card glass-panel" data-animate="scale-up"'), 'index.html CTA card has data-animate="scale-up"');
assert(indexHtml.includes('<section class="trust-bar" data-animate="fade-up">'), 'index.html trust bar has data-animate="fade-up"');

// services.html
const servicesHtml = fs.readFileSync(path.join(baseDir, 'services.html'), 'utf8');
assert(servicesHtml.includes('data-char-reveal>All Service Categories</h1>'), 'services.html heading has data-char-reveal');
assert(servicesHtml.includes('class="search-filter-box glass-panel" data-animate="fade-up"'), 'services.html search box has data-animate="fade-up"');

// category.html
const categoryHtml = fs.readFileSync(path.join(baseDir, 'category.html'), 'utf8');
assert(categoryHtml.includes('class="sidebar-filters glass-panel" data-animate="fade-up"'), 'category.html sidebar filters has data-animate="fade-up"');
assert(categoryHtml.includes('class="breadcrumb mb-4" data-animate="fade-up"'), 'category.html breadcrumb has data-animate="fade-up"');

// professional.html
const professionalHtml = fs.readFileSync(path.join(baseDir, 'professional.html'), 'utf8');
assert(professionalHtml.includes('class="profile-header glass-panel" data-animate="fade-up"'), 'professional.html header card has data-animate="fade-up"');
assert(professionalHtml.includes('class="booking-card glass-panel sticky-top" data-animate="fade-up"'), 'professional.html booking card has data-animate="fade-up"');
assert(professionalHtml.includes('data-char-reveal>About the Professional</h3>'), 'professional.html section title has data-char-reveal');

// how-it-works.html
const howHtml = fs.readFileSync(path.join(baseDir, 'how-it-works.html'), 'utf8');
assert(howHtml.includes('data-char-reveal>How BlueCollar Connect Works</h1>'), 'how-it-works.html hero title has data-char-reveal');
assert(howHtml.includes('class="step-card" data-animate="fade-up"'), 'how-it-works.html step cards have data-animate="fade-up"');

// about.html
const aboutHtml = fs.readFileSync(path.join(baseDir, 'about.html'), 'utf8');
assert(aboutHtml.includes('data-char-reveal>About BlueCollar Connect</h1>'), 'about.html hero title has data-char-reveal');
assert(aboutHtml.includes('class="feature-item" data-animate="fade-up"'), 'about.html feature items have data-animate="fade-up"');

// ---------------------------------------------------------------------------
// TEST 4: Dynamic JS Templates & Post-Injection Observation (R2, R3)
// ---------------------------------------------------------------------------
console.log('\n--- 4. Testing Dynamic JS Templates & Observer Calls ---');

// home.js
const homeJs = fs.readFileSync(path.join(baseDir, 'js/pages/home.js'), 'utf8');
assert(homeJs.includes("import { observeNewElements } from '../utils/animations.js'"), 'home.js imports observeNewElements');
assert(homeJs.includes('class="category-card card" data-animate="fade-up"'), 'home.js category cards have data-animate="fade-up"');
assert(homeJs.includes('class="pro-card card" data-animate="fade-up"'), 'home.js pro cards have data-animate="fade-up"');
assert(homeJs.includes('observeNewElements(grid)'), 'home.js calls observeNewElements(grid)');

// services.js
const servicesJs = fs.readFileSync(path.join(baseDir, 'js/pages/services.js'), 'utf8');
assert(servicesJs.includes("import { observeNewElements } from '../utils/animations.js'"), 'services.js imports observeNewElements');
assert(servicesJs.includes('class="service-card-full" data-animate="fade-up"'), 'services.js cards have data-animate="fade-up"');
assert(servicesJs.includes('observeNewElements(grid)'), 'services.js calls observeNewElements(grid)');

// category.js
const categoryJs = fs.readFileSync(path.join(baseDir, 'js/pages/category.js'), 'utf8');
assert(categoryJs.includes("import { observeNewElements } from '../utils/animations.js'"), 'category.js imports observeNewElements');
assert(categoryJs.includes('class="pro-card card" data-animate="fade-up"'), 'category.js cards have data-animate="fade-up"');
assert(categoryJs.includes('observeNewElements(grid)'), 'category.js calls observeNewElements(grid)');

// professional.js
const professionalJs = fs.readFileSync(path.join(baseDir, 'js/pages/professional.js'), 'utf8');
assert(professionalJs.includes("import { observeNewElements } from '../utils/animations.js'"), 'professional.js imports observeNewElements');
assert(professionalJs.includes('class="review-item" data-animate="fade-up"'), 'professional.js reviews have data-animate="fade-up"');
assert(professionalJs.includes('class="gallery-img" data-animate="fade-up"'), 'professional.js gallery has data-animate="fade-up"');
assert(professionalJs.includes('observeNewElements('), 'professional.js calls observeNewElements');

// ---------------------------------------------------------------------------
// TEST 5: Zero Dependencies Rule (R4)
// ---------------------------------------------------------------------------
console.log('\n--- 5. Testing Zero External Dependencies Rule ---');
const animationsJs = fs.readFileSync(path.join(baseDir, 'js/utils/animations.js'), 'utf8');
const banned = ['gsap', 'framer-motion', 'anime', 'velocity', 'jquery', 'ScrollTrigger'];
for (const b of banned) {
  assert(!animationsJs.toLowerCase().includes(b.toLowerCase()), `animations.js contains no references to banned library '${b}'`);
}
for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(baseDir, file), 'utf8');
  for (const b of banned) {
    assert(!content.toLowerCase().includes(b.toLowerCase()), `${file} contains no references to banned library '${b}'`);
  }
}

// ---------------------------------------------------------------------------
// TEST 6: Animation Engine Exports and Runtime Integrity (R2)
// ---------------------------------------------------------------------------
console.log('\n--- 6. Testing js/utils/animations.js Structure & Logic ---');
assert(animationsJs.includes('export function initScrollAnimations'), 'initScrollAnimations is exported');
assert(animationsJs.includes('export function observeNewElements'), 'observeNewElements is exported');
assert(animationsJs.includes('export function initHeroParallax'), 'initHeroParallax is exported');
assert(animationsJs.includes('export function initCharReveal'), 'initCharReveal is exported');
assert(animationsJs.includes('export function initCounterAnimation'), 'initCounterAnimation is exported');
assert(animationsJs.includes('export function initPageTransitions'), 'initPageTransitions is exported');

assert(animationsJs.includes("rootMargin: '0px 0px -40px 0px'"), "Observer uses rootMargin '0px 0px -40px 0px'");
assert(animationsJs.includes('threshold: 0.1'), 'Observer uses threshold: 0.1');
assert(animationsJs.includes('transitionDelay = \'0ms\''), 'Observer resets transitionDelay after animation');
assert(animationsJs.includes('requestAnimationFrame'), 'Hero parallax uses requestAnimationFrame ticking');
assert(animationsJs.includes('aria-label'), 'initCharReveal sets aria-label on parent');
assert(animationsJs.includes('aria-hidden'), 'initCharReveal sets aria-hidden on wrapper');

console.log(`\n======================================================`);
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`======================================================\n`);
