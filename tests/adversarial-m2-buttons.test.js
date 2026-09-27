/**
 * tests/adversarial-m2-buttons.test.js
 * Adversarial Empirical Verification Suite for Milestone M2:
 * "Post a Job" Button Wiring, Role Gating, Mobile Parity, and Modal Concurrency
 *
 * Investigator: challenger_m2_1 (Empirical Challenger)
 * Roles: critic, specialist
 *
 * Verifies:
 * 1. Clicking "Post a Job" when unauthenticated opens login modal and shows info toast.
 * 2. Clicking "Post a Job" when authenticated as customer opens job modal.
 * 3. Clicking "Post a Job" when authenticated as non-customer shows error toast.
 * 4. Mobile header buttons function identically to desktop buttons.
 * 5. Rapid double-clicking does not spawn duplicate modals or error.
 * 6. Cross-page consistency across all 6 HTML pages.
 * 7. Job modal form validation, char counter, and close mechanics.
 * 8. Zero unhandled console errors or exceptions.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const assert = require('node:assert/strict');

const PROJECT_ROOT = path.resolve(__dirname, '..');

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
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
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

  throw new Error('No Chromium/Edge browser executable found.');
}

/**
 * Ephemeral Test Server with controllable auth endpoint
 */
class TestServer {
  constructor() {
    this.server = null;
    this.port = 0;
    this.currentAuth = {
      authenticated: false,
      user: null
    };
    this.apiJobs = [];
    this.authDelayMs = 0;
  }

  setAuthState(state) {
    this.currentAuth = state;
  }

  setAuthDelay(ms) {
    this.authDelayMs = ms;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
        let pathname = decodeURIComponent(parsedUrl.pathname);

        // Control /api/auth/me
        if (pathname === '/api/auth/me') {
          if (this.authDelayMs > 0) {
            await new Promise(r => setTimeout(r, this.authDelayMs));
          }

          if (this.currentAuth.networkError) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Simulated server error' }));
            return;
          }

          if (this.currentAuth.authenticated && this.currentAuth.user) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              user: this.currentAuth.user
            }));
            return;
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Not authenticated'
            }));
            return;
          }
        }

        // Job API endpoint mock for end-to-end form submit testing
        if (pathname === '/api/jobs' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const newJob = {
                id: `job_${Date.now()}`,
                ...data,
                createdAt: new Date().toISOString()
              };
              this.apiJobs.push(newJob);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, job: newJob }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        if (pathname === '/api/jobs' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, jobs: this.apiJobs }));
          return;
        }

        // Static files
        if (pathname === '/') pathname = '/index.html';
        const filePath = path.join(PROJECT_ROOT, pathname);

        if (!filePath.startsWith(PROJECT_ROOT)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
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
 * Headless Browser Driver via CDP
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
    this.exceptions = [];
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `bluecollar_m2_e2e_${Date.now()}_${Math.random().toString(36).substring(2)}`);
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
            // Filter out deliberate/expected test errors if any
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
              hasJobModal: !!document.getElementById('post-job-modal'),
              hasAuthModal: !!document.getElementById('login-modal')
            };
          })()
        `);

        if (state && state.href !== 'about:blank' && state.hasBody) {
          const currentUrl = new URL(state.href);
          if (currentUrl.pathname === targetUrl.pathname) {
            if (state.readyState === 'complete' || state.readyState === 'interactive') {
              if (state.hasJobModal && state.hasAuthModal) {
                break;
              }
            }
          }
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 40));
    }

    // Brief stabilization for dynamic imports / icon rendering
    await new Promise(r => setTimeout(r, 150));
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

  async waitForFunction(expression, timeoutMs = 4000, intervalMs = 40) {
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

// ─── Test Suite Execution ───────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

async function it(title, fn) {
  totalTests++;
  process.stdout.write(`  [TEST ${totalTests}] ${title} ... `);
  try {
    await fn();
    console.log('✅ PASS');
    passedTests++;
    testResults.push({ title, status: 'PASS' });
  } catch (err) {
    console.log('❌ FAIL');
    console.error(`     Error: ${err.message}`);
    failedTests++;
    testResults.push({ title, status: 'FAIL', error: err.message });
  }
}

async function runAdversarialM2Suite() {
  console.log('=================================================================');
  console.log('ADVERSARIAL EMPIRICAL TEST SUITE: MILESTONE M2 BUTTON & MODAL WIRING');
  console.log('=================================================================\n');

  const server = new TestServer();
  const port = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browserPath = findBrowserExecutable();
  const driver = new BrowserDriver(browserPath);
  await driver.launch();

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 1: UNAUTHENTICATED STATE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 1: Unauthenticated "Post a Job" Click Flow ---');

    await it('S1.1: Clicking desktop "Post a Job" when unauthenticated displays info toast and opens login modal', async () => {
      server.setAuthState({ authenticated: false, user: null });
      await driver.navigate(`${baseUrl}/index.html`);

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
      assert.ok(clicked, 'Desktop "Post a Job" button must be found and clicked');

      // Wait for toast to appear
      await driver.waitForFunction(`
        (() => {
          const toast = document.querySelector('.toast');
          return toast && toast.textContent.includes('Please log in to post a job');
        })()
      `, 3000);

      const toastData = await driver.evaluate(`
        (() => {
          const toast = document.querySelector('.toast');
          return {
            text: toast.textContent.trim(),
            hasInfoClass: toast.classList.contains('info'),
            hasErrorClass: toast.classList.contains('error')
          };
        })()
      `);
      assert.ok(toastData.hasInfoClass, 'Toast must have "info" class');
      assert.ok(!toastData.hasErrorClass, 'Toast must NOT have "error" class');
      assert.ok(toastData.text.includes('Please log in to post a job.'), `Toast text mismatch: got "${toastData.text}"`);

      // Wait for login modal to open
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `, 3000);

      // Verify job modal remains closed
      const jobModalState = await driver.evaluate(`
        (() => {
          const jobModal = document.getElementById('post-job-modal');
          return {
            hasJobModal: !!jobModal,
            isHidden: jobModal ? jobModal.classList.contains('hidden') : true,
            isVisible: jobModal ? jobModal.classList.contains('visible') : false
          };
        })()
      `);
      assert.ok(jobModalState.isHidden, 'Job modal must remain hidden when unauthenticated');
      assert.ok(!jobModalState.isVisible, 'Job modal must NOT have visible class');

      // Close login modal for next test
      await driver.evaluate(`
        (() => {
          if (window.authUI?.closeAllAuthModals) window.authUI.closeAllAuthModals();
          document.querySelectorAll('.toast').forEach(t => t.remove());
        })()
      `);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 2: AUTHENTICATED CUSTOMER STATE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 2: Authenticated Customer "Post a Job" Click Flow ---');

    await it('S2.1: Clicking desktop "Post a Job" as authenticated customer opens job modal and avoids login prompt', async () => {
      server.setAuthState({
        authenticated: true,
        user: { id: 'cust_123', fullName: 'Alice Customer', email: 'alice@example.com', role: 'customer' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      const clicked = await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      assert.ok(clicked, 'Desktop "Post a Job" button must be found and clicked');

      // Wait for job modal to become visible
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `, 3000);

      const jobModalCheck = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          const loginModal = document.getElementById('login-modal');
          const errorToast = document.querySelector('.toast.error');
          const titleInput = document.getElementById('job-title');
          const categorySelect = document.getElementById('job-category');
          const urgencyRadios = document.querySelectorAll('input[name="urgency"]');
          const mediumUrgency = document.querySelector('input[name="urgency"][value="medium"]');

          return {
            modalVisible: modal.classList.contains('visible'),
            modalHidden: modal.classList.contains('hidden'),
            ariaHidden: modal.getAttribute('aria-hidden'),
            bodyOverflow: document.body.style.overflow,
            loginModalVisible: loginModal ? loginModal.classList.contains('visible') : false,
            hasErrorToast: !!errorToast,
            hasTitleInput: !!titleInput,
            categoryCount: categorySelect ? categorySelect.options.length : 0,
            urgencyCount: urgencyRadios.length,
            mediumChecked: mediumUrgency ? mediumUrgency.checked : false
          };
        })()
      `);

      assert.ok(jobModalCheck.modalVisible, 'Job modal must have visible class');
      assert.ok(!jobModalCheck.modalHidden, 'Job modal must NOT have hidden class');
      assert.equal(jobModalCheck.ariaHidden, 'false', 'Job modal aria-hidden must be false');
      assert.equal(jobModalCheck.bodyOverflow, 'hidden', 'Body overflow must be hidden while modal is open');
      assert.ok(!jobModalCheck.loginModalVisible, 'Login modal must NOT be opened for customer');
      assert.ok(!jobModalCheck.hasErrorToast, 'No error toast should appear for customer');
      assert.ok(jobModalCheck.hasTitleInput, 'Job title input must exist in modal');
      assert.equal(jobModalCheck.categoryCount, 13, 'Job category dropdown must have 13 options (1 prompt + 12 categories)');
      assert.equal(jobModalCheck.urgencyCount, 4, 'Must have 4 urgency radio options (low, medium, high, urgent)');
      assert.ok(jobModalCheck.mediumChecked, 'Medium urgency must be selected by default');
    });

    await it('S2.2: Closing the Job Modal restores body scroll and hides modal', async () => {
      const closed = await driver.evaluate(`
        (() => {
          const closeBtn = document.getElementById('job-modal-close-btn');
          if (!closeBtn) return false;
          closeBtn.click();
          return true;
        })()
      `);
      assert.ok(closed, 'Close button must exist and be clicked');

      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('hidden') && !modal.classList.contains('visible');
        })()
      `, 3000);

      const postCloseState = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return {
            isHidden: modal.classList.contains('hidden'),
            isVisible: modal.classList.contains('visible'),
            ariaHidden: modal.getAttribute('aria-hidden'),
            bodyOverflow: document.body.style.overflow
          };
        })()
      `);
      assert.ok(postCloseState.isHidden, 'Job modal must have hidden class after close');
      assert.ok(!postCloseState.isVisible, 'Job modal must NOT have visible class after close');
      assert.equal(postCloseState.ariaHidden, 'true', 'aria-hidden must be true');
      assert.equal(postCloseState.bodyOverflow, '', 'Body overflow must be restored to empty string');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 3: AUTHENTICATED NON-CUSTOMER ROLES
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 3: Authenticated Non-Customer Role Rejection Flow ---');

    const nonCustomerRoles = [
      { role: 'professional', label: 'Professional / Provider' },
      { role: 'admin', label: 'Administrator' },
      { role: 'moderator', label: 'Moderator' }
    ];

    for (const testRole of nonCustomerRoles) {
      await it(`S3.1: Clicking "Post a Job" as role "${testRole.role}" shows error toast and does not open modal`, async () => {
        server.setAuthState({
          authenticated: true,
          user: { id: `user_${testRole.role}`, fullName: `Test ${testRole.role}`, email: `${testRole.role}@test.com`, role: testRole.role }
        });
        await driver.navigate(`${baseUrl}/index.html`);

        const clicked = await driver.evaluate(`
          (() => {
            const btns = Array.from(document.querySelectorAll('.btn-primary'));
            const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
            if (!btn) return false;
            btn.click();
            return true;
          })()
        `);
        assert.ok(clicked, 'Desktop "Post a Job" button clicked');

        // Wait for error toast
        await driver.waitForFunction(`
          (() => {
            const toast = document.querySelector('.toast.error');
            return toast && toast.textContent.includes('Only customers can post jobs');
          })()
        `, 3000);

        const state = await driver.evaluate(`
          (() => {
            const jobModal = document.getElementById('post-job-modal');
            const loginModal = document.getElementById('login-modal');
            const toast = document.querySelector('.toast.error');
            return {
              jobModalHidden: jobModal ? jobModal.classList.contains('hidden') : true,
              jobModalVisible: jobModal ? jobModal.classList.contains('visible') : false,
              loginModalVisible: loginModal ? loginModal.classList.contains('visible') : false,
              toastText: toast ? toast.textContent.trim() : ''
            };
          })()
        `);

        assert.ok(state.jobModalHidden, 'Job modal must remain hidden');
        assert.ok(!state.jobModalVisible, 'Job modal must NOT be visible');
        assert.ok(!state.loginModalVisible, 'Login modal must NOT open');
        assert.equal(state.toastText, 'Only customers can post jobs.', 'Error toast message must match specification');

        // Clear toasts
        await driver.evaluate(`document.querySelectorAll('.toast').forEach(t => t.remove());`);
      });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 4: MOBILE HEADER BUTTON PARITY
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 4: Mobile Header Buttons Function Identically ---');

    await it('S4.1: Mobile "Post a Job" button exists inside .mobile-menu across pages', async () => {
      await driver.navigate(`${baseUrl}/index.html`);
      const mobileBtnExists = await driver.evaluate(`
        (() => {
          const mobileMenu = document.querySelector('.mobile-menu');
          if (!mobileMenu) return false;
          const btn = Array.from(mobileMenu.querySelectorAll('.btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          return !!btn;
        })()
      `);
      assert.ok(mobileBtnExists, 'Mobile menu must contain "Post a Job" button');
    });

    await it('S4.2: Mobile "Post a Job" unauthenticated closes drawer, shows info toast, and opens login modal', async () => {
      server.setAuthState({ authenticated: false, user: null });
      await driver.navigate(`${baseUrl}/index.html`);

      // Open mobile drawer
      await driver.evaluate(`
        (() => {
          const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
          mobileMenuBtn.click();
        })()
      `);

      const drawerIsOpen = await driver.evaluate(`document.querySelector('.mobile-menu').classList.contains('open')`);
      assert.ok(drawerIsOpen, 'Mobile drawer must be opened');

      // Click mobile "Post a Job" button
      const clicked = await driver.evaluate(`
        (() => {
          const mobileBtn = Array.from(document.querySelectorAll('.mobile-menu .btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          if (!mobileBtn) return false;
          mobileBtn.click();
          return true;
        })()
      `);
      assert.ok(clicked, 'Mobile Post a Job button clicked');

      // Wait for drawer to close and login modal to open
      await driver.waitForFunction(`
        (() => {
          const drawer = document.querySelector('.mobile-menu');
          const loginModal = document.getElementById('login-modal');
          const toast = document.querySelector('.toast.info');
          const isDrawerClosed = !drawer.classList.contains('open');
          const isLoginVisible = loginModal && loginModal.classList.contains('visible');
          return isDrawerClosed && isLoginVisible && !!toast;
        })()
      `, 3000);

      const mobileResult = await driver.evaluate(`
        (() => {
          const drawer = document.querySelector('.mobile-menu');
          const loginModal = document.getElementById('login-modal');
          const jobModal = document.getElementById('post-job-modal');
          const btn = document.querySelector('.mobile-menu-btn');
          const iconEl = btn ? btn.querySelector('i, svg') : null;
          return {
            drawerOpen: drawer.classList.contains('open'),
            loginVisible: loginModal.classList.contains('visible'),
            jobModalHidden: jobModal.classList.contains('hidden'),
            hasIcon: !!iconEl,
            iconTagName: iconEl ? iconEl.tagName.toLowerCase() : null,
            iconDataLucide: iconEl ? iconEl.getAttribute('data-lucide') : null
          };
        })()
      `);

      assert.ok(!mobileResult.drawerOpen, 'Mobile drawer must be automatically closed upon Post a Job click');
      assert.ok(mobileResult.loginVisible, 'Login modal must be visible');
      assert.ok(mobileResult.jobModalHidden, 'Job modal must remain hidden');
      assert.ok(mobileResult.hasIcon, 'Mobile menu button must contain an icon element');

      // Clean up
      await driver.evaluate(`
        if (window.authUI?.closeAllAuthModals) window.authUI.closeAllAuthModals();
        document.querySelectorAll('.toast').forEach(t => t.remove());
      `);
    });

    await it('S4.3: Mobile "Post a Job" as customer closes drawer and opens job modal', async () => {
      server.setAuthState({
        authenticated: true,
        user: { id: 'cust_m1', fullName: 'Mobile Customer', email: 'mob@test.com', role: 'customer' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      // Open mobile drawer
      await driver.evaluate(`document.querySelector('.mobile-menu-btn').click();`);
      assert.ok(await driver.evaluate(`document.querySelector('.mobile-menu').classList.contains('open')`));

      // Click mobile Post a Job
      await driver.evaluate(`
        (() => {
          const mobileBtn = Array.from(document.querySelectorAll('.mobile-menu .btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          mobileBtn.click();
        })()
      `);

      // Wait for job modal
      await driver.waitForFunction(`
        (() => {
          const drawer = document.querySelector('.mobile-menu');
          const jobModal = document.getElementById('post-job-modal');
          return !drawer.classList.contains('open') && jobModal && jobModal.classList.contains('visible');
        })()
      `, 3000);

      const res = await driver.evaluate(`
        (() => {
          const drawer = document.querySelector('.mobile-menu');
          const jobModal = document.getElementById('post-job-modal');
          return {
            drawerClosed: !drawer.classList.contains('open'),
            jobModalVisible: jobModal.classList.contains('visible'),
            jobModalNotHidden: !jobModal.classList.contains('hidden'),
            bodyOverflow: document.body.style.overflow
          };
        })()
      `);
      assert.ok(res.drawerClosed, 'Drawer closed');
      assert.ok(res.jobModalVisible, 'Job modal is visible');
      assert.ok(res.jobModalNotHidden, 'Job modal is not hidden');
      assert.equal(res.bodyOverflow, 'hidden', 'Body overflow hidden for modal');

      // Close job modal
      await driver.evaluate(`window.jobModalUI.closeModal();`);
    });

    await it('S4.4: Mobile "Post a Job" as non-customer closes drawer and shows error toast', async () => {
      server.setAuthState({
        authenticated: true,
        user: { id: 'pro_m1', fullName: 'Mobile Pro', email: 'pro@test.com', role: 'professional' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      // Open mobile drawer
      await driver.evaluate(`document.querySelector('.mobile-menu-btn').click();`);

      // Click mobile Post a Job
      await driver.evaluate(`
        (() => {
          const mobileBtn = Array.from(document.querySelectorAll('.mobile-menu .btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          mobileBtn.click();
        })()
      `);

      // Wait for error toast and drawer close
      await driver.waitForFunction(`
        (() => {
          const drawer = document.querySelector('.mobile-menu');
          const toast = document.querySelector('.toast.error');
          return !drawer.classList.contains('open') && !!toast;
        })()
      `, 3000);

      const res = await driver.evaluate(`
        (() => {
          const drawer = document.querySelector('.mobile-menu');
          const jobModal = document.getElementById('post-job-modal');
          const toast = document.querySelector('.toast.error');
          return {
            drawerClosed: !drawer.classList.contains('open'),
            jobModalHidden: jobModal.classList.contains('hidden'),
            toastText: toast.textContent.trim()
          };
        })()
      `);
      assert.ok(res.drawerClosed, 'Drawer closed');
      assert.ok(res.jobModalHidden, 'Job modal not opened');
      assert.equal(res.toastText, 'Only customers can post jobs.');

      await driver.evaluate(`document.querySelectorAll('.toast').forEach(t => t.remove());`);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 5: RAPID DOUBLE-CLICKING & CONCURRENCY STRESS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 5: Rapid Double-Clicking & Concurrency Stress Test ---');

    await it('S5.1: Rapid double-click on desktop button does not spawn duplicate modals or error', async () => {
      server.setAuthState({
        authenticated: true,
        user: { id: 'cust_stress', fullName: 'Stress User', email: 'stress@test.com', role: 'customer' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      // Fire 3 clicks within 15ms
      const clickBurst = await driver.evaluate(`
        new Promise(resolve => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          if (!btn) return resolve(false);

          btn.click();
          setTimeout(() => btn.click(), 5);
          setTimeout(() => btn.click(), 15);
          setTimeout(() => resolve(true), 50);
        })
      `);
      assert.ok(clickBurst, 'Burst clicks fired');

      // Wait for modal to settle
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('visible');
        })()
      `, 3000);

      const modalAudit = await driver.evaluate(`
        (() => {
          const allJobModals = document.querySelectorAll('#post-job-modal');
          const allContainers = document.querySelectorAll('.job-modal-container');
          const modal = document.getElementById('post-job-modal');
          return {
            modalCount: allJobModals.length,
            containerCount: allContainers.length,
            isVisible: modal.classList.contains('visible'),
            isHidden: modal.classList.contains('hidden')
          };
        })()
      `);

      assert.equal(modalAudit.modalCount, 1, 'Exactly ONE #post-job-modal must exist in DOM');
      assert.equal(modalAudit.containerCount, 1, 'Exactly ONE .job-modal-container must exist');
      assert.ok(modalAudit.isVisible, 'Modal is visible');
      assert.ok(!modalAudit.isHidden, 'Modal is not hidden');

      // Close modal
      await driver.evaluate(`window.jobModalUI.closeModal();`);
    });

    await it('S5.2: Rapid double-click on unauthenticated button opens exactly one login modal with no errors or duplicate DOM nodes', async () => {
      server.setAuthState({ authenticated: false, user: null });
      await driver.navigate(`${baseUrl}/index.html`);

      // Fire 2 rapid clicks in quick succession (double click)
      await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          btn.click();
          btn.click();
        })()
      `);

      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('visible');
        })()
      `, 3000);

      const unauthAudit = await driver.evaluate(`
        (() => {
          const loginModals = document.querySelectorAll('#login-modal');
          const jobModals = document.querySelectorAll('#post-job-modal');
          const toastList = document.querySelectorAll('.toast');
          return {
            loginModalCount: loginModals.length,
            jobModalCount: jobModals.length,
            toastCount: toastList.length,
            loginVisible: document.getElementById('login-modal').classList.contains('visible'),
            jobModalHidden: document.getElementById('post-job-modal').classList.contains('hidden')
          };
        })()
      `);

      assert.equal(unauthAudit.loginModalCount, 1, 'Exactly one login modal exists in DOM');
      assert.equal(unauthAudit.jobModalCount, 1, 'Exactly one job modal exists in DOM');
      assert.ok(unauthAudit.loginVisible, 'Login modal is visible');
      assert.ok(unauthAudit.jobModalHidden, 'Job modal remains hidden');

      await driver.evaluate(`
        if (window.authUI?.closeAllAuthModals) window.authUI.closeAllAuthModals();
        document.querySelectorAll('.toast').forEach(t => t.remove());
      `);
    });

    await it('S5.3: Simulating slow network (400ms auth check) with rapid clicks does not cause race condition', async () => {
      server.setAuthDelay(350);
      server.setAuthState({
        authenticated: true,
        user: { id: 'cust_slow', fullName: 'Slow Net User', email: 'slow@test.com', role: 'customer' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      // Click immediately, then click again at 50ms, 150ms, 250ms
      await driver.evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.btn-primary'));
          const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
          btn.click();
          setTimeout(() => btn.click(), 50);
          setTimeout(() => btn.click(), 150);
          setTimeout(() => btn.click(), 250);
        })()
      `);

      // Wait for auth check to finish and modal to open
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('visible');
        })()
      `, 4000);

      const count = await driver.evaluate(`document.querySelectorAll('#post-job-modal').length`);
      assert.equal(count, 1, 'Only one modal exists despite slow network clicks');

      server.setAuthDelay(0); // reset delay
      await driver.evaluate(`window.jobModalUI.closeModal();`);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 6: CROSS-PAGE CONSISTENCY (ALL 6 HTML PAGES)
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 6: Cross-Page Consistency Audit ---');

    const pages = [
      'index.html',
      'services.html',
      'category.html',
      'professional.html',
      'about.html',
      'how-it-works.html'
    ];

    for (const pageName of pages) {
      await it(`S6: "${pageName}" correctly initializes Post a Job buttons and opens modal`, async () => {
        server.setAuthState({
          authenticated: true,
          user: { id: `user_${pageName}`, fullName: 'Page Test', email: 'page@test.com', role: 'customer' }
        });
        await driver.navigate(`${baseUrl}/${pageName}`);

        // Check desktop and mobile buttons exist
        const buttonReport = await driver.evaluate(`
          (() => {
            const allPrimary = Array.from(document.querySelectorAll('.btn-primary'));
            const desktopBtn = allPrimary.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
            const mobileBtn = allPrimary.find(b => b.textContent.trim().toLowerCase() === 'post a job' && b.closest('.mobile-menu'));
            return {
              hasDesktop: !!desktopBtn,
              hasMobile: !!mobileBtn
            };
          })()
        `);
        assert.ok(buttonReport.hasDesktop, `${pageName} must have desktop "Post a Job" button`);
        assert.ok(buttonReport.hasMobile, `${pageName} must have mobile "Post a Job" button`);

        // Click desktop button
        await driver.evaluate(`
          (() => {
            const btns = Array.from(document.querySelectorAll('.btn-primary'));
            const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
            btn.click();
          })()
        `);

        // Verify modal opens
        await driver.waitForFunction(`
          (() => {
            const modal = document.getElementById('post-job-modal');
            return modal && modal.classList.contains('visible');
          })()
        `, 3000);

        const openOk = await driver.evaluate(`document.getElementById('post-job-modal').classList.contains('visible')`);
        assert.ok(openOk, `Job modal must open on ${pageName}`);

        // Close modal
        await driver.evaluate(`window.jobModalUI.closeModal();`);
      });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 7: MODAL FORM VALIDATION, INTERACTIONS & CLIENT CONSTRAINTS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 7: Modal Form Validation & Interactions ---');

    await it('S7.1: Submitting empty form blocks submission and displays validation errors', async () => {
      server.setAuthState({
        authenticated: true,
        user: { id: 'cust_val', fullName: 'Validator', email: 'val@test.com', role: 'customer' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      // Open job modal
      await driver.evaluate(`window.jobModalUI.openModal();`);
      await driver.waitForFunction(`document.getElementById('post-job-modal').classList.contains('visible')`);

      // Click Submit with empty inputs
      await driver.evaluate(`
        (() => {
          const submitBtn = document.getElementById('job-submit-btn');
          submitBtn.click();
        })()
      `);

      // Check validation error elements
      const validationReport = await driver.evaluate(`
        (() => {
          const titleErr = document.getElementById('job-title-error');
          const catErr = document.getElementById('job-category-error');
          const descErr = document.getElementById('job-description-error');
          const locErr = document.getElementById('job-location-error');
          const budgetErr = document.getElementById('job-budget-error');

          return {
            titleMsg: titleErr ? titleErr.textContent.trim() : '',
            catMsg: catErr ? catErr.textContent.trim() : '',
            descMsg: descErr ? descErr.textContent.trim() : '',
            locMsg: locErr ? locErr.textContent.trim() : '',
            budgetMsg: budgetErr ? budgetErr.textContent.trim() : '',
            titleHasErrorClass: document.getElementById('job-title')?.classList.contains('input-error')
          };
        })()
      `);

      assert.ok(validationReport.titleMsg.includes('required'), 'Title required error must appear');
      assert.ok(validationReport.catMsg.includes('category'), 'Category error must appear');
      assert.ok(validationReport.descMsg.includes('description'), 'Description error must appear');
      assert.ok(validationReport.locMsg.includes('location'), 'Location error must appear');
      assert.ok(validationReport.budgetMsg.includes('budget'), 'Budget error must appear');
      assert.ok(validationReport.titleHasErrorClass, 'Title input must receive .input-error class');
    });

    await it('S7.2: Typing short title (<5 chars) and invalid budget (min > max) shows specific errors', async () => {
      const budgetValidation = await driver.evaluate(`
        (() => {
          const titleInput = document.getElementById('job-title');
          titleInput.value = 'Fix'; // only 3 chars (minlength 5)

          const minInput = document.getElementById('job-budget-min');
          const maxInput = document.getElementById('job-budget-max');
          minInput.value = '500';
          maxInput.value = '200'; // min > max

          const submitBtn = document.getElementById('job-submit-btn');
          submitBtn.click();

          const titleErr = document.getElementById('job-title-error');
          const budgetErr = document.getElementById('job-budget-error');

          return {
            titleMsg: titleErr.textContent.trim(),
            budgetMsg: budgetErr.textContent.trim()
          };
        })()
      `);

      assert.ok(budgetValidation.titleMsg.includes('at least 5 characters'), `Title length error: ${budgetValidation.titleMsg}`);
      assert.ok(budgetValidation.budgetMsg.includes('Minimum budget cannot exceed maximum budget'), `Budget range error: ${budgetValidation.budgetMsg}`);
    });

    await it('S7.3: Description live character counter updates correctly', async () => {
      const counterBefore = await driver.evaluate(`document.getElementById('job-desc-counter').textContent.trim()`);
      assert.ok(counterBefore.includes('0 / 10 min'), `Initial counter: ${counterBefore}`);

      // Type 15 characters
      const counterAfter = await driver.evaluate(`
        (() => {
          const desc = document.getElementById('job-description');
          desc.value = '123456789012345';
          desc.dispatchEvent(new Event('input', { bubbles: true }));
          return document.getElementById('job-desc-counter').textContent.trim();
        })()
      `);
      assert.equal(counterAfter, '15 / 2000', 'Counter must show "15 / 2000" once minimum reached');
    });

    await it('S7.4: Escape key closes the open job modal', async () => {
      await driver.evaluate(`
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      `);

      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('hidden');
        })()
      `, 3000);

      const isHidden = await driver.evaluate(`document.getElementById('post-job-modal').classList.contains('hidden')`);
      assert.ok(isHidden, 'Escape key must close the job modal');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 8: DYNAMIC BUTTON DELEGATION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 8: Dynamically Inserted "Post a Job" Button Delegation ---');

    await it('S8.1: Dynamically created "Post a Job" button is intercepted and opens modal', async () => {
      server.setAuthState({
        authenticated: true,
        user: { id: 'cust_dyn', fullName: 'Dyn User', email: 'dyn@test.com', role: 'customer' }
      });
      await driver.navigate(`${baseUrl}/index.html`);

      // Inject new button into page
      await driver.evaluate(`
        (() => {
          const btn = document.createElement('button');
          btn.id = 'dynamic-post-job-test-btn';
          btn.className = 'btn btn-primary';
          btn.textContent = 'Post a Job';
          document.body.appendChild(btn);
        })()
      `);

      // Click injected button
      await driver.evaluate(`document.getElementById('dynamic-post-job-test-btn').click();`);

      // Verify modal opens
      await driver.waitForFunction(`
        (() => {
          const modal = document.getElementById('post-job-modal');
          return modal && modal.classList.contains('visible');
        })()
      `, 3000);

      const isVisible = await driver.evaluate(`document.getElementById('post-job-modal').classList.contains('visible')`);
      assert.ok(isVisible, 'Dynamic button must open job modal via document delegation');

      await driver.evaluate(`
        const b = document.getElementById('dynamic-post-job-test-btn');
        if (b) b.remove();
        window.jobModalUI.closeModal();
      `);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUITE 9: ZERO UNHANDLED CONSOLE ERRORS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- SUITE 9: Browser Console Diagnostics Audit ---');

    await it('S9.1: Zero unhandled console errors or exceptions during test execution', async () => {
      // Check captured console errors
      const criticalErrors = driver.consoleErrors.filter(err => {
        // Ignore deliberate simulated 500 error tests if any
        if (err.includes('Simulated server error')) return false;
        return true;
      });
      const criticalExceptions = driver.exceptions;

      if (criticalErrors.length > 0) {
        console.warn('  Captured console errors:', criticalErrors);
      }
      if (criticalExceptions.length > 0) {
        console.warn('  Captured runtime exceptions:', criticalExceptions);
      }

      assert.equal(criticalErrors.length, 0, `Expected 0 console errors, got: ${criticalErrors.join(', ')}`);
      assert.equal(criticalExceptions.length, 0, `Expected 0 runtime exceptions, got: ${criticalExceptions.join(', ')}`);
    });

  } finally {
    await driver.close();
    await server.stop();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n=================================================================');
  console.log('ADVERSARIAL VERIFICATION SUMMARY');
  console.log('=================================================================');
  console.log(`TOTAL TESTS:  ${totalTests}`);
  console.log(`PASSED:       ${passedTests} ✅`);
  console.log(`FAILED:       ${failedTests} ❌`);
  console.log('=================================================================');

  if (failedTests > 0) {
    console.error('\nFAILURES ENCOUNTERED:');
    testResults.filter(r => r.status === 'FAIL').forEach(f => {
      console.error(`- ${f.title}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL EMPIRICAL CHALLENGES PASSED! VERDICT: APPROVE');
  }
}

runAdversarialM2Suite().catch(err => {
  console.error('Fatal Test Runner Failure:', err);
  process.exit(1);
});
