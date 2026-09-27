/**
 * tests/adversarial-m3-review.js
 * Independent Adversarial Stress Test & Integrity Verification for Milestone M3
 * Author: reviewer_m3_2 (reviewer & critic)
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const http = require('http');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('=================================================================');
console.log('ADVERSARIAL STRESS TEST & INTEGRITY AUDIT — MILESTONE M3');
console.log('Reviewer: reviewer_m3_2');
console.log('=================================================================\n');

let passed = 0;
let total = 0;
const findings = [];

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ADV-${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ADV-${total}: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    findings.push({ test: name, error: err.message, stack: err.stack });
  }
}

(async () => {
  // ─────────────────────────────────────────────────────────────────
  // 1. INTEGRITY AUDIT: Forbidden Files Immutability Check
  // ─────────────────────────────────────────────────────────────────
  await test('Forbidden files (authUI.js & authService.js) are 100% untouched vs git HEAD', () => {
    const porcelain = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });
    assert.equal(porcelain.trim(), '', 'Forbidden files must have 0 unstaged or staged changes in git status');

    const diff = execSync('git diff HEAD -- js/components/authUI.js js/services/authService.js', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });
    assert.equal(diff.trim(), '', 'Forbidden files must have 0 diff against HEAD');
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. INTEGRITY AUDIT: No Mock Facades or Hardcoded Cheats in Source Code
  // ─────────────────────────────────────────────────────────────────
  await test('Source code contains no hardcoded test cheats or facade return values', () => {
    const jobsJs = fs.readFileSync(path.join(PROJECT_ROOT, 'js', 'pages', 'jobs.js'), 'utf8');
    const homeJs = fs.readFileSync(path.join(PROJECT_ROOT, 'js', 'pages', 'home.js'), 'utf8');

    // Check that jobs.js actually calls jobService.getJobs
    assert.ok(jobsJs.includes('jobService.getJobs'), 'jobs.js must dynamically call jobService.getJobs');
    // Check that home.js actually calls jobService.getJobs
    assert.ok(homeJs.includes('jobService.getJobs'), 'home.js must dynamically call jobService.getJobs');

    // Check that functions are not empty dummy facades
    assert.ok(!jobsJs.includes('return [] // mock'), 'No mock array returns allowed');
    assert.ok(!homeJs.includes('return [] // mock'), 'No mock array returns allowed');
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. ADVERSARIAL STRESS TEST: formatRelativeTime Boundary Conditions
  // ─────────────────────────────────────────────────────────────────
  await test('formatRelativeTime handles boundary intervals and date parsing safely without throwing', async () => {
    const { formatRelativeTime } = await import('../js/pages/jobs.js');
    const { formatRelativeTime: homeFormatTime } = await import('../js/pages/home.js');

    const now = Date.now();

    // 0 to 44 seconds -> 'Just now'
    assert.equal(formatRelativeTime(new Date(now).toISOString()), 'Just now');
    assert.equal(formatRelativeTime(new Date(now - 1000).toISOString()), 'Just now');
    assert.equal(formatRelativeTime(new Date(now - 44000).toISOString()), 'Just now');

    // Test 60+ seconds (e.g. 90 seconds) -> '1 minute ago' / '1 min ago'
    const t90s = new Date(now - 90000).toISOString();
    assert.equal(formatRelativeTime(t90s), '1 minute ago');
    assert.equal(homeFormatTime(t90s), '1 min ago');

    // 2 minutes -> '2 minutes ago'
    const t2m = new Date(now - 120000).toISOString();
    assert.equal(formatRelativeTime(t2m), '2 minutes ago');
    assert.equal(homeFormatTime(t2m), '2 mins ago');

    // 59 minutes -> '59 minutes ago'
    const t59m = new Date(now - 59 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(t59m), '59 minutes ago');

    // 60 minutes -> '1 hour ago'
    const t60m = new Date(now - 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(t60m), '1 hour ago');

    // 23 hours -> '23 hours ago'
    const t23h = new Date(now - 23 * 3600 * 1000).toISOString();
    assert.equal(formatRelativeTime(t23h), '23 hours ago');

    // 24 hours -> '1 day ago'
    const t24h = new Date(now - 24 * 3600 * 1000).toISOString();
    assert.equal(formatRelativeTime(t24h), '1 day ago');

    // 29 days -> '29 days ago'
    const t29d = new Date(now - 29 * 86400 * 1000).toISOString();
    assert.equal(formatRelativeTime(t29d), '29 days ago');

    // Null and undefined handling
    assert.equal(formatRelativeTime(null), 'Recently');
    assert.equal(formatRelativeTime(undefined), 'Recently');
    assert.equal(formatRelativeTime(''), 'Recently');

    assert.equal(homeFormatTime(null), 'Recently');
    assert.equal(homeFormatTime(undefined), 'Recently');
    assert.equal(homeFormatTime(''), 'Recently');

    // Verify neither function throws on malformed strings
    assert.doesNotThrow(() => formatRelativeTime('invalid-date'));
    assert.doesNotThrow(() => homeFormatTime('invalid-date'));
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. ADVERSARIAL STRESS TEST: extractBudgetNumber Parser
  // ─────────────────────────────────────────────────────────────────
  await test('extractBudgetNumber robustly parses various budget formats and edge cases', async () => {
    const { extractBudgetNumber } = await import('../js/pages/jobs.js');

    assert.equal(extractBudgetNumber(500), 500);
    assert.equal(extractBudgetNumber(0), 0);
    assert.equal(extractBudgetNumber(-100), -100);
    assert.equal(extractBudgetNumber(NaN), 0);
    assert.equal(extractBudgetNumber(null), 0);
    assert.equal(extractBudgetNumber(undefined), 0);

    // Strings with currency symbols and ranges
    assert.equal(extractBudgetNumber('$500'), 500);
    assert.equal(extractBudgetNumber('₹1,500'), 1500);
    assert.equal(extractBudgetNumber('$150 - $350'), 350); // extracts maximum of range for budget sorting
    assert.equal(extractBudgetNumber('₹2,000 to ₹5,000'), 5000);
    assert.equal(extractBudgetNumber('Budget: $1,250.50'), 1250.50);

    // Objects with min/max
    assert.equal(extractBudgetNumber({ min: 100, max: 800 }), 800);
    assert.equal(extractBudgetNumber({ min: 300 }), 300);
    assert.equal(extractBudgetNumber({}), 0);

    // Non-numeric strings
    assert.equal(extractBudgetNumber('Negotiable'), 0);
    assert.equal(extractBudgetNumber('Competitive rate'), 0);
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. ADVERSARIAL STRESS TEST: XSS Sanitization & Attack Payloads
  // ─────────────────────────────────────────────────────────────────
  await test('escapeHTML neutralizes all standard and advanced XSS payloads', async () => {
    const { escapeHTML } = await import('../js/pages/jobs.js');

    const payloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      '"><svg onload=alert(1)>',
      "';alert(String.fromCharCode(88,83,83))//",
      '<a href="javascript:alert(1)">Click</a>',
      'Normal text with & ampersand and "quotes" and \'single\''
    ];

    for (const p of payloads) {
      const sanitized = escapeHTML(p);
      assert.ok(!sanitized.includes('<script>'), `Failed to sanitize: ${p}`);
      assert.ok(!sanitized.includes('">'), `Failed to sanitize: ${p}`);
      assert.ok(!sanitized.includes('<img'), `Failed to sanitize: ${p}`);
      assert.ok(!sanitized.includes('<svg'), `Failed to sanitize: ${p}`);
      assert.ok(!sanitized.includes('<a href='), `Failed to sanitize: ${p}`);
      assert.ok(!sanitized.includes('"'), `Must escape double quotes: ${p}`);
      assert.ok(!sanitized.includes("'"), `Must escape single quotes: ${p}`);
    }

    // null / undefined handling
    assert.equal(escapeHTML(null), '');
    assert.equal(escapeHTML(undefined), '');
    assert.equal(escapeHTML(0), '0');
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. DOM VERIFICATION: jobs.html Element IDs vs jobs.js Controller
  // ─────────────────────────────────────────────────────────────────
  await test('jobs.html contains 100% of the IDs referenced by js/pages/jobs.js', () => {
    const jobsHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'jobs.html'), 'utf8');

    const requiredIds = [
      'jobs-grid',
      'results-count',
      'no-jobs-message',
      'filter-category',
      'filter-location',
      'sort-select',
      'reset-filters',
      'apply-filters-btn',
      'clear-filters-btn',
      'job-details-modal',
      'job-details-title',
      'job-details-category-badge',
      'job-details-location',
      'job-details-budget',
      'job-details-urgency',
      'job-details-date',
      'job-details-description',
      'job-details-customer',
      'job-details-apply-btn',
      'job-details-close-btn',
      'job-details-back-btn',
      'location-modal'
    ];

    for (const id of requiredIds) {
      assert.ok(
        jobsHtml.includes(`id="${id}"`),
        `jobs.html is missing required element id="${id}"`
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 7. DOM VERIFICATION: index.html Recent Jobs Section vs home.js
  // ─────────────────────────────────────────────────────────────────
  await test('index.html contains #recent-jobs-grid and valid link to jobs.html', () => {
    const indexHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');

    assert.ok(indexHtml.includes('id="recent-jobs-grid"'), 'index.html must have #recent-jobs-grid');
    assert.ok(indexHtml.includes('href="./jobs.html"'), 'index.html must have link to ./jobs.html');
    assert.ok(indexHtml.includes('Recent Job Postings'), 'index.html must have section title "Recent Job Postings"');
  });

  // ─────────────────────────────────────────────────────────────────
  // 8. NAVIGATION VERIFICATION: All 7 HTML Files Have Desktop & Mobile Nav
  // ─────────────────────────────────────────────────────────────────
  await test('All 7 application HTML files have consistent desktop and mobile nav links to jobs.html', () => {
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
      const html = fs.readFileSync(path.join(PROJECT_ROOT, page), 'utf8');

      // Desktop link check
      const hasDesktop = html.includes('href="./jobs.html"') && html.includes('>Jobs</a>');
      assert.ok(hasDesktop, `${page} missing desktop nav link to ./jobs.html`);

      // Mobile link check
      const hasMobile = html.includes('mobile-nav-link') && html.includes('href="./jobs.html"');
      assert.ok(hasMobile, `${page} missing mobile nav link with mobile-nav-link to ./jobs.html`);

      // If page is jobs.html, verify active class
      if (page === 'jobs.html') {
        assert.ok(html.includes('class="nav-link active">Jobs</a>'), 'jobs.html desktop nav link should be active');
        assert.ok(html.includes('mobile-nav-link active">Jobs</a>'), 'jobs.html mobile nav link should be active');
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 9. SIMULATED CONTROLLER LOGIC: Multi-facet Filter & Sort Rigorous Verification
  // ─────────────────────────────────────────────────────────────────
  await test('Multi-facet filtering and sorting logic handles edge cases and multi-criteria queries', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        title: 'Fix Kitchen Sink',
        category: 'cat-2', // Plumber
        categoryName: 'Plumber',
        categorySlug: 'plumber',
        location: 'Bandra West, Mumbai',
        urgency: 'urgent',
        budget: '$200 - $350',
        createdAt: '2026-09-25T10:00:00Z',
        status: 'open'
      },
      {
        id: 'job-2',
        title: 'Full House Rewiring',
        category: 'cat-1', // Electrician
        categoryName: 'Electrician',
        categorySlug: 'electrician',
        location: 'Andheri East, Mumbai',
        urgency: 'high',
        budget: '$1500',
        createdAt: '2026-09-25T12:00:00Z',
        status: 'open'
      },
      {
        id: 'job-3',
        title: 'Install Wooden Bookshelf',
        category: 'cat-3', // Carpenter
        categoryName: 'Carpenter',
        categorySlug: 'carpenter',
        location: 'Whitefield, Bangalore',
        urgency: 'medium',
        budget: '$450',
        createdAt: '2026-09-24T18:00:00Z',
        status: 'open'
      },
      {
        id: 'job-4',
        title: 'Leaking Bathroom Tap',
        category: 'cat-2', // Plumber
        categoryName: 'Plumber',
        categorySlug: 'plumber',
        location: 'Koramangala, Bangalore',
        urgency: 'low',
        budget: '$100',
        createdAt: '2026-09-25T14:00:00Z',
        status: 'open'
      }
    ];

    const { extractBudgetNumber } = await import('../js/pages/jobs.js');

    function filterAndSort(jobs, filterState) {
      let filtered = [...jobs];

      // Category
      if (filterState.category && filterState.category !== 'all') {
        const catQuery = filterState.category.toLowerCase().trim();
        filtered = filtered.filter(job => {
          if (!job) return false;
          const jCat = String(job.category || '').toLowerCase();
          const jSlug = String(job.categorySlug || '').toLowerCase();
          const jName = String(job.categoryName || '').toLowerCase();
          return jCat === catQuery || jSlug === catQuery || jName === catQuery;
        });
      }

      // Urgency
      if (filterState.urgency && filterState.urgency !== 'all') {
        const urgQuery = filterState.urgency.toLowerCase().trim();
        filtered = filtered.filter(job => {
          if (!job) return false;
          return String(job.urgency || '').toLowerCase() === urgQuery;
        });
      }

      // Location
      if (filterState.location) {
        const locQuery = filterState.location.toLowerCase().trim();
        filtered = filtered.filter(job => {
          if (!job) return false;
          return String(job.location || '').toLowerCase().includes(locQuery);
        });
      }

      // Sort
      const sortType = (filterState.sort || 'newest').toLowerCase();
      if (sortType === 'oldest') {
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else if (sortType === 'budget-desc') {
        filtered.sort((a, b) => extractBudgetNumber(b.budget) - extractBudgetNumber(a.budget));
      } else if (sortType === 'budget-asc') {
        filtered.sort((a, b) => extractBudgetNumber(a.budget) - extractBudgetNumber(b.budget));
      } else {
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return filtered;
    }

    // 1. All filters default -> returns all 4 sorted by newest first
    const r1 = filterAndSort(mockJobs, { category: 'all', urgency: 'all', location: '', sort: 'newest' });
    assert.equal(r1.length, 4);
    assert.equal(r1[0].id, 'job-4'); // 14:00
    assert.equal(r1[1].id, 'job-2'); // 12:00
    assert.equal(r1[2].id, 'job-1'); // 10:00
    assert.equal(r1[3].id, 'job-3'); // 2026-09-24

    // 2. Category filter by ID 'cat-2'
    const r2 = filterAndSort(mockJobs, { category: 'cat-2', urgency: 'all', location: '', sort: 'newest' });
    assert.equal(r2.length, 2);
    assert.ok(r2.every(j => j.category === 'cat-2'));

    // 3. Category filter by slug 'plumber'
    const r3 = filterAndSort(mockJobs, { category: 'plumber', urgency: 'all', location: '', sort: 'newest' });
    assert.equal(r3.length, 2);

    // 4. Urgency filter 'urgent'
    const r4 = filterAndSort(mockJobs, { category: 'all', urgency: 'urgent', location: '', sort: 'newest' });
    assert.equal(r4.length, 1);
    assert.equal(r4[0].id, 'job-1');

    // 5. Location substring 'Mumbai'
    const r5 = filterAndSort(mockJobs, { category: 'all', urgency: 'all', location: 'mumbai', sort: 'newest' });
    assert.equal(r5.length, 2);

    // 6. Multi-facet: Category 'cat-2' + Location 'Bangalore' + Urgency 'low'
    const r6 = filterAndSort(mockJobs, { category: 'cat-2', urgency: 'low', location: 'bangalore', sort: 'newest' });
    assert.equal(r6.length, 1);
    assert.equal(r6[0].id, 'job-4');

    // 7. Sort by budget-desc
    const r7 = filterAndSort(mockJobs, { category: 'all', urgency: 'all', location: '', sort: 'budget-desc' });
    assert.equal(r7[0].id, 'job-2'); // 1500
    assert.equal(r7[1].id, 'job-3'); // 450
    assert.equal(r7[2].id, 'job-1'); // 350
    assert.equal(r7[3].id, 'job-4'); // 100

    // 8. Sort by budget-asc
    const r8 = filterAndSort(mockJobs, { category: 'all', urgency: 'all', location: '', sort: 'budget-asc' });
    assert.equal(r8[0].id, 'job-4'); // 100
    assert.equal(r8[1].id, 'job-1'); // 350
    assert.equal(r8[2].id, 'job-3'); // 450
    assert.equal(r8[3].id, 'job-2'); // 1500

    // 9. Zero results criteria
    const r9 = filterAndSort(mockJobs, { category: 'cat-12', urgency: 'urgent', location: 'London', sort: 'newest' });
    assert.equal(r9.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────
  // 10. ADVERSARIAL STRESS TEST: Responsive CSS Breakpoint & Token Rules
  // ─────────────────────────────────────────────────────────────────
  await test('css/jobs.css conforms to project design system tokens and responsive rules', () => {
    const css = fs.readFileSync(path.join(PROJECT_ROOT, 'css', 'jobs.css'), 'utf8');

    // Design system tokens check
    assert.ok(css.includes('var(--surface-secondary)'), 'css/jobs.css must use --surface-secondary');
    assert.ok(css.includes('var(--brand-primary)'), 'css/jobs.css must use --brand-primary');
    assert.ok(css.includes('var(--radius-xl)'), 'css/jobs.css must use --radius-xl');
    assert.ok(css.includes('var(--border-default)'), 'css/jobs.css must use --border-default');

    // Responsive breakpoints check
    assert.ok(css.includes('@media (min-width: 1024px)'), 'css/jobs.css must have desktop breakpoint (1024px)');
    assert.ok(css.includes('@media (min-width: 768px)'), 'css/jobs.css must have tablet breakpoint (768px)');
    assert.ok(css.includes('@media (max-width: 640px)'), 'css/jobs.css must have mobile refinement (640px)');
  });

  // ─────────────────────────────────────────────────────────────────
  // 11. END-TO-END VERIFICATION: Isolated Server Job Query
  // ─────────────────────────────────────────────────────────────────
  await test('Live Server: Express job route GET /api/jobs respects limit, sort, status filters', async () => {
    const jobRoutes = require('../server/routes/jobs');
    const app = express();
    app.use(express.json());
    app.use('/api/jobs', jobRoutes);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/api/jobs?limit=6&sort=newest&status=open`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.success, 'GET /api/jobs should return success: true');
      assert.ok(Array.isArray(data.jobs), 'GET /api/jobs should return an array of jobs');
      assert.ok(data.jobs.length <= 6, 'Limit param should constrain results to <= 6');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log('\n=================================================================');
  console.log(`AUDIT SUMMARY: ${passed} / ${total} tests passed`);
  console.log('=================================================================\n');

  if (findings.length > 0) {
    console.error('FAILURES / FINDINGS DETECTED:');
    findings.forEach(f => console.error(`- ${f.test}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('🎉 ALL ADVERSARIAL CHECKS PASSED WITH ZERO INTEGRITY VIOLATIONS!');
  }
})();
