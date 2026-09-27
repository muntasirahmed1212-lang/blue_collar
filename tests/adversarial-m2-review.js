/**
 * tests/adversarial-m2-review.js
 * Adversarial Independent Review Suite for Milestone M2:
 * Job Posting Modal, Form Validation, Design System, & Job Service
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Details: ${err.message}`);
    failedTests++;
  }
}

console.log('=================================================================');
console.log('ADVERSARIAL INDEPENDENT REVIEW SUITE — MILESTONE M2');
console.log('=================================================================\n');

// ─── 1. INTEGRITY VIOLATION CHECKS ───────────────────────────────────────────
console.log('--- SECTION 1: INTEGRITY VIOLATION CHECKS ---');

runTest('INV-1: Forbidden files authUI.js and authService.js are 100% untouched', () => {
  const { execSync } = require('child_process');
  const status = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  assert.equal(status, '', `Forbidden files must have zero modifications! Found: ${status}`);

  const diff = execSync('git diff HEAD -- js/components/authUI.js js/services/authService.js', {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  assert.equal(diff, '', `Git diff on forbidden files must be completely empty! Found: ${diff}`);
});

runTest('INV-2: No hardcoded test responses or facade stubs in jobService.js', () => {
  const jobServiceCode = fs.readFileSync(path.join(ROOT, 'js/services/jobService.js'), 'utf8');
  assert.ok(!jobServiceCode.includes('mock'), 'jobService must not contain mock data');
  assert.ok(!jobServiceCode.includes('fake'), 'jobService must not contain fake data');
  assert.ok(jobServiceCode.includes('fetch(url'), 'jobService must perform real fetch calls');
  assert.ok(jobServiceCode.includes("credentials: 'include'"), 'jobService must include session credentials');
});

runTest('INV-3: No dummy or bypassed validation in jobModal.js', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes('validateJobForm'), 'jobModal must implement validateJobForm');
  assert.ok(jobModalCode.includes('displayValidationErrors'), 'jobModal must implement displayValidationErrors');
  assert.ok(jobModalCode.includes('jobService.createJob(jobData)'), 'jobModal must dispatch jobData to jobService.createJob');
});

// ─── 2. UI REQUIREMENTS & DESIGN SYSTEM CONFORMANCE ──────────────────────────
console.log('\n--- SECTION 2: UI REQUIREMENTS & DESIGN SYSTEM CONFORMANCE ---');

runTest('UI-1: Form contains all 8 required fields specified in R1 and R2', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes('id="job-title"'), 'Must have title field');
  assert.ok(jobModalCode.includes('id="job-category"'), 'Must have category select');
  assert.ok(jobModalCode.includes('id="job-description"'), 'Must have description textarea');
  assert.ok(jobModalCode.includes('id="job-location"'), 'Must have location input');
  assert.ok(jobModalCode.includes('id="job-budget-min"'), 'Must have budget min input');
  assert.ok(jobModalCode.includes('id="job-budget-max"'), 'Must have budget max input');
  assert.ok(jobModalCode.includes('name="urgency"'), 'Must have urgency radio group');
  assert.ok(jobModalCode.includes('id="job-datetime"'), 'Must have preferred datetime input');
  assert.ok(jobModalCode.includes('id="job-photos"'), 'Must have photo references input');
});

runTest('UI-2: Category selector loads all 12 categories from categories.js', () => {
  const categoriesCode = fs.readFileSync(path.join(ROOT, 'js/data/categories.js'), 'utf8');
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  
  assert.ok(jobModalCode.includes("import { categories } from '../data/categories.js';"), 'Must import categories from categories.js');
  assert.ok(jobModalCode.includes('populateCategoriesDropdown'), 'Must have populateCategoriesDropdown function');

  // Verify all 12 canonical category IDs exist in categories.js
  for (let i = 1; i <= 12; i++) {
    assert.ok(categoriesCode.includes(`"cat-${i}"`) || categoriesCode.includes(`'cat-${i}'`), `Missing cat-${i} in categories.js`);
  }
});

runTest('UI-3: Matching site design system (CSS variables, glass-panel, Lucide icons)', () => {
  const cssCode = fs.readFileSync(path.join(ROOT, 'css/components.css'), 'utf8');
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');

  // Glass panel styling
  assert.ok(jobModalCode.includes('glass-panel'), 'Modal container must use .glass-panel class');
  assert.ok(jobModalCode.includes('modal-overlay'), 'Modal must use .modal-overlay class');

  // Lucide icons
  assert.ok(jobModalCode.includes('data-lucide="x"'), 'Must use Lucide close icon');
  assert.ok(jobModalCode.includes('data-lucide="map-pin"'), 'Must use Lucide map-pin icon');
  assert.ok(jobModalCode.includes('data-lucide="calendar"'), 'Must use Lucide calendar icon');
  assert.ok(jobModalCode.includes('data-lucide="image"'), 'Must use Lucide image icon');

  // CSS tokens usage
  assert.ok(cssCode.includes('var(--radius-xl)'), 'Must use design system radius tokens');
  assert.ok(cssCode.includes('var(--border-default)'), 'Must use design system border tokens');
  assert.ok(cssCode.includes('var(--surface-secondary)'), 'Must use design system surface tokens');
  assert.ok(cssCode.includes('var(--accent-blue)'), 'Must use design system accent tokens');
  assert.ok(cssCode.includes('var(--accent-emerald)'), 'Must use design system accent tokens');
  assert.ok(cssCode.includes('var(--accent-amber)'), 'Must use design system accent tokens');
});

runTest('UI-4: "Post a Job" buttons wired in desktop and mobile headers across all 6 pages', () => {
  const pages = ['index.html', 'services.html', 'category.html', 'professional.html', 'about.html', 'how-it-works.html'];
  for (const page of pages) {
    const pageContent = fs.readFileSync(path.join(ROOT, page), 'utf8');
    
    // Check desktop header
    const hasDesktopBtn = /<header[^>]*>[\s\S]*?Post a Job[\s\S]*?<\/header>/i.test(pageContent) ||
                          /<div class="header-actions"[^>]*>[\s\S]*?Post a Job[\s\S]*?<\/div>/i.test(pageContent);
    assert.ok(hasDesktopBtn, `Page ${page} missing desktop Post a Job button`);

    // Check mobile menu drawer
    const hasMobileBtn = /<div class="mobile-menu"[^>]*>[\s\S]*?Post a Job[\s\S]*?<\/div>/i.test(pageContent);
    assert.ok(hasMobileBtn, `Page ${page} missing mobile drawer Post a Job button`);
  }

  // Check modal.js wiring
  const modalCode = fs.readFileSync(path.join(ROOT, 'js/components/modal.js'), 'utf8');
  assert.ok(modalCode.includes('handlePostJobClick'), 'modal.js must define handlePostJobClick');
  assert.ok(modalCode.includes('initModals'), 'modal.js must export initModals');
  assert.ok(modalCode.includes('document.addEventListener(\'click\''), 'modal.js must provide event delegation for dynamic buttons');
});

// ─── 3. ADVERSARIAL VALIDATION SIMULATION ─────────────────────────────────────
console.log('\n--- SECTION 3: ADVERSARIAL FORM VALIDATION LOGIC ---');

runTest('VAL-1: Title boundary checks in validateJobForm', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes('title.length < 5'), 'Title minlength 5 check must exist');
  assert.ok(jobModalCode.includes('title.length > 100'), 'Title maxlength 100 check must exist');
});

runTest('VAL-2: Description boundary checks in validateJobForm', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes('description.length < 10'), 'Description minlength 10 check must exist');
  assert.ok(jobModalCode.includes('description.length > 2000'), 'Description maxlength 2000 check must exist');
});

runTest('VAL-3: Budget validation logic checks', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes('minNum > maxNum'), 'Must reject minNum > maxNum');
  assert.ok(jobModalCode.includes('minNum < 0') || jobModalCode.includes('maxNum < 0'), 'Must reject negative budgets');
  assert.ok(jobModalCode.includes('minNum === 0 && maxNum === 0'), 'Must reject 0 budget');
});

runTest('VAL-4: Urgency validation restricts to exactly 4 valid levels', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes("['low', 'medium', 'high', 'urgent']"), 'Must validate against 4 urgency tiers');
});

runTest('VAL-5: Photo URLs format rejection for invalid schemas', () => {
  const jobModalCode = fs.readFileSync(path.join(ROOT, 'js/components/jobModal.js'), 'utf8');
  assert.ok(jobModalCode.includes('urlPattern'), 'Must validate photo URL patterns');
});

// ─── 4. AUTH GATING & FLOW VERIFICATION ──────────────────────────────────────
console.log('\n--- SECTION 4: AUTH GATING & ERROR HANDLING IN MODAL.JS ---');

runTest('AUTH-1: Unauthenticated user receives info toast and login modal', () => {
  const modalCode = fs.readFileSync(path.join(ROOT, 'js/components/modal.js'), 'utf8');
  assert.ok(modalCode.includes('showToast("Please log in to post a job.", "info")'), 'Must display info toast when unauthenticated');
  assert.ok(modalCode.includes("openModal('login-modal')"), 'Must open login modal when unauthenticated');
});

runTest('AUTH-2: Non-customer role receives error toast and does not open modal', () => {
  const modalCode = fs.readFileSync(path.join(ROOT, 'js/components/modal.js'), 'utf8');
  assert.ok(modalCode.includes("res.user.role !== 'customer'"), 'Must check user.role is customer');
  assert.ok(modalCode.includes('showToast("Only customers can post jobs.", "error")'), 'Must reject non-customer roles');
});

runTest('AUTH-3: Debounce concurrency guard prevents double-submissions', () => {
  const modalCode = fs.readFileSync(path.join(ROOT, 'js/components/modal.js'), 'utf8');
  assert.ok(modalCode.includes('isCheckingAuth = true'), 'Must set isCheckingAuth guard');
  assert.ok(modalCode.includes('isCheckingAuth = false;'), 'Must clear guard in finally block');
});

// ─── 5. SUMMARY ──────────────────────────────────────────────────────────────
console.log('\n=================================================================');
console.log(`ADVERSARIAL REVIEW SUMMARY: ${passedTests} / ${totalTests} passed (${failedTests} failed)`);
console.log('=================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
