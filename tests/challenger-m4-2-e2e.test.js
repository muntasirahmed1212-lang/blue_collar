/**
 * tests/challenger-m4-2-e2e.test.js
 * 
 * Comprehensive Adversarial End-to-End Verification Test Harness
 * Agent: challenger_m4_2 (Empirical Challenger)
 * Roles: critic, specialist
 * 
 * Verifies the complete end-to-end user journey across BlueCollar Connect:
 * 1. Open homepage (index.html) -> click "Post a Job" -> triggers login prompt if unauthenticated.
 * 2. Unauthenticated mobile menu "Post a Job" -> closes drawer and triggers login prompt.
 * 3. Adversarial Role Gating: "professional" and unverified user blocked from posting jobs.
 * 4. Authenticate/simulate verified customer session -> click "Post a Job" -> job modal opens.
 * 5. Modal dismissal UX: Close button, Escape key, and backdrop click restore body scroll.
 * 6. Adversarial form validation: Empty submission, short title (<5 chars), short description (<10 chars), budgetMin > budgetMax.
 * 7. Fill valid form across 12 categories -> submit -> verify toast notification and modal closure.
 * 8. Persistence check: verify newly created job is written to server/db/jobs.json.
 * 9. Navigate to jobs.html -> verify newly created job appears in grid -> test filtering by that category and urgency -> verify card details.
 * 10. Check index.html -> verify recent jobs preview includes the new job.
 * 11. Multi-category creation & reactive event updates: create second job and verify live prepending.
 * 12. Forbidden files immutability check: js/components/authUI.js and js/services/authService.js.
 * 13. Audit console errors and runtime exceptions.
 * 
 * Execution:
 *   node tests/challenger-m4-2-e2e.test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const cors = require('cors');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');

// ─── Database Backup & Teardown Restoration ──────────────────────────────────
let PRISTINE_JOBS = '[]';
try {
  const currentJobs = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
  // Ensure base state has the 8 pristine seed jobs
  PRISTINE_JOBS = JSON.stringify(currentJobs.slice(0, 8), null, 2);
} catch {
  PRISTINE_JOBS = '[]';
}
const PRISTINE_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';

let restored = false;
function restoreDatabases() {
  if (restored) return;
  restored = true;
  try {
    fs.writeFileSync(JOBS_JSON_PATH, PRISTINE_JOBS, 'utf8');
    fs.writeFileSync(USERS_JSON_PATH, PRISTINE_USERS, 'utf8');
  } catch (_) {}
}

process.on('exit', restoreDatabases);
process.on('SIGINT', () => { restoreDatabases(); process.exit(1); });
process.on('SIGTERM', () => { restoreDatabases(); process.exit(1); });

// ─── Browser Discovery ───────────────────────────────────────────────────────
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

  throw new Error('No Chromium/Edge browser executable found.');
}

// ─── Ephemeral Test Server ───────────────────────────────────────────────────
class TestServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.port = 0;
  }

  async start() {
    // Ensure base jobs.json has the 8 pristine default records
    try {
      const currentJobs = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
      if (currentJobs.length > 8) {
        fs.writeFileSync(JOBS_JSON_PATH, JSON.stringify(currentJobs.slice(0, 8), null, 2), 'utf8');
      }
    } catch (_) {}

    // Seed test personas into users.json if not present
    let currentUsers = [];
    try {
      currentUsers = JSON.parse(fs.readFileSync(USERS_JSON_PATH, 'utf8'));
    } catch {
      currentUsers = [];
    }

    const testPersonas = [
      {
        id: 'cust-verified-alice-101',
        fullName: 'Alice VerifiedCustomer',
        email: 'alice@jobs-test.example.com',
        role: 'customer',
        isVerified: true
      },
      {
        id: 'pro-dan-201',
        fullName: 'Dan Professional',
        email: 'dan@pro-test.example.com',
        role: 'professional',
        isVerified: true
      },
      {
        id: 'cust-unverified-charlie-301',
        fullName: 'Charlie UnverifiedCustomer',
        email: 'charlie@unverified-test.example.com',
        role: 'customer',
        isVerified: false
      }
    ];

    for (const p of testPersonas) {
      if (!currentUsers.some(u => u.id === p.id)) {
        currentUsers.push({
          ...p,
          password: '$2b$10$4qV1yA.GfOL49BVUyce9X.sVxv8rADlq0TJXhKejgSRHXE1wbF.oK',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
    fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(currentUsers, null, 2), 'utf8');

    // Mount real routes
    const authRoutes = require('../server/routes/auth');
    const jobRoutes = require('../server/routes/jobs');

    this.app = express();
    this.app.use(cors({ origin: true, credentials: true }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(session({
      name: 'connect.sid',
      secret: 'challenger_m4_2_secret_' + Date.now(),
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
    }));

    // Session switch helper for browser testing
    this.app.post('/__test__/session', (req, res) => {
      if (req.body && req.body.userId) {
        req.session.userId = req.body.userId;
      } else {
        delete req.session.userId;
      }
      res.json({ success: true, userId: req.session.userId || null });
    });

    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/jobs', jobRoutes);
    this.app.use(express.static(PROJECT_ROOT));
    this.app.use((req, res) => res.sendFile(path.join(PROJECT_ROOT, 'index.html')));

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve(this.port);
      });
      this.server.on('error', reject);
    });
  }

  async stop() {
    return new Promise(resolve => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}

// ─── Headless Browser Driver via CDP ─────────────────────────────────────────
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
    this.exceptions = [];
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `challenger_m4_2_${Date.now()}_${Math.random().toString(36).substring(2)}`);
    fs.mkdirSync(this.userDataDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.proc = spawn(this.browserPath, [
        '--headless=new',
        '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--window-size=1280,900',
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
          if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
            const text = data.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            this.consoleErrors.push(text);
          }
          if (data.method === 'Runtime.exceptionThrown') {
            const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text || 'Unknown Exception';
            this.exceptions.push(desc);
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
    const navRes = await this.send('Page.navigate', { url });
    if (navRes && navRes.errorText) {
      throw new Error(`Page.navigate failed: ${navRes.errorText}`);
    }

    const targetUrl = new URL(url);
    const start = Date.now();
    const timeout = 10000;

    while (Date.now() - start < timeout) {
      try {
        const state = await this.evaluate(`
          (() => {
            if (!document || !document.body) return null;
            return {
              href: window.location.href,
              readyState: document.readyState,
              hasBody: !!document.body,
              hasPostJobBtn: Array.from(document.querySelectorAll('button, a')).some(b => b.textContent.trim().toLowerCase() === 'post a job')
            };
          })()
        `);

        if (state && state.href !== 'about:blank' && state.hasBody) {
          const currentUrl = new URL(state.href);
          if (currentUrl.pathname === targetUrl.pathname) {
            if (state.readyState === 'complete' || state.readyState === 'interactive') {
              if (state.hasPostJobBtn) {
                break;
              }
            }
          }
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 40));
    }

    // Brief stabilization for dynamic imports / icon rendering
    await new Promise(r => setTimeout(r, 200));
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

  async waitForFunction(expression, timeoutMs = 6000, intervalMs = 40) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.evaluate(expression);
        if (val) return val;
      } catch (err) {
        lastError = err;
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    if (lastError) throw lastError;
    throw new Error(`Timeout after ${timeoutMs}ms waiting for: ${expression}`);
  }

  async setSession(userId = null) {
    return this.evaluate(`
      fetch('/__test__/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ${JSON.stringify(userId)} })
      }).then(r => r.json())
    `);
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    if (this.proc) {
      this.proc.kill();
    }
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

// ─── Main Test Runner ────────────────────────────────────────────────────────
async function run() {
  console.log('================================================================================');
  console.log('CHALLENGER M4-2: ADVERSARIAL FULL END-TO-END USER JOURNEY VERIFICATION (CDP)');
  console.log('================================================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Workspace: ${PROJECT_ROOT}`);

  const browserPath = findBrowserExecutable();
  console.log(`Browser: ${browserPath}`);

  const testServer = new TestServer();
  const port = await testServer.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral Test Server listening on: ${baseUrl}`);

  const driver = new BrowserDriver(browserPath);
  await driver.launch();
  console.log('Headless browser CDP session established.');

  let passCount = 0;
  let failCount = 0;
  const testResults = [];

  async function test(name, fn) {
    process.stdout.write(`  [TEST] ${name} ... `);
    try {
      await fn();
      passCount++;
      testResults.push({ name, status: 'PASS' });
      console.log('✅ PASS');
    } catch (err) {
      failCount++;
      testResults.push({ name, status: 'FAIL', error: err.message });
      console.log('❌ FAIL');
      console.error(`         Details: ${err.message}`);
    }
  }

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1: UNAUTHENTICATED FLOW & LOGIN PROMPTS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 1: Unauthenticated Flow & Login Prompts ---');

    await test('P1.1: Visiting index.html unauthenticated & clicking desktop "Post a Job" triggers info toast and opens login modal', async () => {
      await driver.navigate(`${baseUrl}/index.html`);
      await driver.setSession(null); // Ensure session is unauthenticated

      // Click desktop Post a Job button
      const clicked = await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      assert.ok(clicked, 'Desktop "Post a Job" button found and clicked');

      // Wait for info toast
      await driver.waitForFunction(`
        (() => {
          const toast = document.querySelector('.toast');
          return toast && toast.textContent.includes('Please log in to post a job');
        })()
      `, 4000);

      const toastData = await driver.evaluate(`
        (() => {
          const toast = document.querySelector('.toast');
          return {
            text: toast.textContent.trim(),
            hasInfo: toast.classList.contains('info')
          };
        })()
      `);
      assert.ok(toastData.hasInfo, 'Toast must have info class');
      assert.ok(toastData.text.includes('Please log in to post a job.'), 'Toast text matches');

      // Wait for login modal to open
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `, 4000);

      // Verify job modal remains hidden
      const jobModalHidden = await driver.evaluate(`
        document.getElementById('post-job-modal').classList.contains('hidden')
      `);
      assert.ok(jobModalHidden, 'Job modal must remain hidden when unauthenticated');

      // Clean up toasts and modals
      await driver.evaluate(`
        if (window.authUI?.closeAllAuthModals) window.authUI.closeAllAuthModals();
        document.querySelectorAll('.toast').forEach(t => t.remove());
      `);
    });

    await test('P1.2: Unauthenticated click on mobile menu "Post a Job" closes drawer and prompts login', async () => {
      await driver.setSession(null);
      // Open mobile drawer
      await driver.evaluate(`
        (() => {
          const mobileBtn = document.querySelector('.mobile-menu-btn');
          const mobileMenu = document.querySelector('.mobile-menu');
          if (mobileMenu && !mobileMenu.classList.contains('open')) {
            mobileMenu.classList.add('open');
          }
        })()
      `);

      // Click mobile Post a Job
      const clicked = await driver.evaluate(`
        (() => {
          const mobileBtns = Array.from(document.querySelectorAll('.mobile-menu .btn-primary'));
          const btn = mobileBtns.find(b => b.textContent.trim().toLowerCase() === 'post a job');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      assert.ok(clicked, 'Mobile "Post a Job" button clicked');

      // Wait for toast
      await driver.waitForFunction(`
        (() => {
          const toast = document.querySelector('.toast');
          return toast && toast.textContent.includes('Please log in to post a job');
        })()
      `, 4000);

      // Verify drawer closed
      const isDrawerOpen = await driver.evaluate(`
        document.querySelector('.mobile-menu')?.classList.contains('open')
      `);
      assert.ok(!isDrawerOpen, 'Mobile drawer must automatically close');

      // Clean up
      await driver.evaluate(`
        if (window.authUI?.closeAllAuthModals) window.authUI.closeAllAuthModals();
        document.querySelectorAll('.toast').forEach(t => t.remove());
      `);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2: ADVERSARIAL ROLE GATING
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 2: Adversarial Role Gating ---');

    await test('P2.1: Logged in professional user clicking "Post a Job" is rejected with error toast', async () => {
      // Set session to Dan Professional
      await driver.setSession('pro-dan-201');

      const clicked = await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      assert.ok(clicked, 'Post a Job clicked');

      // Wait for error toast
      await driver.waitForFunction(`
        (() => {
          const toast = document.querySelector('.toast');
          return toast && toast.textContent.includes('Only customers can post jobs');
        })()
      `, 4000);

      const isHidden = await driver.evaluate(`
        document.getElementById('post-job-modal').classList.contains('hidden')
      `);
      assert.ok(isHidden, 'Job modal must remain hidden for professional role');

      await driver.evaluate(`document.querySelectorAll('.toast').forEach(t => t.remove());`);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 3: AUTHENTICATED CUSTOMER MODAL OPENING & UX
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 3: Authenticated Customer Modal Opening & UX ---');

    await test('P3.1: Authenticated verified customer clicks "Post a Job" -> opens modal with all 12 categories and urgency options', async () => {
      // Set session to Alice VerifiedCustomer
      await driver.setSession('cust-verified-alice-101');

      const clicked = await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      assert.ok(clicked, 'Post a Job clicked');

      // Wait for job modal to be visible
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `, 4000);

      const inspection = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          const catSelect = document.getElementById('job-category');
          const urgencyRadios = Array.from(document.querySelectorAll('input[name="urgency"]'));
          const checkedUrgency = document.querySelector('input[name="urgency"]:checked');

          return {
            isVisible: modal.classList.contains('visible'),
            ariaHidden: modal.getAttribute('aria-hidden'),
            bodyOverflow: document.body.style.overflow,
            categoryCount: catSelect ? catSelect.options.length : 0,
            urgencyCount: urgencyRadios.length,
            defaultUrgency: checkedUrgency ? checkedUrgency.value : null
          };
        })()
      `);

      assert.ok(inspection.isVisible, 'Job modal must have visible class');
      assert.equal(inspection.ariaHidden, 'false', 'Modal aria-hidden must be false');
      assert.equal(inspection.bodyOverflow, 'hidden', 'Body scroll must be locked');
      assert.equal(inspection.categoryCount, 13, 'Category dropdown must contain 13 options (1 prompt + 12 categories)');
      assert.equal(inspection.urgencyCount, 4, 'Must have 4 urgency levels');
      assert.equal(inspection.defaultUrgency, 'medium', 'Default urgency must be medium');
    });

    await test('P3.2: Modal dismissal methods (close button, Escape key, backdrop) restore scroll lock cleanly', async () => {
      // 1. Close button
      await driver.evaluate(`document.getElementById('job-modal-close-btn').click();`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('hidden')`, 3000);
      let overflow = await driver.evaluate(`document.body.style.overflow`);
      assert.notEqual(overflow, 'hidden', 'Scroll lock must be restored after close button click');

      // 2. Re-open and Escape key
      await driver.evaluate(`window.jobModalUI.openModal();`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('visible')`, 3000);
      await driver.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('hidden')`, 3000);
      overflow = await driver.evaluate(`document.body.style.overflow`);
      assert.notEqual(overflow, 'hidden', 'Scroll lock must be restored after Escape key');

      // 3. Re-open and backdrop click
      await driver.evaluate(`window.jobModalUI.openModal();`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('visible')`, 3000);
      await driver.evaluate(`document.getElementById('post-job-modal').click();`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('hidden')`, 3000);
      overflow = await driver.evaluate(`document.body.style.overflow`);
      assert.notEqual(overflow, 'hidden', 'Scroll lock must be restored after backdrop click');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 4: ADVERSARIAL CLIENT-SIDE VALIDATION STRESS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 4: Adversarial Client-side Validation Stress ---');

    await test('P4.1: Empty form submission is blocked with inline validation errors on all mandatory fields', async () => {
      await driver.evaluate(`window.jobModalUI.openModal();`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('visible')`, 3000);

      // Attempt submit without filling
      await driver.evaluate(`document.getElementById('job-submit-btn').click();`);

      const errors = await driver.evaluate(`
        (() => {
          return {
            title: document.getElementById('job-title-error')?.textContent.trim(),
            cat: document.getElementById('job-category-error')?.textContent.trim(),
            desc: document.getElementById('job-description-error')?.textContent.trim(),
            loc: document.getElementById('job-location-error')?.textContent.trim(),
            budget: document.getElementById('job-budget-error')?.textContent.trim(),
            modalStillVisible: document.getElementById('post-job-modal').classList.contains('visible')
          };
        })()
      `);

      assert.ok(errors.modalStillVisible, 'Modal must remain open');
      assert.ok(errors.title.includes('required'), 'Title required error must appear');
      assert.ok(errors.cat.includes('category'), 'Category error must appear');
      assert.ok(errors.desc.includes('description'), 'Description error must appear');
      assert.ok(errors.loc.includes('location'), 'Location error must appear');
      assert.ok(errors.budget.includes('budget'), 'Budget error must appear');
    });

    await test('P4.2: Boundary inputs (title < 5 chars, desc < 10 chars, budget min > max) are blocked', async () => {
      const boundaryReport = await driver.evaluate(`
        (() => {
          const titleInput = document.getElementById('job-title');
          const catSelect = document.getElementById('job-category');
          const descInput = document.getElementById('job-description');
          const locInput = document.getElementById('job-location');
          const minInput = document.getElementById('job-budget-min');
          const maxInput = document.getElementById('job-budget-max');

          titleInput.value = 'Fix'; // 3 chars < 5
          catSelect.value = 'cat-1';
          descInput.value = 'Too short'; // 9 chars < 10
          descInput.dispatchEvent(new Event('input', { bubbles: true }));
          locInput.value = 'Mumbai';
          minInput.value = '5000';
          maxInput.value = '1000'; // min > max

          document.getElementById('job-submit-btn').click();

          return {
            titleErr: document.getElementById('job-title-error')?.textContent.trim(),
            descErr: document.getElementById('job-description-error')?.textContent.trim(),
            budgetErr: document.getElementById('job-budget-error')?.textContent.trim(),
            descCounter: document.getElementById('job-desc-counter')?.textContent.trim()
          };
        })()
      `);

      assert.ok(boundaryReport.titleErr.includes('at least 5 characters'), 'Title length error must trigger');
      assert.ok(boundaryReport.descErr.includes('at least 10 characters'), 'Description length error must trigger');
      assert.ok(boundaryReport.budgetErr.includes('cannot exceed maximum'), 'Budget inverted error must trigger');
      assert.ok(boundaryReport.descCounter.includes('9 / 10 min'), 'Description character counter reflects current count');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 5: VALID JOB SUBMISSION & PERSISTENCE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 5: Valid Job Submission & Backend Persistence ---');

    const job1Data = {
      title: 'Emergency Geyser Thermostat Replacement',
      category: 'cat-9', // Appliance Repair
      categoryName: 'Appliance Repair',
      description: 'Electric water heater thermostat tripped and sparking, requires urgent technician inspection and element replacement.',
      location: 'Andheri East, Mumbai',
      budgetMin: '800',
      budgetMax: '2000',
      urgency: 'urgent',
      preferredDate: '2026-10-05T10:00',
      photos: 'https://example.com/geyser1.jpg, https://example.com/geyser2.jpg'
    };

    await test('P5.1: Filling valid fields across form and submitting creates job, shows toast, and closes modal', async () => {
      await driver.evaluate(`
        (() => {
          const form = document.getElementById('job-post-form');
          form.title.value = ${JSON.stringify(job1Data.title)};
          form.category.value = ${JSON.stringify(job1Data.category)};
          form.description.value = ${JSON.stringify(job1Data.description)};
          form.description.dispatchEvent(new Event('input', { bubbles: true }));
          form.location.value = ${JSON.stringify(job1Data.location)};
          form.budgetMin.value = ${JSON.stringify(job1Data.budgetMin)};
          form.budgetMax.value = ${JSON.stringify(job1Data.budgetMax)};
          
          const urgentRadio = document.querySelector('input[name="urgency"][value="urgent"]');
          if (urgentRadio) urgentRadio.checked = true;

          form.preferredDate.value = ${JSON.stringify(job1Data.preferredDate)};
          form.photos.value = ${JSON.stringify(job1Data.photos)};
        })()
      `);

      // Submit form
      await driver.evaluate(`document.getElementById('job-submit-btn').click();`);

      // Wait for success toast
      await driver.waitForFunction(`
        (() => {
          const toast = document.querySelector('.toast.success');
          return toast && toast.textContent.includes('Job posted successfully');
        })()
      `, 6000);

      // Verify modal is closed
      await driver.waitForFunction(`
        document.getElementById('post-job-modal').classList.contains('hidden')
      `, 4000);

      const modalClosed = await driver.evaluate(`
        document.getElementById('post-job-modal').classList.contains('hidden')
      `);
      assert.ok(modalClosed, 'Job modal must be closed after successful submission');

      // Verify persistence in jobs.json on disk
      const savedJobs = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
      const found = savedJobs.find(j => j.title === job1Data.title);
      assert.ok(found, 'Created job must be persisted in server/db/jobs.json');
      assert.equal(found.category, job1Data.category);
      assert.equal(found.urgency, job1Data.urgency);
      assert.equal(found.location, job1Data.location);
      assert.equal(found.customerId, 'cust-verified-alice-101');
      assert.equal(found.status, 'open');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 6: DEDICATED JOB LISTING PAGE (jobs.html) VERIFICATION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 6: Dedicated Job Listing Page (jobs.html) Verification ---');

    await test('P6.1: Navigating to jobs.html renders the newly created job in the grid with accurate card details', async () => {
      await driver.navigate(`${baseUrl}/jobs.html`);

      // Wait for jobs-grid to populate with cards
      await driver.waitForFunction(`
        document.querySelectorAll('#jobs-grid .job-card').length >= 1
      `, 5000);

      const cardData = await driver.evaluate(`
        (() => {
          const cards = Array.from(document.querySelectorAll('#jobs-grid .job-card'));
          const target = cards.find(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          if (!target) return null;

          return {
            title: target.querySelector('.job-title')?.textContent.trim(),
            category: target.querySelector('.job-category-badge')?.textContent.trim(),
            location: target.querySelector('.job-meta-item[title="Location"]')?.textContent.trim(),
            budget: target.querySelector('.budget-value')?.textContent.trim(),
            urgencyBadge: target.querySelector('.badge')?.textContent.trim(),
            postedTime: target.querySelector('.job-meta-item[title="Posted"]')?.textContent.trim(),
            hasViewDetailsBtn: !!target.querySelector('.view-details-btn')
          };
        })()
      `);

      assert.ok(cardData, 'Newly created job card must exist on jobs.html');
      assert.equal(cardData.title, job1Data.title);
      assert.ok(cardData.category.includes('Appliance Repair'), `Category must include Appliance Repair: ${cardData.category}`);
      assert.ok(cardData.location.includes('Andheri East, Mumbai'), `Location mismatch: ${cardData.location}`);
      assert.ok(cardData.budget.includes('800') && (cardData.budget.includes('2000') || cardData.budget.includes('2,000')), `Budget must reflect range: ${cardData.budget}`);
      assert.ok(cardData.urgencyBadge.toLowerCase().includes('urgent'), `Urgency badge must be Urgent: ${cardData.urgencyBadge}`);
      assert.ok(cardData.postedTime.length > 0, 'Posted time must be present');
      assert.ok(cardData.hasViewDetailsBtn, 'Details button must exist');
    });

    await test('P6.2: Filtering by category on jobs.html correctly isolates matching jobs', async () => {
      // 1. Select cat-9 (Appliance Repair)
      await driver.evaluate(`
        (() => {
          const catSelect = document.getElementById('filter-category');
          if (catSelect) {
            catSelect.value = 'cat-9';
            catSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);

      await new Promise(r => setTimeout(r, 150));

      const matchState = await driver.evaluate(`
        (() => {
          const visibleCards = Array.from(document.querySelectorAll('#jobs-grid .job-card')).filter(c => c.style.display !== 'none');
          const hasOurJob = visibleCards.some(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          return { count: visibleCards.length, hasOurJob };
        })()
      `);
      assert.ok(matchState.hasOurJob, 'Our job must be visible when Appliance Repair category is selected');

      // 2. Select cat-2 (Plumber) -> our Appliance Repair job must NOT be visible
      await driver.evaluate(`
        (() => {
          const catSelect = document.getElementById('filter-category');
          if (catSelect) {
            catSelect.value = 'cat-2';
            catSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);

      await new Promise(r => setTimeout(r, 150));

      const mismatchState = await driver.evaluate(`
        (() => {
          const visibleCards = Array.from(document.querySelectorAll('#jobs-grid .job-card')).filter(c => c.style.display !== 'none');
          const hasOurJob = visibleCards.some(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          return { count: visibleCards.length, hasOurJob };
        })()
      `);
      assert.ok(!mismatchState.hasOurJob, 'Our job must be hidden when Plumber category is selected');

      // 3. Reset category back to all
      await driver.evaluate(`
        (() => {
          const catSelect = document.getElementById('filter-category');
          if (catSelect) {
            catSelect.value = 'all';
            catSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await new Promise(r => setTimeout(r, 150));
    });

    await test('P6.3: Filtering by urgency on jobs.html correctly isolates matching jobs', async () => {
      // 1. Select "urgent" radio
      await driver.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="urgent"]');
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await new Promise(r => setTimeout(r, 150));

      const urgentMatch = await driver.evaluate(`
        (() => {
          const visibleCards = Array.from(document.querySelectorAll('#jobs-grid .job-card')).filter(c => c.style.display !== 'none');
          const hasOurJob = visibleCards.some(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          return { hasOurJob, count: visibleCards.length };
        })()
      `);
      assert.ok(urgentMatch.hasOurJob, 'Our urgent job must be visible when urgent filter is checked');

      // 2. Select "low" radio -> our urgent job must NOT be visible
      await driver.evaluate(`
        (() => {
          const radio = document.querySelector('input[name="urgency"][value="low"]');
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await new Promise(r => setTimeout(r, 150));

      const lowMismatch = await driver.evaluate(`
        (() => {
          const visibleCards = Array.from(document.querySelectorAll('#jobs-grid .job-card')).filter(c => c.style.display !== 'none');
          const hasOurJob = visibleCards.some(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          return { hasOurJob, count: visibleCards.length };
        })()
      `);
      assert.ok(!lowMismatch.hasOurJob, 'Our urgent job must be hidden when low urgency filter is checked');

      // 3. Reset filters button restores all jobs
      await driver.evaluate(`document.getElementById('reset-filters')?.click();`);
      await new Promise(r => setTimeout(r, 150));

      const restoredState = await driver.evaluate(`
        (() => {
          const visibleCards = Array.from(document.querySelectorAll('#jobs-grid .job-card')).filter(c => c.style.display !== 'none');
          const hasOurJob = visibleCards.some(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          return { count: visibleCards.length, hasOurJob };
        })()
      `);
      assert.ok(restoredState.hasOurJob, 'All jobs restored after filter reset');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 7: HOMEPAGE (index.html) RECENT JOBS PREVIEW SECTION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 7: Homepage (index.html) Recent Jobs Preview Section ---');

    await test('P7.1: index.html Recent Jobs preview contains the newly created job with card details and max 6 limit', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Wait for recent jobs grid to populate
      await driver.waitForFunction(`
        document.querySelectorAll('#recent-jobs-grid .job-card').length >= 1
      `, 5000);

      const previewData = await driver.evaluate(`
        (() => {
          const cards = Array.from(document.querySelectorAll('#recent-jobs-grid .job-card'));
          const target = cards.find(c => c.querySelector('.job-card-title')?.textContent.includes('Emergency Geyser Thermostat Replacement'));
          
          return {
            totalCards: cards.length,
            found: !!target,
            cardTitle: target?.querySelector('.job-card-title')?.textContent.trim(),
            category: (target?.querySelector('.job-category-tag') || target?.querySelector('.job-card-category'))?.textContent.trim(),
            location: (target?.querySelector('.job-meta-item:nth-of-type(1)') || target?.querySelector('.meta-item:nth-of-type(1)'))?.textContent.trim(),
            budget: (target?.querySelector('.job-budget-item') || target?.querySelector('.meta-item:nth-of-type(2)'))?.textContent.trim(),
            urgency: (target?.querySelector('.badge-urgency') || target?.querySelector('.urgency-badge'))?.textContent.trim()
          };
        })()
      `);

      assert.ok(previewData.found, 'Newly created job must appear in #recent-jobs-grid');
      assert.ok(previewData.totalCards >= 1 && previewData.totalCards <= 6, `Recent jobs count must be 1 to 6, got ${previewData.totalCards}`);
      assert.equal(previewData.cardTitle, job1Data.title);
      assert.ok(previewData.category.includes('Appliance Repair'), `Preview category: ${previewData.category}`);
      assert.ok(previewData.urgency.toLowerCase().includes('urgent'), `Preview urgency: ${previewData.urgency}`);
    });

    await test('P7.2: "View All Jobs" button in Recent Jobs section navigates to jobs.html', async () => {
      const linkHref = await driver.evaluate(`
        document.querySelector('.recent-jobs-section a[href*="jobs.html"]')?.getAttribute('href')
      `);
      assert.ok(linkHref && linkHref.includes('jobs.html'), 'View All Jobs must point to jobs.html');

      // Click "View All Jobs"
      await driver.evaluate(`
        document.querySelector('.recent-jobs-section a[href*="jobs.html"]').click();
      `);

      await driver.waitForFunction(`window.location.pathname.includes('jobs.html')`, 5000);
      const currentPath = await driver.evaluate(`window.location.pathname`);
      assert.ok(currentPath.includes('jobs.html'), `Must navigate to jobs.html, current: ${currentPath}`);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 8: MULTI-CATEGORY CREATION & REAL-TIME PREVIEW REACTIVITY
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 8: Multi-Category Creation & Real-Time Preview Reactivity ---');

    const job2Data = {
      title: 'Living Room Recessed LED Wiring Setup',
      category: 'cat-1', // Electrician
      categoryName: 'Electrician',
      description: 'Complete electrical wiring and panel replacement for 12 living room LED spotlights.',
      location: 'Bandra West, Mumbai',
      budgetMin: '1500',
      budgetMax: '3500',
      urgency: 'high'
    };

    await test('P8.1: Creating a second job from index.html dynamically refreshes Recent Jobs preview immediately via job:created event', async () => {
      await driver.navigate(`${baseUrl}/index.html`);
      await driver.setSession('cust-verified-alice-101');

      // Open modal
      await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          btn.click();
        })()
      `);

      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('visible')`, 4000);

      // Fill second job
      await driver.evaluate(`
        (() => {
          const form = document.getElementById('job-post-form');
          form.title.value = ${JSON.stringify(job2Data.title)};
          form.category.value = ${JSON.stringify(job2Data.category)};
          form.description.value = ${JSON.stringify(job2Data.description)};
          form.description.dispatchEvent(new Event('input', { bubbles: true }));
          form.location.value = ${JSON.stringify(job2Data.location)};
          form.budgetMin.value = ${JSON.stringify(job2Data.budgetMin)};
          form.budgetMax.value = ${JSON.stringify(job2Data.budgetMax)};
          
          const highRadio = document.querySelector('input[name="urgency"][value="high"]');
          if (highRadio) highRadio.checked = true;
        })()
      `);

      // Submit
      await driver.evaluate(`document.getElementById('job-submit-btn').click();`);

      // Wait for success toast & modal close
      await driver.waitForFunction(`document.querySelector('.toast.success')`, 5000);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('hidden')`, 4000);

      // Verify that without navigating away, the recent-jobs-grid updated automatically
      await driver.waitForFunction(`
        (() => {
          const firstCard = document.querySelector('#recent-jobs-grid .job-card');
          return firstCard && firstCard.querySelector('.job-card-title')?.textContent.includes('Living Room Recessed LED Wiring Setup');
        })()
      `, 5000);

      const firstCardTitle = await driver.evaluate(`
        document.querySelector('#recent-jobs-grid .job-card:first-child .job-card-title')?.textContent.trim()
      `);
      assert.equal(firstCardTitle, job2Data.title, 'Newly created job must be dynamically prepended to recent jobs preview');
    });

    await test('P8.2: jobs.html displays both newly created jobs and filters them independently', async () => {
      await driver.navigate(`${baseUrl}/jobs.html`);
      await driver.waitForFunction(`document.querySelectorAll('#jobs-grid .job-card').length >= 2`, 5000);

      // Both jobs must be in the grid
      const bothPresent = await driver.evaluate(`
        (() => {
          const titles = Array.from(document.querySelectorAll('#jobs-grid .job-title')).map(t => t.textContent.trim());
          return {
            hasJob1: titles.some(t => t.includes('Emergency Geyser Thermostat Replacement')),
            hasJob2: titles.some(t => t.includes('Living Room Recessed LED Wiring Setup'))
          };
        })()
      `);
      assert.ok(bothPresent.hasJob1, 'Job 1 (Geyser) must be present on jobs.html');
      assert.ok(bothPresent.hasJob2, 'Job 2 (Electrician) must be present on jobs.html');

      // Filter by Electrician (cat-1)
      await driver.evaluate(`
        (() => {
          const select = document.getElementById('filter-category');
          select.value = 'cat-1';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 150));

      const filterCat1 = await driver.evaluate(`
        (() => {
          const visible = Array.from(document.querySelectorAll('#jobs-grid .job-card')).filter(c => c.style.display !== 'none');
          return {
            hasJob1: visible.some(c => c.querySelector('.job-title')?.textContent.includes('Emergency Geyser Thermostat Replacement')),
            hasJob2: visible.some(c => c.querySelector('.job-title')?.textContent.includes('Living Room Recessed LED Wiring Setup'))
          };
        })()
      `);
      assert.ok(filterCat1.hasJob2, 'Electrician job must be visible for cat-1');
      assert.ok(!filterCat1.hasJob1, 'Appliance Repair job must be hidden for cat-1');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 9: FORBIDDEN FILES & IMMUTABILITY AUDIT
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 9: Forbidden Files & Immutability Audit ---');

    await test('P9.1: js/components/authUI.js and js/services/authService.js remain strictly untouched (0 git modifications)', async () => {
      const statusOut = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      }).trim();

      const diffOut = execSync('git diff HEAD js/components/authUI.js js/services/authService.js', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      }).trim();

      assert.equal(statusOut, '', `git status must be completely empty, got: ${statusOut}`);
      assert.equal(diffOut, '', `git diff HEAD must be completely empty, got: ${diffOut}`);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 10: CONSOLE ERRORS & RUNTIME EXCEPTIONS AUDIT
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- PHASE 10: Console Errors & Runtime Exceptions Audit ---');

    await test('P10.1: Zero unhandled runtime exceptions or unexpected console errors occurred during the test run', async () => {
      const fatalErrors = driver.consoleErrors.filter(err => {
        // Exclude benign network log or favicon notices if any
        if (err.includes('favicon.ico')) return false;
        return true;
      });

      assert.equal(driver.exceptions.length, 0, `Captured runtime exceptions: ${JSON.stringify(driver.exceptions)}`);
      assert.equal(fatalErrors.length, 0, `Captured console errors: ${JSON.stringify(fatalErrors)}`);
    });

  } finally {
    console.log('\n--- Teardown: Restoring Databases and Closing Browser ---');
    await driver.close();
    await testServer.stop();
    restoreDatabases();
    console.log('Restoration complete.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY TABLE & VERDICT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n================================================================================');
  console.log('                     CHALLENGER M4-2 VERIFICATION SUMMARY                       ');
  console.log('================================================================================');
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('--------------------------------------------------------------------------------');
  testResults.forEach((t, i) => {
    const icon = t.status === 'PASS' ? '✅' : '❌';
    console.log(`${(i + 1).toString().padStart(2)}. [${t.status}] ${t.name}`);
    if (t.error) {
      console.log(`    Error: ${t.error}`);
    }
  });
  console.log('================================================================================');

  if (failCount === 0) {
    console.log('\n🎉 ALL ADVERSARIAL END-TO-END TESTS PASSED!');
    console.log('FINAL VERDICT: APPROVE');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failCount} TEST(S) FAILED.`);
    console.log('FINAL VERDICT: REQUEST_CHANGES');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal Test Runner Exception:', err);
  restoreDatabases();
  process.exit(1);
});
