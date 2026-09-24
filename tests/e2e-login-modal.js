/**
 * tests/e2e-login-modal.js
 * End-to-End Automated Test Suite for Login Modal Stability and Regressions
 *
 * Verifies:
 * - R1: Eliminate race condition (modal stays open indefinitely after clicking Login)
 * - R2: Duplicate listener removal from modal.js
 * - R3: Mobile login button (.btn-outline) support and binding
 * - R4: Zero regressions (Register, Forgot Password, Post a Job toast, Set Location)
 * - Modal stability (rapid clicks, cross-page verification, zero console errors)
 *
 * Uses native Node.js (http, spawn, WebSocket) with Headless Chromium via CDP.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

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

  throw new Error('No Chromium-based browser executable found.');
}

class TestServer {
  constructor() {
    this.server = null;
    this.port = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
        let pathname = decodeURIComponent(parsedUrl.pathname);

        // Mock auth API endpoint for /api/auth/me to return 200 or 401 cleanly
        if (pathname === '/api/auth/me') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, user: null }));
          return;
        }

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
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `bluecollar_login_e2e_${Date.now()}_${Math.random().toString(36).substring(2)}`);
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
              hasHeader: !!document.querySelector('.header, header, nav, .header-actions'),
              hasModals: !!document.getElementById('login-modal')
            };
          })()
        `);

        if (state && state.href !== 'about:blank' && state.hasBody) {
          const currentUrl = new URL(state.href);
          if (currentUrl.pathname === targetUrl.pathname) {
            if (state.readyState === 'complete' || state.readyState === 'interactive') {
              if (state.hasModals || state.hasHeader) {
                break;
              }
            }
          }
        }
      } catch (_) {
        // Ignored during page navigation / execution context transition
      }
      await new Promise(r => setTimeout(r, 40));
    }

    // Brief stabilization for dynamic imports / icon rendering
    await new Promise(r => setTimeout(r, 150));
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
    throw new Error(`Timeout after ${timeoutMs}ms waiting for condition: ${expression}`);
  }

  async waitForSelector(selector, timeoutMs = 4000) {
    return this.waitForFunction(`!!document.querySelector(${JSON.stringify(selector)})`, timeoutMs);
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

async function runTests() {
  console.log('===============================================================');
  console.log(' BlueCollar Connect - Login Modal Stability & Regression Suite');
  console.log('===============================================================');

  const server = new TestServer();
  const port = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browserPath = findBrowserExecutable();
  const driver = new BrowserDriver(browserPath);
  await driver.launch();

  let passCount = 0;
  let failCount = 0;
  const failures = [];

  async function test(name, fn) {
    process.stdout.write(`  Running: ${name} ... `);
    try {
      await fn();
      console.log('PASS');
      passCount++;
    } catch (err) {
      console.log('FAIL');
      console.log(`    Error: ${err.message}`);
      failCount++;
      failures.push({ name, error: err.message });
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Desktop Login Modal opens and stays open indefinitely
    // -------------------------------------------------------------
    await test('T1: Desktop "Login" button opens modal and stays open indefinitely (>1200ms)', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Click desktop login button
      const clicked = await driver.waitForFunction(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.header-actions .btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `, 4000);
      if (!clicked) throw new Error('Desktop Login button not found.');

      // Wait 100ms for rAF transition
      await new Promise(r => setTimeout(r, 100));

      // Check modal state immediately after opening
      const stateImmediate = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          if (!modal) return null;
          const cs = window.getComputedStyle(modal);
          return {
            hasHidden: modal.classList.contains('hidden'),
            hasVisible: modal.classList.contains('visible'),
            display: cs.display,
            opacity: cs.opacity
          };
        })()
      `);

      if (!stateImmediate) throw new Error('login-modal element not found in DOM.');
      if (stateImmediate.hasHidden) throw new Error('login-modal should not have class "hidden" after open.');
      if (!stateImmediate.hasVisible) throw new Error('login-modal should have class "visible" after open.');
      if (stateImmediate.display === 'none') throw new Error('login-modal display should not be "none".');

      // Wait 1200ms to guarantee no delayed setTimeout hiding logic executes (old bug fired at 300ms)
      await new Promise(r => setTimeout(r, 1200));

      const stateAfterWait = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          const cs = window.getComputedStyle(modal);
          return {
            hasHidden: modal.classList.contains('hidden'),
            hasVisible: modal.classList.contains('visible'),
            display: cs.display,
            opacity: cs.opacity
          };
        })()
      `);

      if (stateAfterWait.hasHidden) throw new Error('REGRESSION: login-modal gained class "hidden" after 1200ms (race condition auto-closing!).');
      if (!stateAfterWait.hasVisible) throw new Error('REGRESSION: login-modal lost class "visible" after 1200ms.');
      if (stateAfterWait.display === 'none') throw new Error('REGRESSION: login-modal display became "none" after 1200ms.');
      if (parseFloat(stateAfterWait.opacity) < 0.9) throw new Error(`login-modal opacity is ${stateAfterWait.opacity}, expected ~1.`);
    });

    // -------------------------------------------------------------
    // Test 2: Mobile Login Modal opens and stays open indefinitely
    // -------------------------------------------------------------
    await test('T2: Mobile "Login" button (.btn-outline) opens modal and stays open indefinitely (>1200ms)', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open mobile menu
      await driver.waitForFunction(`
        (() => {
          const menuBtn = document.querySelector('.mobile-menu-btn');
          if (menuBtn) { menuBtn.click(); return true; }
          return false;
        })()
      `, 4000);
      await new Promise(r => setTimeout(r, 100));

      // Click mobile login button (.btn-outline)
      const clicked = await driver.waitForFunction(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.mobile-menu .btn-outline'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `, 4000);
      if (!clicked) throw new Error('Mobile Login button (.btn-outline) not found.');

      // Wait 100ms for rAF transition
      await new Promise(r => setTimeout(r, 100));

      const stateImmediate = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          if (!modal) return null;
          return {
            hasHidden: modal.classList.contains('hidden'),
            hasVisible: modal.classList.contains('visible'),
            display: window.getComputedStyle(modal).display
          };
        })()
      `);

      if (!stateImmediate.hasVisible || stateImmediate.hasHidden) {
        throw new Error('Mobile login button did not open login-modal.');
      }

      // Wait 1200ms
      await new Promise(r => setTimeout(r, 1200));

      const stateAfterWait = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return {
            hasHidden: modal.classList.contains('hidden'),
            hasVisible: modal.classList.contains('visible'),
            display: window.getComputedStyle(modal).display
          };
        })()
      `);

      if (stateAfterWait.hasHidden || !stateAfterWait.hasVisible || stateAfterWait.display === 'none') {
        throw new Error('REGRESSION: Mobile login modal auto-closed after 1200ms.');
      }
    });

    // -------------------------------------------------------------
    // Test 3: "Post a Job" shows "coming soon" toast
    // -------------------------------------------------------------
    await test('T3: Clicking "Post a Job" correctly shows the "coming soon" toast', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Click desktop Post a Job button
      const clicked = await driver.waitForFunction(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `, 4000);
      if (!clicked) throw new Error('Post a Job button not found.');

      await new Promise(r => setTimeout(r, 150));

      const toastState = await driver.evaluate(`
        (() => {
          const toast = document.querySelector('.toast');
          if (!toast) return null;
          return {
            text: toast.textContent.trim(),
            isVisible: toast.classList.contains('toast-visible') || !toast.classList.contains('hidden')
          };
        })()
      `);

      if (!toastState) throw new Error('Toast element was not created in DOM.');
      if (!toastState.text.includes('Post a Job feature coming soon')) {
        throw new Error(`Toast text mismatch: got "${toastState.text}"`);
      }
    });

    // -------------------------------------------------------------
    // Test 4: Switching between auth modals (Register, Forgot Password)
    // -------------------------------------------------------------
    await test('T4: Switching between Auth modals (Register, Forgot Password, Login) occurs cleanly without race condition', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open Login Modal
      await driver.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          btn.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      // Switch to Register Modal via link
      const regClicked = await driver.evaluate(`
        (() => {
          const link = document.getElementById('link-register');
          if (!link) return false;
          link.click();
          return true;
        })()
      `);
      if (!regClicked) throw new Error('#link-register not found.');

      await new Promise(r => setTimeout(r, 600));

      // Verify Register modal is open and Login modal is closed
      const regState = await driver.evaluate(`
        (() => {
          const regModal = document.getElementById('register-modal');
          const loginModal = document.getElementById('login-modal');
          return {
            regVisible: regModal.classList.contains('visible') && !regModal.classList.contains('hidden'),
            loginHidden: loginModal.classList.contains('hidden') && !loginModal.classList.contains('visible')
          };
        })()
      `);
      if (!regState.regVisible) throw new Error('Register modal is not visible after clicking #link-register.');
      if (!regState.loginHidden) throw new Error('Login modal did not close when Register opened.');

      // Switch back to Login Modal from Register
      await driver.evaluate(`
        (() => {
          const link = document.getElementById('link-login');
          if (link) link.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 600));

      const loginState = await driver.evaluate(`
        (() => {
          const regModal = document.getElementById('register-modal');
          const loginModal = document.getElementById('login-modal');
          return {
            regHidden: regModal.classList.contains('hidden'),
            loginVisible: loginModal.classList.contains('visible') && !loginModal.classList.contains('hidden')
          };
        })()
      `);
      if (!loginState.loginVisible) throw new Error('Login modal is not visible after switching back.');
      if (!loginState.regHidden) throw new Error('Register modal did not close when switching back.');

      // Switch to Forgot Password Modal
      await driver.evaluate(`
        (() => {
          const link = document.getElementById('link-forgot-password');
          if (link) link.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 600));

      const forgotState = await driver.evaluate(`
        (() => {
          const forgotModal = document.getElementById('forgot-password-modal');
          const loginModal = document.getElementById('login-modal');
          return {
            forgotVisible: forgotModal.classList.contains('visible') && !forgotModal.classList.contains('hidden'),
            loginHidden: loginModal.classList.contains('hidden')
          };
        })()
      `);
      if (!forgotState.forgotVisible) throw new Error('Forgot password modal is not visible.');
      if (!forgotState.loginHidden) throw new Error('Login modal did not close when forgot password opened.');

      // Switch back to Login from Forgot Password
      await driver.evaluate(`
        (() => {
          const link = document.getElementById('link-back-login');
          if (link) link.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 600));

      const finalLogin = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);
      if (!finalLogin) throw new Error('Login modal failed to re-open from forgot password modal.');
    });

    // -------------------------------------------------------------
    // Test 5: Modal Close Functionality (Close button and backdrop)
    // -------------------------------------------------------------
    await test('T5: Modal closes cleanly via close button and backdrop click', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open Login modal
      await driver.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          btn.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      // Click Close button
      const closeBtnClicked = await driver.evaluate(`
        (() => {
          const closeBtn = document.querySelector('#login-modal .modal-close');
          if (!closeBtn) return false;
          closeBtn.click();
          return true;
        })()
      `);
      if (!closeBtnClicked) throw new Error('Close button in #login-modal not found.');

      await new Promise(r => setTimeout(r, 100));

      const closedState = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return {
            hasHidden: modal.classList.contains('hidden'),
            hasVisible: modal.classList.contains('visible'),
            display: window.getComputedStyle(modal).display
          };
        })()
      `);

      if (!closedState.hasHidden || closedState.hasVisible || closedState.display !== 'none') {
        throw new Error('Modal did not close properly when clicking close button.');
      }

      // Re-open modal
      await driver.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          btn.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      // Click backdrop overlay (target === modal)
      await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const backdropClosedState = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return {
            hasHidden: modal.classList.contains('hidden'),
            hasVisible: modal.classList.contains('visible')
          };
        })()
      `);

      if (!backdropClosedState.hasHidden || backdropClosedState.hasVisible) {
        throw new Error('Modal did not close when clicking overlay backdrop.');
      }
    });

    // -------------------------------------------------------------
    // Test 6: Rapid Consecutive Clicks Stress Test
    // -------------------------------------------------------------
    await test('T6: Rapid consecutive clicks do not cause race conditions or auto-closing', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Click 5 times in rapid succession
      await driver.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          for (let i = 0; i < 5; i++) {
            btn.click();
          }
        })()
      `);

      // Wait 1200ms
      await new Promise(r => setTimeout(r, 1200));

      const isStillOpen = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);

      if (!isStillOpen) {
        throw new Error('Rapid clicks caused modal to disappear or close prematurely.');
      }
    });

    // -------------------------------------------------------------
    // Test 7: Non-Auth Modal Integrity (Set Location Modal)
    // -------------------------------------------------------------
    await test('T7a: Non-auth modal (Set Location) functions properly without interference', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Click global location button
      const clicked = await driver.waitForFunction(`
        (() => {
          const btn = document.querySelector('.global-location-btn');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `, 4000);
      if (!clicked) throw new Error('.global-location-btn not found.');

      await new Promise(r => setTimeout(r, 100));

      const locModalOpen = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('location-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);
      if (!locModalOpen) throw new Error('#location-modal did not open.');

      // Close location modal
      await driver.evaluate(`
        (() => {
          const closeBtn = document.querySelector('#location-modal .modal-close');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const locModalClosed = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('location-modal');
          return modal && modal.classList.contains('hidden');
        })()
      `);
      if (!locModalClosed) throw new Error('#location-modal did not close.');
    });

    await test('T7b: Set Location rapid clicks & rapid close-reopen stress test (no auto-closing / race conditions)', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open, close, and immediately re-open within 40ms (the old 300ms race condition bug!)
      await driver.evaluate(`
        (async () => {
          const locBtn = document.querySelector('.global-location-btn');
          locBtn.click();
          await new Promise(r => setTimeout(r, 40));
          const closeBtn = document.querySelector('#location-modal .modal-close');
          if (closeBtn) closeBtn.click();
          await new Promise(r => setTimeout(r, 40));
          locBtn.click(); // Re-open while previous close transition would have been ticking
        })()
      `);

      // Wait 1200ms to guarantee no delayed hiding logic prematurely closes it
      await new Promise(r => setTimeout(r, 1200));

      const locModalOpen = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('location-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);
      if (!locModalOpen) throw new Error('Location modal auto-closed due to close/re-open race condition!');

      // Close cleanly
      await driver.evaluate(`(() => document.querySelector('#location-modal .modal-close')?.click())()`);
      await new Promise(r => setTimeout(r, 100));
    });

    await test('T7c: Set Location modal closes on Escape key press', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      await driver.evaluate(`(() => document.querySelector('.global-location-btn')?.click())()`);
      await new Promise(r => setTimeout(r, 100));

      const isOpen = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('location-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);
      if (!isOpen) throw new Error('Location modal failed to open before Escape test.');

      // Press Escape
      await driver.evaluate(`(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))()`);
      await new Promise(r => setTimeout(r, 100));

      const isClosed = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('location-modal');
          return modal && modal.classList.contains('hidden') && !modal.classList.contains('visible');
        })()
      `);
      if (!isClosed) throw new Error('Location modal did not close when Escape was pressed.');
    });

    await test('T7d: Mutual exclusion between Set Location modal and Auth modals (opening one closes the other)', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open Location modal
      await driver.evaluate(`(() => document.querySelector('.global-location-btn')?.click())()`);
      await new Promise(r => setTimeout(r, 100));

      // Open Login modal
      await driver.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          if (btn) btn.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const stateAfterLoginOpen = await driver.evaluate(`
        (() => {
          const locModal = document.getElementById('location-modal');
          const loginModal = document.getElementById('login-modal');
          return {
            locHidden: locModal.classList.contains('hidden'),
            loginVisible: loginModal.classList.contains('visible') && !loginModal.classList.contains('hidden')
          };
        })()
      `);
      if (!stateAfterLoginOpen.loginVisible) throw new Error('Login modal is not visible.');
      if (!stateAfterLoginOpen.locHidden) throw new Error('Location modal stayed open behind Login modal (mutual exclusion failure)!');

      // Now open Location modal again
      await driver.evaluate(`(() => document.querySelector('.global-location-btn')?.click())()`);
      await new Promise(r => setTimeout(r, 100));

      const stateAfterLocOpen = await driver.evaluate(`
        (() => {
          const locModal = document.getElementById('location-modal');
          const loginModal = document.getElementById('login-modal');
          return {
            locVisible: locModal.classList.contains('visible') && !locModal.classList.contains('hidden'),
            loginHidden: loginModal.classList.contains('hidden')
          };
        })()
      `);
      if (!stateAfterLocOpen.locVisible) throw new Error('Location modal failed to reopen.');
      if (!stateAfterLocOpen.loginHidden) throw new Error('Login modal stayed open behind Location modal (mutual exclusion failure)!');

      // Clean up
      await driver.evaluate(`(() => document.querySelector('#location-modal .modal-close')?.click())()`);
      await new Promise(r => setTimeout(r, 100));
    });

    // -------------------------------------------------------------
    // Test 8: Cross-Page Login Button Verification
    // -------------------------------------------------------------
    const testPages = ['services.html', 'category.html', 'about.html', 'how-it-works.html', 'professional.html'];
    for (const pageName of testPages) {
      await test(`T8 [${pageName}]: Desktop & mobile login buttons function correctly`, async () => {
        await driver.navigate(`${baseUrl}/${pageName}`);

        // Test Desktop login button on this page
        const desktopClicked = await driver.waitForFunction(`
          (() => {
            const btn = Array.from(document.querySelectorAll('.header-actions .btn-ghost, header .btn-ghost'))
              .find(b => b.textContent.trim().toLowerCase() === 'login');
            if (!btn) return false;
            btn.click();
            return true;
          })()
        `, 4000);
        if (!desktopClicked) throw new Error(`Desktop Login button not found on ${pageName}`);

        await new Promise(r => setTimeout(r, 600));

        const desktopModalOpen = await driver.evaluate(`
          (() => {
            const modal = document.getElementById('login-modal');
            return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
          })()
        `);
        if (!desktopModalOpen) throw new Error(`Desktop Login modal did not stay open on ${pageName}`);

        // Close it
        await driver.evaluate(`(() => document.querySelector('#login-modal .modal-close')?.click())()`);
        await new Promise(r => setTimeout(r, 100));

        // Test Mobile login button on page (MUST be present on all pages)
        const hasMobileLogin = await driver.waitForFunction(`
          (() => {
            return Array.from(document.querySelectorAll('.mobile-menu .btn-outline'))
              .some(b => b.textContent.trim().toLowerCase() === 'login');
          })()
        `, 4000);

        if (!hasMobileLogin) {
          throw new Error(`Mobile Login button (.btn-outline) not found in .mobile-menu on ${pageName}`);
        }

        // Click mobile login button
        await driver.waitForFunction(`
          (() => {
            const btn = Array.from(document.querySelectorAll('.mobile-menu .btn-outline'))
              .find(b => b.textContent.trim().toLowerCase() === 'login');
            if (btn) { btn.click(); return true; }
            return false;
          })()
        `, 4000);
        await new Promise(r => setTimeout(r, 600));

        const mobileModalOpen = await driver.evaluate(`
          (() => {
            const modal = document.getElementById('login-modal');
            return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
          })()
        `);
        if (!mobileModalOpen) throw new Error(`Mobile Login modal did not stay open on ${pageName}`);

        // Close it
        await driver.evaluate(`(() => document.querySelector('#login-modal .modal-close')?.click())()`);
        await new Promise(r => setTimeout(r, 100));

        // Test Mobile Set Location button on page (MUST be present on all pages)
        const hasMobileLocation = await driver.waitForFunction(`
          (() => {
            const btn = document.querySelector('.mobile-menu .global-location-btn');
            if (!btn) return false;
            btn.click();
            return true;
          })()
        `, 4000);
        if (!hasMobileLocation) throw new Error(`Mobile Set Location button (.global-location-btn) not found in .mobile-menu on ${pageName}`);
        await new Promise(r => setTimeout(r, 200));

        const locOpen = await driver.evaluate(`
          (() => {
            const modal = document.getElementById('location-modal');
            return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
          })()
        `);
        if (!locOpen) throw new Error(`Mobile Set Location modal failed to open on ${pageName}`);

        // Close location modal
        await driver.evaluate(`(() => document.querySelector('#location-modal .modal-close')?.click())()`);
        await new Promise(r => setTimeout(r, 100));
      });
    }

    // -------------------------------------------------------------
    // Test 10: Keyboard Accessibility (Escape Key Closes Modal)
    // -------------------------------------------------------------
    await test('T10: Pressing Escape closes auth modals cleanly', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open Login modal
      await driver.waitForFunction(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          if (btn) { btn.click(); return true; }
          return false;
        })()
      `, 4000);
      await new Promise(r => setTimeout(r, 200));

      const isOpen = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);
      if (!isOpen) throw new Error('Login modal did not open before Escape test.');

      // Press Escape key
      await driver.evaluate(`
        (() => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const isClosed = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('hidden') && !modal.classList.contains('visible');
        })()
      `);
      if (!isClosed) throw new Error('Login modal did not close when Escape was pressed.');
    });

    // -------------------------------------------------------------
    // Test 11: Mobile "Post a Job" Coming Soon Toast
    // -------------------------------------------------------------
    await test('T11: Mobile "Post a Job" button displays coming-soon toast', async () => {
      await driver.navigate(`${baseUrl}/professional.html`);

      const toastShown = await driver.waitForFunction(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.mobile-menu .btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          if (!btn) return false;
          btn.click();
          const toast = document.querySelector('.toast');
          return toast && toast.textContent.includes('Post a Job feature coming soon!');
        })()
      `, 4000);
      if (!toastShown) throw new Error('Mobile Post a Job button did not display coming soon toast on professional.html');
    });

    // -------------------------------------------------------------
    // Test 12: Idempotent initAuth() Calls
    // -------------------------------------------------------------
    await test('T12: Calling initAuth() multiple times does not duplicate listeners or cause errors', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      await driver.evaluate(`
        (async () => {
          const { initAuth, openModal } = await import('./js/components/authUI.js');
          initAuth();
          initAuth();
          initAuth();
          openModal('login-modal');
        })()
      `);
      await new Promise(r => setTimeout(r, 300));

      const isOpen = await driver.evaluate(`
        (() => {
          const modal = document.getElementById('login-modal');
          return modal && modal.classList.contains('visible') && !modal.classList.contains('hidden');
        })()
      `);
      if (!isOpen) throw new Error('Multiple initAuth calls interfered with modal opening.');
    });

    // -------------------------------------------------------------
    // Test 13: Background Tab / Throttled RAF Behavior
    // -------------------------------------------------------------
    await test('T13: openModal() handles background tab (document.hidden) immediately', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      const immediateVisible = await driver.evaluate(`
        (() => {
          // Simulate document.hidden
          Object.defineProperty(document, 'hidden', { value: true, configurable: true });
          window.authUI.openModal('login-modal');
          const modal = document.getElementById('login-modal');
          const isImmediate = modal.classList.contains('visible') && !modal.classList.contains('hidden');
          // Restore document.hidden
          Object.defineProperty(document, 'hidden', { value: false, configurable: true });
          return isImmediate;
        })()
      `);
      if (!immediateVisible) throw new Error('openModal did not set visible immediately when document.hidden is true');
    });

    // -------------------------------------------------------------
    // Test 14: Zero Console Errors Check
    // -------------------------------------------------------------
    await test('T14: No JavaScript errors introduced in browser console', async () => {
      // Filter out expected favicon 404 or network errors if any
      const relevantErrors = driver.consoleErrors.filter(err => {
        if (err.includes('favicon.ico')) return false;
        return true;
      });

      if (relevantErrors.length > 0) {
        throw new Error(`Console errors detected during execution:\n  ${relevantErrors.join('\n  ')}`);
      }
    });

    // -------------------------------------------------------------
    // Test 15: Idempotent initModals() and initLocation() Calls
    // -------------------------------------------------------------
    await test('T15: Calling initModals() and initLocation() repeatedly does not duplicate listeners', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      const toastCount = await driver.waitForFunction(`
        (async () => {
          const { initModals } = await import('./js/components/modal.js');
          const { initLocation } = await import('./js/components/location.js');
          initModals();
          initModals();
          initModals();
          initLocation();
          initLocation();

          const btn = Array.from(document.querySelectorAll('.btn-primary'))
            .find(b => b.textContent.trim().toLowerCase() === 'post a job');
          if (!btn) return false;
          btn.click();
          await new Promise(r => setTimeout(r, 100));
          return document.querySelectorAll('.toast').length;
        })()
      `, 4000);

      if (toastCount !== 1) {
        throw new Error(`Expected exactly 1 toast for single click, but got ${toastCount} (duplicate listeners detected!)`);
      }
    });

    // -------------------------------------------------------------
    // Test 16: Zero Visual Flashing on Rapid Clicks to Already-Open Modal
    // -------------------------------------------------------------
    await test('T16: Re-clicking login button while modal is already open does not cause visual flashing', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open Login Modal
      await driver.waitForFunction(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          if (btn) { btn.click(); return true; }
          return false;
        })()
      `, 4000);
      await new Promise(r => setTimeout(r, 150));

      // Click Login button again 3 times while open
      const flashCheck = await driver.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('.btn-ghost'))
            .find(b => b.textContent.trim().toLowerCase() === 'login');
          const modal = document.getElementById('login-modal');
          let droppedVisibility = false;

          for (let i = 0; i < 3; i++) {
            btn.click();
            if (modal.classList.contains('hidden') || !modal.classList.contains('visible')) {
              droppedVisibility = true;
            }
          }
          return { droppedVisibility };
        })()
      `);

      if (flashCheck.droppedVisibility) {
        throw new Error('Modal briefly lost visible class or gained hidden class when re-clicked while already open (visual flashing detected!)');
      }
    });

    // -------------------------------------------------------------
    // Test 17: Body Scroll Locking on Modals
    // -------------------------------------------------------------
    await test('T17: Body scroll is locked when modals are open and restored when closed', async () => {
      await driver.navigate(`${baseUrl}/index.html`);

      // Open Login modal
      await driver.evaluate(`(() => window.authUI.openModal('login-modal'))()`);
      await new Promise(r => setTimeout(r, 100));

      const lockStateAuth = await driver.evaluate(`(() => document.body.style.overflow)()`);
      if (lockStateAuth !== 'hidden') {
        throw new Error(`Expected body overflow: hidden when login-modal open, got "${lockStateAuth}"`);
      }

      // Close auth modal
      await driver.evaluate(`(() => window.authUI.closeAllAuthModals())()`);
      await new Promise(r => setTimeout(r, 100));

      const unlockStateAuth = await driver.evaluate(`(() => document.body.style.overflow)()`);
      if (unlockStateAuth !== '') {
        throw new Error(`Expected body overflow: "" when login-modal closed, got "${unlockStateAuth}"`);
      }

      // Open Location modal
      await driver.evaluate(`(() => window.locationUI.openModal())()`);
      await new Promise(r => setTimeout(r, 100));

      const lockStateLoc = await driver.evaluate(`(() => document.body.style.overflow)()`);
      if (lockStateLoc !== 'hidden') {
        throw new Error(`Expected body overflow: hidden when location-modal open, got "${lockStateLoc}"`);
      }

      // Close Location modal
      await driver.evaluate(`(() => window.locationUI.closeModal())()`);
      await new Promise(r => setTimeout(r, 100));

      const unlockStateLoc = await driver.evaluate(`(() => document.body.style.overflow)()`);
      if (unlockStateLoc !== '') {
        throw new Error(`Expected body overflow: "" when location-modal closed, got "${unlockStateLoc}"`);
      }
    });

  } finally {
    await driver.close();
    await server.stop();
  }

  console.log('\n===============================================================');
  console.log(` Summary: Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('===============================================================');

  if (failCount > 0) {
    console.error('FAILED TESTS:');
    failures.forEach(f => console.error(` - ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED WITH ZERO REGRESSIONS!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
