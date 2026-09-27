/**
 * tests/challenger-m3-jobs-page.test.js
 *
 * Empirical Challenger Verification Harness for Milestone M3
 * Agent: challenger_m3_1
 *
 * Adversarially challenges and verifies:
 * 1. jobs.html loads correctly and displays open jobs.
 * 2. Filtering by category displays only jobs matching that category (dropdown & checkboxes).
 * 3. Filtering by urgency displays only jobs matching that urgency (urgent, high, medium, low).
 * 4. Searching by location filters jobs accordingly (case-insensitivity, substring, whitespace).
 * 5. Sorting by date and budget orders jobs correctly (newest, oldest, budget-desc, budget-asc).
 * 6. Non-matching filter combination displays the empty state message (#no-jobs-message).
 * 7. Reset filters restores all jobs (#reset-filters and #clear-filters-btn).
 * 8. Deep linking via URL query parameters (?category, ?urgency, ?location, ?sort, ?id).
 * 9. Job details modal interactions (open, close button, cancel button, backdrop click).
 * 10. Adversarial edge cases: XSS payload safety, budget parsing stress, reactive job:created event.
 *
 * Execution:
 *   node tests/challenger-m3-jobs-page.test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const assert = require('node:assert/strict');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function findBrowserExecutable() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) return process.env.BROWSER_PATH;

  const winCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];

  for (const p of winCandidates) {
    if (fs.existsSync(p)) return p;
  }

  const unixCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];

  for (const p of unixCandidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error('No Chromium-based browser executable found.');
}

/**
 * Ephemeral Test Server serving static assets and authentic /api/jobs responses
 */
class TestServer {
  constructor() {
    this.server = null;
    this.port = 0;
    this.dynamicJobs = null;
    try {
      this.initialJobs = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
    } catch {
      this.initialJobs = [];
    }
  }

  setJobs(jobsList) {
    this.dynamicJobs = jobsList;
  }

  resetJobs() {
    this.dynamicJobs = null;
  }

  getJobs() {
    if (this.dynamicJobs !== null) return this.dynamicJobs;
    return this.initialJobs;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
        let pathname = decodeURIComponent(parsedUrl.pathname);

        // API Endpoint: /api/jobs
        if (pathname === '/api/jobs' && req.method === 'GET') {
          const all = this.getJobs();
          const status = parsedUrl.searchParams.get('status') || 'open';
          const category = parsedUrl.searchParams.get('category');
          const urgency = parsedUrl.searchParams.get('urgency');
          const location = parsedUrl.searchParams.get('location');

          let filtered = all;
          if (status !== 'all') {
            filtered = filtered.filter(j => (j.status || 'open').toLowerCase() === status.toLowerCase());
          }
          if (category && category !== 'all') {
            const catLower = category.toLowerCase();
            filtered = filtered.filter(j =>
              String(j.category || '').toLowerCase() === catLower ||
              String(j.categorySlug || '').toLowerCase() === catLower ||
              String(j.categoryName || '').toLowerCase() === catLower
            );
          }
          if (urgency && urgency !== 'all') {
            filtered = filtered.filter(j => String(j.urgency || '').toLowerCase() === urgency.toLowerCase());
          }
          if (location) {
            filtered = filtered.filter(j => String(j.location || '').toLowerCase().includes(location.toLowerCase()));
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store'
          });
          res.end(JSON.stringify({
            success: true,
            count: filtered.length,
            jobs: filtered
          }));
          return;
        }

        // API Endpoint: /api/auth/me (simulate logged out or guest for browsing)
        if (pathname === '/api/auth/me') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
          return;
        }

        // Static Files
        if (pathname === '/') pathname = '/jobs.html';
        const filePath = path.join(PROJECT_ROOT, pathname);

        if (!filePath.startsWith(PROJECT_ROOT)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: ' + pathname);
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          res.end(data);
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

/**
 * Headless Chromium / Edge Driver via Chrome DevTools Protocol (CDP)
 */
class BrowserDriver {
  constructor(browserPath) {
    this.browserPath = browserPath;
    this.proc = null;
    this.ws = null;
    this.userDataDir = null;
    this.msgId = 0;
    this.callbacks = new Map();
    this.events = [];
    this.consoleErrors = [];
    this.dialogEvents = [];
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `challenger_m3_prof_${Date.now()}_${Math.random().toString(36).substring(2)}`);
    fs.mkdirSync(this.userDataDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.proc = spawn(this.browserPath, [
        '--headless=new',
        '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--window-size=1280,960',
        `--user-data-dir=${this.userDataDir}`,
        'about:blank'
      ]);

      let resolved = false;

      this.proc.stderr.on('data', async chunk => {
        const text = chunk.toString();
        const match = text.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/);
        if (match && !resolved) {
          resolved = true;
          const browserWsUrl = match[1];
          try {
            await this.connect(browserWsUrl);
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      });

      this.proc.on('error', err => {
        if (!resolved) reject(err);
      });

      setTimeout(() => {
        if (!resolved) reject(new Error('Timeout waiting for browser DevTools.'));
      }, 10000);
    });
  }

  async connect(browserWsUrl) {
    const portMatch = browserWsUrl.match(/:(\d+)\//);
    const port = portMatch[1];

    await new Promise(r => setTimeout(r, 400));
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const pages = await res.json();
    const page = pages.find(p => p.type === 'page') || pages[0];

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(page.webSocketDebuggerUrl);

      this.ws.onopen = async () => {
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        await this.send('DOM.enable');
        resolve();
      };

      this.ws.onmessage = msg => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) {
            reject(new Error(`CDP Error: ${data.error.message}`));
          } else {
            resolve(data.result);
          }
        } else if (data.method) {
          this.events.push(data);
          if (data.method === 'Page.javascriptDialogOpening') {
            this.dialogEvents.push(data.params);
            this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
          }
          if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
            const text = data.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            this.consoleErrors.push(text);
          }
          if (data.method === 'Runtime.exceptionThrown') {
            const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text || 'Unknown Exception';
            this.consoleErrors.push(desc);
          }
        }
      };

      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url) {
    this.events = [];
    await this.send('Page.navigate', { url });
    await new Promise(resolve => {
      const check = () => {
        if (this.events.some(e => e.method === 'Page.loadEventFired')) return resolve();
        setTimeout(check, 50);
      };
      check();
      setTimeout(resolve, 3000);
    });
    // Wait for dynamic modules to initialize and fetch jobs
    await new Promise(r => setTimeout(r, 600));
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval Exception: ${res.exceptionDetails.text || res.exceptionDetails.exception?.description}`);
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    if (this.proc) {
      try { this.proc.kill('SIGKILL'); } catch {}
    }
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}

// ─── Test Suite Execution ────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
const failures = [];

async function assertTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
    failures.push({ name, error: err.message });
  }
}

async function main() {
  console.log('=================================================================');
  console.log('CHALLENGER M3: EMPIRICAL VERIFICATION OF JOBS.HTML PAGE');
  console.log('Adversarial testing of loading, filtering, search, sort, empty state & reset');
  console.log('=================================================================\n');

  const server = new TestServer();
  const port = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral test server running at ${baseUrl}`);

  const browserPath = findBrowserExecutable();
  console.log(`Using browser: ${browserPath}`);

  const browser = new BrowserDriver(browserPath);
  await browser.launch();
  console.log('Headless browser initialized with CDP session.\n');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: Page Load & Initial State Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('=== SECTION 1: PAGE LOAD & INITIAL DISPLAY VERIFICATION ===');

    await browser.navigate(`${baseUrl}/jobs.html`);

    await assertTest('1.1: jobs.html loads correctly with page title and main layout', async () => {
      const pageTitle = await browser.evaluate('document.title');
      assert.ok(pageTitle.includes('Browse Open Jobs'), `Expected page title to include 'Browse Open Jobs', got: ${pageTitle}`);

      const heroVisible = await browser.evaluate('Boolean(document.querySelector(".jobs-hero"))');
      assert.ok(heroVisible, 'Hero section .jobs-hero must be present in DOM');

      const sidebarVisible = await browser.evaluate('Boolean(document.querySelector(".sidebar-filters"))');
      assert.ok(sidebarVisible, 'Sidebar filters .sidebar-filters must be present in DOM');

      const gridVisible = await browser.evaluate('Boolean(document.querySelector("#jobs-grid"))');
      assert.ok(gridVisible, 'Job cards grid #jobs-grid must be present in DOM');
    });

    await assertTest('1.2: Initial grid displays all 8 open jobs from dataset', async () => {
      const cardCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(cardCount, 8, `Expected exactly 8 open job cards rendered, got: ${cardCount}`);
    });

    await assertTest('1.3: Results counter indicates accurate job count', async () => {
      const countText = await browser.evaluate('document.getElementById("results-count").textContent.trim()');
      assert.equal(countText, 'Showing 8 open jobs', `Expected 'Showing 8 open jobs', got: '${countText}'`);
    });

    await assertTest('1.4: Empty state message is hidden when jobs are displayed', async () => {
      const emptyHidden = await browser.evaluate(`
        (() => {
          const el = document.getElementById("no-jobs-message");
          return el.classList.contains("hidden") || el.style.display === "none";
        })()
      `);
      assert.ok(emptyHidden, '#no-jobs-message must be hidden when jobs are present');
    });

    await assertTest('1.5: Rendered job cards contain all mandatory meta elements', async () => {
      const cardInfo = await browser.evaluate(`
        (() => {
          const cards = document.querySelectorAll("#jobs-grid .job-card");
          const first = cards[0];
          return {
            hasTitle: Boolean(first.querySelector(".job-title")),
            hasCategoryBadge: Boolean(first.querySelector(".job-category-badge")),
            hasUrgencyBadge: Boolean(first.querySelector(".badge")),
            hasLocation: Boolean(first.querySelector(".job-meta-item[title='Location']")),
            hasBudget: Boolean(first.querySelector(".job-budget")),
            hasRelativeTime: Boolean(first.querySelector(".job-meta-item[title='Posted']")),
            hasDetailsBtn: Boolean(first.querySelector(".view-details-btn")),
            hasApplyBtn: Boolean(first.querySelector(".apply-job-btn"))
          };
        })()
      `);

      assert.ok(cardInfo.hasTitle, 'Job card must contain .job-title');
      assert.ok(cardInfo.hasCategoryBadge, 'Job card must contain .job-category-badge');
      assert.ok(cardInfo.hasUrgencyBadge, 'Job card must contain urgency .badge');
      assert.ok(cardInfo.hasLocation, 'Job card must contain location meta');
      assert.ok(cardInfo.hasBudget, 'Job card must contain budget meta');
      assert.ok(cardInfo.hasRelativeTime, 'Job card must contain posted relative time');
      assert.ok(cardInfo.hasDetailsBtn, 'Job card must contain .view-details-btn');
      assert.ok(cardInfo.hasApplyBtn, 'Job card must contain .apply-job-btn');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: Category Filtering Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 2: CATEGORY FILTERING VERIFICATION ===');

    await assertTest('2.1: Filter by dropdown #filter-category displays only matching category jobs', async () => {
      // Select AC Repair (cat-6)
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("filter-category");
          select.value = "cat-6";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 1, `Expected exactly 1 job for cat-6 (AC Repair), got: ${count}`);

      const title = await browser.evaluate('document.querySelector("#jobs-grid .job-title").textContent');
      assert.ok(title.includes('Emergency AC Servicing'), `Expected Emergency AC Servicing, got: ${title}`);

      const resultsText = await browser.evaluate('document.getElementById("results-count").textContent.trim()');
      assert.equal(resultsText, 'Showing 1 open job');
    });

    await assertTest('2.2: Category select change synchronizes corresponding checkbox in sidebar', async () => {
      const isChecked = await browser.evaluate(`
        document.querySelector('input[name="category"][value="cat-6"]').checked
      `);
      assert.ok(isChecked, 'Category checkbox for cat-6 should be synchronized and checked');

      const allChecked = await browser.evaluate(`
        document.querySelector('input[name="category"][value="all"]').checked
      `);
      assert.equal(allChecked, false, 'All Categories checkbox should be unchecked');
    });

    await assertTest('2.3: Filter by category checkbox displays matching jobs and syncs dropdown', async () => {
      // Click Plumber (cat-2) checkbox
      await browser.evaluate(`
        (() => {
          const cb = document.querySelector('input[name="category"][value="cat-2"]');
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 1, `Expected 1 job for cat-2, got: ${count}`);

      const title = await browser.evaluate('document.querySelector("#jobs-grid .job-title").textContent');
      assert.ok(title.includes('Fix Leaking Kitchen Sink Pipe'), `Expected kitchen sink pipe, got: ${title}`);

      const dropdownVal = await browser.evaluate('document.getElementById("filter-category").value');
      assert.equal(dropdownVal, 'cat-2', 'Dropdown should sync to cat-2');
    });

    await assertTest('2.4: Selecting "All Categories" restores all 8 jobs', async () => {
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("filter-category");
          select.value = "all";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 8, `Expected 8 jobs after selecting all categories, got: ${count}`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: Urgency Filtering Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 3: URGENCY FILTERING VERIFICATION ===');

    await assertTest('3.1: Filtering by urgency "urgent" displays only urgent jobs', async () => {
      await browser.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="urgent"]');
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 1, `Expected 1 urgent job, got: ${count}`);

      const badgeText = await browser.evaluate('document.querySelector("#jobs-grid .job-card .badge").textContent');
      assert.ok(badgeText.includes('Urgent'), `Badge should contain Urgent, got: ${badgeText}`);
    });

    await assertTest('3.2: Filtering by urgency "high" displays only high urgency jobs', async () => {
      await browser.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="high"]');
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 3, `Expected 3 high urgency jobs (plumber, locksmith, appliance), got: ${count}`);

      const resultsText = await browser.evaluate('document.getElementById("results-count").textContent.trim()');
      assert.equal(resultsText, 'Showing 3 open jobs');
    });

    await assertTest('3.3: Filtering by urgency "medium" displays only medium urgency jobs', async () => {
      await browser.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="medium"]');
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 2, `Expected 2 medium urgency jobs (electrician, cleaning), got: ${count}`);
    });

    await assertTest('3.4: Filtering by urgency "low" displays only low urgency jobs', async () => {
      await browser.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="low"]');
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 2, `Expected 2 low urgency jobs (carpenter, painter), got: ${count}`);
    });

    await assertTest('3.5: Resetting urgency to "all" restores all 8 jobs', async () => {
      await browser.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="all"]');
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 8, `Expected 8 jobs restored, got: ${count}`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: Location Search Filtering Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 4: LOCATION SEARCH FILTERING VERIFICATION ===');

    await assertTest('4.1: Searching by location "Brooklyn" filters to 3 Brooklyn jobs', async () => {
      await browser.evaluate(`
        (() => {
          const input = document.getElementById("filter-location");
          input.value = "Brooklyn";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
      // Wait for debounce (250ms) + DOM render
      await new Promise(r => setTimeout(r, 350));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 3, `Expected 3 Brooklyn jobs, got: ${count}`);

      const locations = await browser.evaluate(`
        Array.from(document.querySelectorAll("#jobs-grid .job-meta-item[title='Location'] span")).map(el => el.textContent)
      `);
      assert.ok(locations.every(l => l.includes('Brooklyn')), `All locations must contain Brooklyn, got: ${JSON.stringify(locations)}`);
    });

    await assertTest('4.2: Location search is case-insensitive ("manhattan" matches 2 jobs)', async () => {
      await browser.evaluate(`
        (() => {
          const input = document.getElementById("filter-location");
          input.value = "manhattan";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 350));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 2, `Expected 2 Manhattan jobs, got: ${count}`);
    });

    await assertTest('4.3: Location search trims extra whitespace ("  Queens  " matches 2 jobs)', async () => {
      await browser.evaluate(`
        (() => {
          const input = document.getElementById("filter-location");
          input.value = "  Queens  ";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 350));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 2, `Expected 2 Queens jobs, got: ${count}`);
    });

    await assertTest('4.4: Clearing location input restores all 8 jobs', async () => {
      await browser.evaluate(`
        (() => {
          const input = document.getElementById("filter-location");
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 350));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 8, `Expected 8 jobs restored, got: ${count}`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: Sorting Verification (Date and Budget)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 5: SORTING VERIFICATION (DATE & BUDGET) ===');

    await assertTest('5.1: Sort "Newest First" orders jobs descending by date', async () => {
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("sort-select");
          select.value = "newest";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const titles = await browser.evaluate(`
        Array.from(document.querySelectorAll("#jobs-grid .job-title")).map(el => el.textContent.trim())
      `);

      // Emergency AC is newest (Sept 25 17:30)
      assert.ok(titles[0].includes('Emergency AC Servicing'), `First job must be Emergency AC Servicing, got: ${titles[0]}`);
      // Living Room Repainting is oldest (Sept 24 10:00)
      assert.ok(titles[titles.length - 1].includes('Living Room'), `Last job must be Living Room repainting, got: ${titles[titles.length - 1]}`);
    });

    await assertTest('5.2: Sort "Oldest First" orders jobs ascending by date', async () => {
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("sort-select");
          select.value = "oldest";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const titles = await browser.evaluate(`
        Array.from(document.querySelectorAll("#jobs-grid .job-title")).map(el => el.textContent.trim())
      `);

      assert.ok(titles[0].includes('Living Room'), `First job must be Living Room, got: ${titles[0]}`);
      assert.ok(titles[titles.length - 1].includes('Emergency AC Servicing'), `Last job must be Emergency AC, got: ${titles[titles.length - 1]}`);
    });

    await assertTest('5.3: Sort "Budget: High to Low" orders jobs descending by budget', async () => {
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("sort-select");
          select.value = "budget-desc";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const budgets = await browser.evaluate(`
        Array.from(document.querySelectorAll("#jobs-grid .budget-value")).map(el => el.textContent.trim())
      `);

      // Highest is $350 - $550 (max 550)
      assert.equal(budgets[0], '$350 - $550', `Highest budget must be $350 - $550, got: ${budgets[0]}`);
      // Lowest is $120 - $180 (max 180)
      assert.equal(budgets[budgets.length - 1], '$120 - $180', `Lowest budget must be $120 - $180, got: ${budgets[budgets.length - 1]}`);
    });

    await assertTest('5.4: Sort "Budget: Low to High" orders jobs ascending by budget', async () => {
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("sort-select");
          select.value = "budget-asc";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const budgets = await browser.evaluate(`
        Array.from(document.querySelectorAll("#jobs-grid .budget-value")).map(el => el.textContent.trim())
      `);

      assert.equal(budgets[0], '$120 - $180', `Lowest budget must be $120 - $180, got: ${budgets[0]}`);
      assert.equal(budgets[budgets.length - 1], '$350 - $550', `Highest budget must be $350 - $550, got: ${budgets[budgets.length - 1]}`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: Non-matching Filter Combination & Empty State Message
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 6: NON-MATCHING FILTERS & EMPTY STATE VERIFICATION ===');

    await assertTest('6.1: Non-matching combination (Electrician + Urgent) yields 0 jobs', async () => {
      // Set category to Electrician (cat-1)
      await browser.evaluate(`
        (() => {
          const catSelect = document.getElementById("filter-category");
          catSelect.value = "cat-1";
          catSelect.dispatchEvent(new Event("change", { bubbles: true }));

          const urgRadio = document.querySelector('input[name="urgency"][value="urgent"]');
          urgRadio.checked = true;
          urgRadio.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const cardCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(cardCount, 0, `Expected 0 jobs for Electrician + Urgent, got: ${cardCount}`);
    });

    await assertTest('6.2: Empty state UI #no-jobs-message is displayed with proper text', async () => {
      const emptyStateInfo = await browser.evaluate(`
        (() => {
          const el = document.getElementById("no-jobs-message");
          const isVisible = !el.classList.contains("hidden") && (el.style.display === "block" || window.getComputedStyle(el).display !== "none");
          return {
            isVisible,
            title: el.querySelector("h3") ? el.querySelector("h3").textContent.trim() : "",
            hasClearBtn: Boolean(el.querySelector("#clear-filters-btn"))
          };
        })()
      `);

      assert.ok(emptyStateInfo.isVisible, '#no-jobs-message must be visible');
      assert.ok(emptyStateInfo.title.includes('No jobs found'), `Expected title 'No jobs found...', got: ${emptyStateInfo.title}`);
      assert.ok(emptyStateInfo.hasClearBtn, 'Empty state must include #clear-filters-btn');
    });

    await assertTest('6.3: Results count displays "0 jobs found"', async () => {
      const countText = await browser.evaluate('document.getElementById("results-count").textContent.trim()');
      assert.equal(countText, '0 jobs found', `Expected '0 jobs found', got: '${countText}'`);
    });

    await assertTest('6.4: Non-matching location search ("NonExistentLocationCity999") triggers empty state', async () => {
      await browser.evaluate(`
        (() => {
          const input = document.getElementById("filter-location");
          input.value = "NonExistentLocationCity999";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 350));

      const cardCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(cardCount, 0, 'Expected 0 jobs for nonexistent location');

      const isVisible = await browser.evaluate(`
        !document.getElementById("no-jobs-message").classList.contains("hidden")
      `);
      assert.ok(isVisible, 'Empty state must remain visible');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: Reset Filters Restoration
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 7: RESET FILTERS RESTORATION VERIFICATION ===');

    await assertTest('7.1: Clicking #clear-filters-btn inside empty state restores all 8 jobs', async () => {
      await browser.evaluate(`
        document.getElementById("clear-filters-btn").click()
      `);
      await new Promise(r => setTimeout(r, 200));

      const cardCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(cardCount, 8, `Expected 8 jobs restored via clear-filters-btn, got: ${cardCount}`);

      const emptyHidden = await browser.evaluate(`
        document.getElementById("no-jobs-message").classList.contains("hidden") || document.getElementById("no-jobs-message").style.display === "none"
      `);
      assert.ok(emptyHidden, '#no-jobs-message must be hidden after reset');

      const countText = await browser.evaluate('document.getElementById("results-count").textContent.trim()');
      assert.equal(countText, 'Showing 8 open jobs');
    });

    await assertTest('7.2: Applying filters then clicking sidebar #reset-filters restores state', async () => {
      // Set filters
      await browser.evaluate(`
        (() => {
          document.getElementById("filter-category").value = "cat-7";
          document.getElementById("filter-category").dispatchEvent(new Event("change", { bubbles: true }));
          document.getElementById("filter-location").value = "Williamsburg";
          document.getElementById("filter-location").dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 350));

      let midCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(midCount, 1, 'Filter should narrow to 1 job');

      // Click #reset-filters
      await browser.evaluate(`
        document.getElementById("reset-filters").click()
      `);
      await new Promise(r => setTimeout(r, 200));

      const restoredCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(restoredCount, 8, `Expected 8 jobs restored via sidebar reset button, got: ${restoredCount}`);

      const state = await browser.evaluate(`
        (() => {
          return {
            catVal: document.getElementById("filter-category").value,
            locVal: document.getElementById("filter-location").value,
            urgVal: document.querySelector('input[name="urgency"]:checked').value,
            sortVal: document.getElementById("sort-select").value
          };
        })()
      `);

      assert.equal(state.catVal, 'all', 'Category dropdown reset to all');
      assert.equal(state.locVal, '', 'Location input cleared');
      assert.equal(state.urgVal, 'all', 'Urgency radio reset to all');
      assert.equal(state.sortVal, 'newest', 'Sort reset to newest');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 8: Deep-linking via URL Query Parameters
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 8: DEEP-LINKING VIA URL QUERY PARAMETERS ===');

    await assertTest('8.1: Query param ?category=cat-4 pre-filters to Painter jobs', async () => {
      await browser.navigate(`${baseUrl}/jobs.html?category=cat-4`);

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 1, `Expected 1 job for cat-4, got: ${count}`);

      const title = await browser.evaluate('document.querySelector("#jobs-grid .job-title").textContent');
      assert.ok(title.includes('Living Room & Accent Wall'), `Expected Painter job, got: ${title}`);

      const selectVal = await browser.evaluate('document.getElementById("filter-category").value');
      assert.equal(selectVal, 'cat-4');
    });

    await assertTest('8.2: Query param ?location=Brooklyn pre-filters to Brooklyn jobs', async () => {
      await browser.navigate(`${baseUrl}/jobs.html?location=Brooklyn`);

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 3, `Expected 3 Brooklyn jobs from query param, got: ${count}`);

      const locInputVal = await browser.evaluate('document.getElementById("filter-location").value');
      assert.equal(locInputVal, 'Brooklyn');
    });

    await assertTest('8.3: Query param ?id=... automatically opens #job-details-modal', async () => {
      const targetId = 'e4a11f20-9bf7-4c8d-b108-112233445501'; // Emergency AC Servicing
      await browser.navigate(`${baseUrl}/jobs.html?id=${targetId}`);

      const modalInfo = await browser.evaluate(`
        (() => {
          const modal = document.getElementById("job-details-modal");
          return {
            isOpen: !modal.classList.contains("hidden"),
            title: document.getElementById("job-details-title").textContent.trim(),
            category: document.getElementById("job-details-category-badge").textContent.trim(),
            location: document.getElementById("job-details-location").textContent.trim()
          };
        })()
      `);

      assert.ok(modalInfo.isOpen, '#job-details-modal must be open on direct link');
      assert.equal(modalInfo.title, 'Emergency AC Servicing - Unit Blowing Warm Air');
      assert.equal(modalInfo.category, 'AC Repair');
      assert.equal(modalInfo.location, 'Astoria, Queens, NY');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 9: Modal Details & Interaction Mechanics
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 9: MODAL DETAILS & INTERACTION MECHANICS ===');

    await assertTest('9.1: Close modal via close button (#job-details-close-btn)', async () => {
      await browser.evaluate(`
        document.getElementById("job-details-close-btn").click()
      `);
      await new Promise(r => setTimeout(r, 100));

      const isHidden = await browser.evaluate(`
        document.getElementById("job-details-modal").classList.contains("hidden")
      `);
      assert.ok(isHidden, 'Modal must close on close button click');
    });

    await assertTest('9.2: Opening modal from job card Details button', async () => {
      await browser.evaluate(`
        document.querySelector('.view-details-btn[data-job-id="e4a11f20-9bf7-4c8d-b108-112233445502"]').click()
      `);
      await new Promise(r => setTimeout(r, 100));

      const modalInfo = await browser.evaluate(`
        (() => {
          const modal = document.getElementById("job-details-modal");
          return {
            isOpen: !modal.classList.contains("hidden"),
            title: document.getElementById("job-details-title").textContent.trim()
          };
        })()
      `);

      assert.ok(modalInfo.isOpen, 'Modal must open when clicking Details button on job card');
      assert.ok(modalInfo.title.includes('Fix Leaking Kitchen Sink Pipe'));
    });

    await assertTest('9.3: Close modal via back button (#job-details-back-btn)', async () => {
      await browser.evaluate(`
        document.getElementById("job-details-back-btn").click()
      `);
      await new Promise(r => setTimeout(r, 100));

      const isHidden = await browser.evaluate(`
        document.getElementById("job-details-modal").classList.contains("hidden")
      `);
      assert.ok(isHidden, 'Modal must close on back button click');
    });

    await assertTest('9.4: Close modal via clicking backdrop overlay', async () => {
      // Re-open
      await browser.evaluate(`
        document.querySelector('.view-details-btn').click()
      `);
      await new Promise(r => setTimeout(r, 100));

      // Click overlay
      await browser.evaluate(`
        document.getElementById("job-details-modal").dispatchEvent(new MouseEvent("click", { bubbles: true }))
      `);
      await new Promise(r => setTimeout(r, 100));

      const isHidden = await browser.evaluate(`
        document.getElementById("job-details-modal").classList.contains("hidden")
      `);
      assert.ok(isHidden, 'Modal must close when clicking outer overlay backdrop');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: Adversarial Stress & Edge Cases
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== SECTION 10: ADVERSARIAL STRESS & EDGE CASES ===');

    await assertTest('10.1: XSS safety: Malicious job payload in title/description does not execute scripts', async () => {
      // Inject synthetic job with dangerous script tags into server
      const xssJob = {
        id: 'job-xss-test-001',
        title: '<script>window.__XSS_PWNED__=true;</script>Hacked Title',
        description: '<img src="x" onerror="window.__XSS_PWNED__=true;">Dangerous description',
        category: 'cat-1',
        categorySlug: 'electrician',
        categoryName: 'Electrician',
        location: '<script>alert(1)</script>New York',
        budget: '$100',
        urgency: 'low',
        status: 'open',
        customerId: 'test-xss-user',
        customerName: '<b onclick="alert(2)">Attacker</b>',
        createdAt: new Date().toISOString()
      };

      server.setJobs([xssJob]);

      // Re-navigate or refresh
      await browser.navigate(`${baseUrl}/jobs.html`);

      const xssExecuted = await browser.evaluate('Boolean(window.__XSS_PWNED__)');
      assert.equal(xssExecuted, false, 'XSS script must NEVER execute on jobs page!');

      const renderedTitle = await browser.evaluate('document.querySelector(".job-title").innerHTML');
      assert.ok(!renderedTitle.includes('<script>'), 'Title must be sanitized/escaped');

      server.resetJobs(); // Restore normal jobs
    });

    await assertTest('10.2: Defensive budget parsing handles non-standard budgets gracefully', async () => {
      const weirdBudgets = [
        { id: 'b1', title: 'Job 1', budget: '$1,500', createdAt: '2026-09-01T00:00:00Z', status: 'open' },
        { id: 'b2', title: 'Job 2', budget: 'Negotiable', createdAt: '2026-09-02T00:00:00Z', status: 'open' },
        { id: 'b3', title: 'Job 3', budget: { min: 200, max: 800 }, createdAt: '2026-09-03T00:00:00Z', status: 'open' },
        { id: 'b4', title: 'Job 4', budget: null, createdAt: '2026-09-04T00:00:00Z', status: 'open' },
        { id: 'b5', title: 'Job 5', budget: 450, createdAt: '2026-09-05T00:00:00Z', status: 'open' }
      ];

      server.setJobs(weirdBudgets);
      await browser.navigate(`${baseUrl}/jobs.html`);

      // Test sort high-to-low
      await browser.evaluate(`
        (() => {
          const select = document.getElementById("sort-select");
          select.value = "budget-desc";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const count = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(count, 5, 'All 5 weird budget jobs must render without errors');

      // Top budget should be Job 1 ($1,500)
      const topTitle = await browser.evaluate('document.querySelector("#jobs-grid .job-title").textContent');
      assert.equal(topTitle, 'Job 1', `Expected Job 1 to have highest budget, got: ${topTitle}`);

      server.resetJobs();
    });

    await assertTest('10.3: Reactive job:created custom event refreshes jobs page list', async () => {
      // Re-navigate to default jobs
      await browser.navigate(`${baseUrl}/jobs.html`);

      const initialCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(initialCount, 8);

      // Add a 9th job to server
      const currentJobs = server.getJobs();
      const newJob = {
        id: 'job-reactive-999',
        title: 'Brand New Reactive Job Post',
        description: 'Testing reactive refresh upon job creation event.',
        category: 'cat-2',
        categorySlug: 'plumber',
        categoryName: 'Plumber',
        location: 'Queens, NY',
        budget: '$300',
        urgency: 'high',
        status: 'open',
        createdAt: new Date().toISOString()
      };
      server.setJobs([newJob, ...currentJobs]);

      // Dispatch 'job:created' event on document
      await browser.evaluate(`
        document.dispatchEvent(new CustomEvent("job:created"))
      `);
      await new Promise(r => setTimeout(r, 200));

      const updatedCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(updatedCount, 9, `Expected 9 jobs after job:created event, got: ${updatedCount}`);

      const firstTitle = await browser.evaluate('document.querySelector("#jobs-grid .job-title").textContent');
      assert.equal(firstTitle, 'Brand New Reactive Job Post');

      server.resetJobs();
    });

    await assertTest('10.4: Rapid filter fuzzer: 20 rapid mutations maintain DOM consistency', async () => {
      await browser.navigate(`${baseUrl}/jobs.html`);

      // Fuzz filter inputs rapidly
      await browser.evaluate(`
        (() => {
          const cats = ["all", "cat-1", "cat-2", "cat-6", "all"];
          const urgs = ["all", "urgent", "high", "medium", "all"];
          const sorts = ["newest", "budget-desc", "oldest", "budget-asc"];

          for (let i = 0; i < 20; i++) {
            const cat = cats[i % cats.length];
            const urg = urgs[i % urgs.length];
            const sort = sorts[i % sorts.length];

            const catEl = document.getElementById("filter-category");
            if (catEl) {
              catEl.value = cat;
              catEl.dispatchEvent(new Event("change", { bubbles: true }));
            }

            const urgEl = document.querySelector('input[name="urgency"][value="' + urg + '"]');
            if (urgEl) {
              urgEl.checked = true;
              urgEl.dispatchEvent(new Event("change", { bubbles: true }));
            }

            const sortEl = document.getElementById("sort-select");
            if (sortEl) {
              sortEl.value = sort;
              sortEl.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
        })()
      `);
      await new Promise(r => setTimeout(r, 200));

      // After fuzzing, reset filters
      await browser.evaluate('document.getElementById("reset-filters").click()');
      await new Promise(r => setTimeout(r, 200));

      const finalCount = await browser.evaluate('document.querySelectorAll("#jobs-grid .job-card").length');
      assert.equal(finalCount, 8, `Expected 8 jobs after rapid fuzzer and reset, got: ${finalCount}`);
    });

    // Check for uncaught runtime exceptions during the entire run
    await assertTest('10.5: Zero uncaught console errors or exceptions during execution', async () => {
      const severeErrors = browser.consoleErrors.filter(e =>
        !e.includes('favicon.ico') &&
        !e.includes('unpkg.com') &&
        !e.includes('fonts.gstatic.com')
      );
      assert.equal(severeErrors.length, 0, `Expected 0 runtime console errors, got: ${JSON.stringify(severeErrors)}`);
    });

  } finally {
    console.log('\nTearing down browser driver and ephemeral test server...');
    await browser.close();
    await server.stop();
  }

  console.log('\n=================================================================');
  console.log(`CHALLENGER EXECUTION SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('=================================================================');

  if (failCount > 0) {
    console.error('\nFailures summary:');
    failures.forEach((f, i) => console.error(`  ${i + 1}. ${f.name}: ${f.error}`));
    process.exitCode = 1;
  } else {
    console.log('🎉 ALL EMPIRICAL CHALLENGER TESTS PASSED SUCCESSFULLY!');
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
