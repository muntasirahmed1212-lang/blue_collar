/**
 * tests/verify-m3.js
 * Milestone M3 Automated Verification Test Suite
 * BlueCollar Connect - Job Listing Page (jobs.html) & Homepage Preview (index.html)
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('=================================================================');
console.log('MILESTONE M3 COMPONENT & INTEGRATION VERIFICATION');
console.log('Job Listing Page, Homepage Preview, Navigation, & Styles');
console.log('=================================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] M3.${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] M3.${total}: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────
// M3.1: jobs.html structural integrity
// ─────────────────────────────────────────────────────────────────
runTest('jobs.html exists with required layout, header, filters, grid, empty state, and modal', () => {
  const jobsHtmlPath = path.join(PROJECT_ROOT, 'jobs.html');
  assert.ok(fs.existsSync(jobsHtmlPath), 'jobs.html must exist at project root');

  const content = fs.readFileSync(jobsHtmlPath, 'utf8');

  // Stylesheet
  assert.ok(content.includes('href="./css/jobs.css"'), 'jobs.html must link to ./css/jobs.css');

  // Header & branding
  assert.ok(content.includes('<header>') && content.includes('BlueCollar'), 'jobs.html must contain header with BlueCollar branding');
  assert.ok(content.includes('class="nav-desktop"') && content.includes('class="mobile-menu"'), 'jobs.html must have desktop and mobile nav');

  // Hero section
  assert.ok(content.includes('jobs-hero') && content.includes('Browse Open Jobs'), 'jobs.html must contain jobs-hero section');

  // Sidebar filters
  assert.ok(content.includes('sidebar-filters'), 'jobs.html must contain .sidebar-filters');
  assert.ok(content.includes('id="filter-location"'), 'jobs.html must contain #filter-location');
  assert.ok(content.includes('id="filter-category"'), 'jobs.html must contain #filter-category');
  assert.ok(content.includes('name="urgency"'), 'jobs.html must contain urgency filter');
  assert.ok(content.includes('id="reset-filters"'), 'jobs.html must contain #reset-filters');
  assert.ok(content.includes('id="apply-filters-btn"'), 'jobs.html must contain #apply-filters-btn');

  // Main listing grid & controls
  assert.ok(content.includes('id="results-count"'), 'jobs.html must contain #results-count');
  assert.ok(content.includes('id="sort-select"'), 'jobs.html must contain #sort-select');
  assert.ok(content.includes('id="jobs-grid"'), 'jobs.html must contain #jobs-grid');
  assert.ok(content.includes('id="no-jobs-message"'), 'jobs.html must contain #no-jobs-message');

  // Modals & footer
  assert.ok(content.includes('id="job-details-modal"'), 'jobs.html must contain #job-details-modal');
  assert.ok(content.includes('id="location-modal"'), 'jobs.html must contain #location-modal');
  assert.ok(content.includes('<footer></footer>'), 'jobs.html must contain <footer> tag');

  // App script
  assert.ok(content.includes('src="./js/app.js"'), 'jobs.html must load ./js/app.js as module');
});

// ─────────────────────────────────────────────────────────────────
// M3.2: css/jobs.css styling rules
// ─────────────────────────────────────────────────────────────────
runTest('css/jobs.css contains responsive layout, card architecture, and urgency badge styling', () => {
  const cssPath = path.join(PROJECT_ROOT, 'css', 'jobs.css');
  assert.ok(fs.existsSync(cssPath), 'css/jobs.css must exist');

  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.layout-with-sidebar'), 'css/jobs.css must style .layout-with-sidebar');
  assert.ok(css.includes('.sidebar-filters'), 'css/jobs.css must style .sidebar-filters');
  assert.ok(css.includes('.jobs-grid'), 'css/jobs.css must style .jobs-grid');
  assert.ok(css.includes('.job-card'), 'css/jobs.css must style .job-card');
  assert.ok(css.includes('.badge-urgency-urgent'), 'css/jobs.css must style urgent urgency badge');
  assert.ok(css.includes('.badge-urgency-high'), 'css/jobs.css must style high urgency badge');
  assert.ok(css.includes('.badge-urgency-medium'), 'css/jobs.css must style medium urgency badge');
  assert.ok(css.includes('.badge-urgency-low'), 'css/jobs.css must style low urgency badge');
  assert.ok(css.includes('.recent-jobs-section') || css.includes('.recent-jobs-grid'), 'css/jobs.css must support homepage recent jobs');
});

// ─────────────────────────────────────────────────────────────────
// M3.3: Navigation links across all HTML pages
// ─────────────────────────────────────────────────────────────────
runTest('All 7 HTML pages include "Jobs" nav link in desktop and mobile menus', () => {
  const pages = [
    'index.html',
    'services.html',
    'category.html',
    'professional.html',
    'about.html',
    'how-it-works.html',
    'jobs.html'
  ];

  for (const page of pages) {
    const pagePath = path.join(PROJECT_ROOT, page);
    assert.ok(fs.existsSync(pagePath), `${page} must exist`);
    const html = fs.readFileSync(pagePath, 'utf8');

    // Desktop nav link check
    const hasDesktopLink = html.includes('href="./jobs.html"') && html.includes('>Jobs</a>');
    assert.ok(hasDesktopLink, `${page} must have desktop link to ./jobs.html`);

    // Mobile nav link check
    const hasMobileLink = html.includes('mobile-nav-link') && html.includes('href="./jobs.html"');
    assert.ok(hasMobileLink, `${page} must have mobile nav link with mobile-nav-link class to ./jobs.html`);
  }
});

// ─────────────────────────────────────────────────────────────────
// M3.4: Homepage Recent Jobs section in index.html
// ─────────────────────────────────────────────────────────────────
runTest('index.html contains Recent Jobs section and #recent-jobs-grid', () => {
  const indexPath = path.join(PROJECT_ROOT, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assert.ok(indexHtml.includes('recent-jobs-section') || indexHtml.includes('id="recent-jobs"'), 'index.html must contain recent jobs section');
  assert.ok(indexHtml.includes('id="recent-jobs-grid"'), 'index.html must contain #recent-jobs-grid');
  assert.ok(indexHtml.includes('href="./jobs.html"'), 'Recent jobs section must link to ./jobs.html');
  assert.ok(indexHtml.includes('href="./css/jobs.css"'), 'index.html must link to ./css/jobs.css in head');
});

// ─────────────────────────────────────────────────────────────────
// M3.5: js/app.js routing for jobs.html
// ─────────────────────────────────────────────────────────────────
runTest('js/app.js includes dynamic route handler for jobs.html', () => {
  const appJsPath = path.join(PROJECT_ROOT, 'js', 'app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  assert.ok(appJs.includes("path.includes('jobs.html')") || appJs.includes("endsWith('jobs.html')"), 'app.js must check for jobs.html route');
  assert.ok(appJs.includes('./pages/jobs.js'), 'app.js must import ./pages/jobs.js dynamically');
  assert.ok(appJs.includes('initJobs()'), 'app.js must invoke initJobs()');
});

// ─────────────────────────────────────────────────────────────────
// M3.6: Syntax validation for JS files
// ─────────────────────────────────────────────────────────────────
runTest('js/pages/jobs.js, js/pages/home.js, and js/app.js pass node --check', () => {
  execSync('node --check js/pages/jobs.js', { cwd: PROJECT_ROOT });
  execSync('node --check js/pages/home.js', { cwd: PROJECT_ROOT });
  execSync('node --check js/app.js', { cwd: PROJECT_ROOT });
});

// ─────────────────────────────────────────────────────────────────
// M3.7: Functional helpers validation in jobs.js & home.js
// ─────────────────────────────────────────────────────────────────
runTest('Relative time and budget parsing helpers work accurately', async () => {
  const jobsModule = await import('../js/pages/jobs.js');

  // 1. formatRelativeTime
  const now = new Date();
  assert.equal(jobsModule.formatRelativeTime(now.toISOString()), 'Just now');
  assert.equal(jobsModule.formatRelativeTime(new Date(now - 120 * 1000).toISOString()), '2 minutes ago');
  assert.equal(jobsModule.formatRelativeTime(new Date(now - 7200 * 1000).toISOString()), '2 hours ago');
  assert.equal(jobsModule.formatRelativeTime(new Date(now - 86400 * 2 * 1000).toISOString()), '2 days ago');
  assert.equal(jobsModule.formatRelativeTime(null), 'Recently');

  // 2. extractBudgetNumber
  assert.equal(jobsModule.extractBudgetNumber('$150 - $250'), 250);
  assert.equal(jobsModule.extractBudgetNumber('$500'), 500);
  assert.equal(jobsModule.extractBudgetNumber({ min: 100, max: 400 }), 400);
  assert.equal(jobsModule.extractBudgetNumber(350), 350);
  assert.equal(jobsModule.extractBudgetNumber('Negotiable'), 0);

  // 3. escapeHTML
  assert.equal(jobsModule.escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(jobsModule.escapeHTML(null), '');
});

// ─────────────────────────────────────────────────────────────────
// M3.8: Forbidden files remain strictly unmodified
// ─────────────────────────────────────────────────────────────────
runTest('Forbidden files (authUI.js and authService.js) are completely untouched in git status', () => {
  const gitStatus = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  });
  assert.equal(gitStatus.trim(), '', 'Forbidden files must have 0 git status changes');
});

console.log('\n=================================================================');
console.log(`SUMMARY: ${passed} / ${total} tests passed`);
console.log('=================================================================\n');

if (passed === total) {
  console.log('🎉 ALL M3 TESTS PASSED! Milestone M3 implementation complete.');
}
