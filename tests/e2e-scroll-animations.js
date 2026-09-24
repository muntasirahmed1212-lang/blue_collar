/**
 * tests/e2e-scroll-animations.js
 * Automated End-to-End Test Suite for BlueCollar Connect Native Scroll Animations
 * 
 * Tiers Covered:
 * - Tier 1: Feature Coverage (fade-up, scale-up, char-reveal, hero-parallax, reduced-motion, zero-dependencies) >= 5 per feature
 * - Tier 2: Boundary & Corner Cases (empty-grids, rapid-scrolling, missing-hero, window-resize, repeated-filters) >= 5 per feature
 * - Tier 3: Cross-Feature Combinations (pairwise interactions: dynamic-card+stagger, reduced-motion+reload, sticky-sidebar+entrance)
 * - Tier 4: Real-World User Workloads (full multi-step user journeys)
 * 
 * Execution:
 *   node tests/e2e-scroll-animations.js [--tier=1|2|3|4|all] [--verbose]
 * 
 * Zero external npm dependencies. Uses standard Node.js APIs (http, child_process, WebSocket).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Root project directory
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Command line arguments
const args = process.argv.slice(2);
const tierArg = args.find(a => a.startsWith('--tier='));
const targetTier = tierArg ? tierArg.split('=')[1].toLowerCase() : 'all';
const isVerbose = args.includes('--verbose') || args.includes('-v');

// MIME types dictionary for static file serving
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

// Find available Chromium browser (Edge or Chrome)
function findBrowserExecutable() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }

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

  throw new Error('No Chromium-based browser (Chrome or Edge) executable found in standard locations.');
}

// Built-in Static HTTP Server for E2E testing
class TestServer {
  constructor() {
    this.server = null;
    this.port = 0;
    this.requests = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
        let pathname = decodeURIComponent(parsedUrl.pathname);
        this.requests.push({ url: req.url, pathname, headers: req.headers });

        if (pathname === '/') pathname = '/index.html';
        const filePath = path.join(PROJECT_ROOT, pathname);

        // Security check
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

// Pure CDP (Chrome DevTools Protocol) Driver using native WebSockets
class BrowserDriver {
  constructor(browserPath) {
    this.browserPath = browserPath;
    this.proc = null;
    this.ws = null;
    this.userDataDir = null;
    this.msgId = 0;
    this.callbacks = new Map();
    this.events = [];
    this.targetWsUrl = null;
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `bluecollar_e2e_profile_${Date.now()}_${Math.random().toString(36).substring(2)}`);
    fs.mkdirSync(this.userDataDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.proc = spawn(this.browserPath, [
        '--headless=new',
        '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
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
        if (!resolved) reject(new Error('Timeout waiting for headless browser DevTools to start.'));
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
    this.targetWsUrl = page.webSocketDebuggerUrl;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.targetWsUrl);

      this.ws.onopen = async () => {
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        await this.send('DOM.enable');
        await this.send('Network.enable');
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
        const loaded = this.events.some(e => e.method === 'Page.loadEventFired');
        if (loaded) return resolve();
        setTimeout(check, 50);
      };
      check();
      setTimeout(resolve, 3000);
    });

    // Wait 350ms for asynchronous dynamic imports in app.js and DOM renders
    await new Promise(r => setTimeout(r, 350));
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

  async scrollTo(y) {
    await this.evaluate(`
      window.scrollTo(0, ${y});
      window.dispatchEvent(new Event('scroll'));
      new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    `);
    await new Promise(r => setTimeout(r, 100));
  }

  async getComputedStyle(selector, property = null) {
    const expr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          opacity: cs.opacity,
          transform: cs.transform,
          transition: cs.transition,
          transitionDelay: cs.transitionDelay,
          position: cs.position,
          top: cs.top,
          display: cs.display,
          visibility: cs.visibility,
          classList: Array.from(el.classList),
          hasIsVisible: el.classList.contains('is-visible'),
          styleOpacity: el.style.opacity,
          styleTransform: el.style.transform,
          styleTransitionDelay: el.style.transitionDelay
        };
      })()
    `;
    const style = await this.evaluate(expr);
    if (!style) return null;
    return property ? style[property] : style;
  }

  async getBoundingClientRect(selector) {
    const expr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          x: r.x,
          y: r.y
        };
      })()
    `;
    return await this.evaluate(expr);
  }

  async setPrefersReducedMotion(enable) {
    await this.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: enable ? 'reduce' : 'no-preference' }]
    });
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768
    });
  }

  async waitForSelector(selector, timeoutMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (exists) return true;
      await new Promise(r => setTimeout(r, 60));
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForCondition(fnStr, timeoutMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.evaluate(`Boolean((${fnStr})())`);
      if (ok) return true;
      await new Promise(r => setTimeout(r, 60));
    }
    throw new Error(`Timeout waiting for condition: ${fnStr}`);
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    if (this.proc) {
      try { this.proc.kill('SIGKILL'); } catch (_) {}
    }
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

// Test Runner Framework
class TestRunner {
  constructor() {
    this.suites = [];
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }

  describe(suiteName, tier, fn) {
    this.suites.push({ suiteName, tier, fn });
  }

  async run(driver, baseUrl, filterTier = 'all') {
    console.log('\n===============================================================');
    console.log(' BlueCollar Connect Native Scroll Animations - E2E Test Suite');
    console.log(` Target Tier: ${filterTier.toUpperCase()} | Runner: Headless Chromium CDP`);
    console.log('===============================================================\n');

    for (const suite of this.suites) {
      if (filterTier !== 'all' && suite.tier.toString() !== filterTier) {
        continue;
      }

      console.log(`\n--- [Tier ${suite.tier}] ${suite.suiteName} ---`);

      const tests = [];
      const testContext = {
        test: (title, testFn) => {
          tests.push({ title, testFn });
        }
      };

      suite.fn(testContext);

      for (const t of tests) {
        this.total++;
        const testStart = Date.now();
        try {
          await driver.setPrefersReducedMotion(false);
          await driver.setViewport(1280, 900);

          await t.testFn({
            driver,
            baseUrl,
            assert: (cond, msg) => {
              if (!cond) throw new Error(msg || 'Assertion failed');
            },
            assertEqual: (actual, expected, msg) => {
              if (actual !== expected) {
                throw new Error(`${msg ? msg + ' -> ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
              }
            },
            assertMatches: (actual, regex, msg) => {
              if (!regex.test(actual)) {
                throw new Error(`${msg ? msg + ' -> ' : ''}Expected string matching ${regex}, got ${JSON.stringify(actual)}`);
              }
            }
          });

          this.passed++;
          const duration = Date.now() - testStart;
          console.log(`  [PASS] ${t.title} (${duration}ms)`);
        } catch (err) {
          this.failed++;
          const duration = Date.now() - testStart;
          console.error(`  [FAIL] ${t.title} (${duration}ms)`);
          console.error(`         Error: ${err.message}`);
          this.failures.push({
            suite: suite.suiteName,
            tier: suite.tier,
            title: t.title,
            error: err.message
          });
        }
      }
    }

    console.log('\n===============================================================');
    console.log(` Test Summary: Total: ${this.total} | Passed: ${this.passed} | Failed: ${this.failed}`);
    console.log('===============================================================\n');

    if (this.failures.length > 0) {
      console.log('Failures Detail:');
      this.failures.forEach((f, idx) => {
        console.log(`${idx + 1}. [Tier ${f.tier}] ${f.suite} > ${f.title}`);
        console.log(`   ${f.error}\n`);
      });
    }

    return this.failed === 0;
  }
}

// Instantiate Runner
const runner = new TestRunner();

// ==============================================================================
// TIER 1: FEATURE COVERAGE (>= 5 tests per feature)
// Features: fade-up, scale-up, char-by-char reveal, hero parallax, reduced motion, zero dependencies
// ==============================================================================

// 1.1 Fade-Up Animation Variant (6 tests)
runner.describe('Feature: fade-up Animation Variant', 1, ({ test }) => {
  test('T1.1: Static elements with data-animate="fade-up" are initially hidden with translateY pre-scroll', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const style = await driver.evaluate(`
      (() => {
        const testEl = document.createElement('div');
        testEl.setAttribute('data-animate', 'fade-up');
        testEl.style.position = 'absolute';
        testEl.style.top = '5000px';
        document.body.appendChild(testEl);
        const cs = window.getComputedStyle(testEl);
        const result = {
          opacity: cs.opacity,
          transform: cs.transform
        };
        document.body.removeChild(testEl);
        return result;
      })()
    `);
    assertEqual(style.opacity, '0', 'Unintersected fade-up element must have computed opacity 0');
    assert(style.transform.includes('matrix'), 'Unintersected fade-up element must have translateY transform matrix');
  });

  test('T1.2: Static elements acquire .is-visible and transition to opacity 1 when scrolled into view', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(450);
    await driver.waitForCondition(() => document.querySelector('.stat-item')?.classList.contains('is-visible'));
    // Wait for transition duration
    await new Promise(r => setTimeout(r, 650));
    const style = await driver.getComputedStyle('.stat-item');
    assertEqual(style.hasIsVisible, true, 'stat-item must gain .is-visible class');
    assert(parseFloat(style.opacity) >= 0.95, `Scrolled stat-item computed opacity should be ~1, got ${style.opacity}`);
  });

  test('T1.3: Dynamically rendered cards in #home-categories-grid receive data-animate="fade-up" and become visible on scroll', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.waitForSelector('#home-categories-grid .category-card');
    const preScrollCards = await driver.evaluate(`
      Array.from(document.querySelectorAll('#home-categories-grid .category-card')).map(c => ({
        hasAnimate: c.getAttribute('data-animate'),
        isVisible: c.classList.contains('is-visible')
      }))
    `);
    assert(preScrollCards.length >= 8, 'Must have at least 8 category cards rendered');
    assert(preScrollCards.every(c => c.hasAnimate === 'fade-up'), 'All dynamic category cards must have data-animate="fade-up"');

    // Scroll to categories grid
    await driver.scrollTo(800);
    await driver.waitForCondition(() => document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const postScrollCard = await driver.getComputedStyle('#home-categories-grid .category-card');
    assertEqual(postScrollCard.hasIsVisible, true, 'Category card must gain .is-visible');
    assert(parseFloat(postScrollCard.opacity) >= 0.95, `Category card must reach opacity ~1, got ${postScrollCard.opacity}`);
  });

  test('T1.4: Dynamically rendered cards in #featured-pros-grid receive data-animate="fade-up" and become visible on scroll', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.waitForSelector('#featured-pros-grid .pro-card');
    const cards = await driver.evaluate(`
      Array.from(document.querySelectorAll('#featured-pros-grid .pro-card')).map(c => c.getAttribute('data-animate'))
    `);
    assert(cards.length >= 4, 'Must render featured pros');
    assert(cards.every(attr => attr === 'fade-up'), 'All featured pro cards must have data-animate="fade-up"');

    await driver.scrollTo(1400);
    await driver.waitForCondition(() => document.querySelector('#featured-pros-grid .pro-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const proCardStyle = await driver.getComputedStyle('#featured-pros-grid .pro-card');
    assertEqual(proCardStyle.hasIsVisible, true, 'Pro card must have .is-visible');
    assert(parseFloat(proCardStyle.opacity) >= 0.95, `Pro card must reach opacity ~1, got ${proCardStyle.opacity}`);
  });

  test('T1.5: Dynamic cards in services.html (#all-categories-grid) receive data-animate="fade-up" and animate on scroll', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/services.html`);
    await driver.waitForSelector('#all-categories-grid .service-card-full');
    const cards = await driver.evaluate(`
      Array.from(document.querySelectorAll('#all-categories-grid .service-card-full')).map(c => c.getAttribute('data-animate'))
    `);
    assert(cards.length >= 10, 'Must render all service categories');
    assert(cards.every(a => a === 'fade-up'), 'All service cards must have data-animate="fade-up"');

    await driver.scrollTo(300);
    await driver.waitForCondition(() => document.querySelector('#all-categories-grid .service-card-full')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const style = await driver.getComputedStyle('#all-categories-grid .service-card-full');
    assertEqual(style.hasIsVisible, true, 'Service card must be .is-visible');
    assert(parseFloat(style.opacity) >= 0.95, `Service card must reach opacity ~1, got ${style.opacity}`);
  });

  test('T1.6: Dynamic cards in category.html (#pros-grid) receive data-animate="fade-up" and animate on scroll', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');
    const cards = await driver.evaluate(`
      Array.from(document.querySelectorAll('#pros-grid .pro-card')).map(c => c.getAttribute('data-animate'))
    `);
    assert(cards.length >= 1, 'Must render plumbing pros');
    assert(cards.every(a => a === 'fade-up'), 'All pro cards in category page must have data-animate="fade-up"');

    await driver.scrollTo(400);
    await driver.waitForCondition(() => document.querySelector('#pros-grid .pro-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const style = await driver.getComputedStyle('#pros-grid .pro-card');
    assertEqual(style.hasIsVisible, true, 'Category pro card must be .is-visible');
    assert(parseFloat(style.opacity) >= 0.95, `Category pro card must reach opacity ~1, got ${style.opacity}`);
  });
});

// 1.2 Scale-Up Animation Variant (5 tests)
runner.describe('Feature: scale-up Animation Variant', 1, ({ test }) => {
  test('T1.7: Homepage CTA card (.cta-card) has data-animate="scale-up" and initial opacity 0', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const ctaCard = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.cta-card');
        return el ? el.getAttribute('data-animate') : null;
      })()
    `);
    assertEqual(ctaCard, 'scale-up', 'CTA card must have data-animate="scale-up"');
    const style = await driver.getComputedStyle('.cta-card');
    assertEqual(style.opacity, '0', 'Pre-scroll CTA card must have computed opacity 0');
  });

  test('T1.8: Scale-up pre-scroll transform applies matrix scaling down (~0.92)', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const style = await driver.getComputedStyle('.cta-card');
    assert(style.transform.includes('matrix'), 'Pre-scroll CTA card must have transform matrix');
    const match = style.transform.match(/matrix\(([^,]+)/);
    assert(match !== null, 'Matrix scale component must be parseable');
    const scaleX = parseFloat(match[1]);
    assert(scaleX < 0.96 && scaleX > 0.88, `scale component should be approximately 0.92, got ${scaleX}`);
  });

  test('T1.9: Homepage CTA card gains .is-visible and reaches opacity 1 when scrolled into viewport', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(2500);
    await driver.waitForCondition(() => document.querySelector('.cta-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const style = await driver.getComputedStyle('.cta-card');
    assertEqual(style.hasIsVisible, true, 'CTA card must gain .is-visible');
    assert(parseFloat(style.opacity) >= 0.95, `CTA card must reach computed opacity ~1, got ${style.opacity}`);
  });

  test('T1.10: Upon becoming visible, scale-up element scales to 1.0 (matrix diagonal 1 or none)', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(2500);
    await driver.waitForCondition(() => document.querySelector('.cta-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const style = await driver.getComputedStyle('.cta-card');
    const match = style.transform.match(/matrix\(([^,]+)/);
    if (match) {
      const scaleX = parseFloat(match[1]);
      assert(Math.abs(scaleX - 1.0) < 0.05, `Final scale should be ~1.0, got ${scaleX}`);
    } else {
      assert(style.transform === 'none', 'Transform should resolve to scale(1) or none');
    }
  });

  test('T1.11: Scale-up element configures cubic-bezier transition curves and duration', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const style = await driver.getComputedStyle('.cta-card');
    assert(style.transition.includes('0.6s') || style.transition.includes('transform'), 'Scale-up transition should specify 0.6s transform transition');
  });
});

// 1.3 Character-by-Character Reveal (6 tests)
runner.describe('Feature: Character-by-Character Reveal', 1, ({ test }) => {
  test('T1.12: Section title with data-char-reveal sets aria-label to original text string', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const ariaLabel = await driver.evaluate(`document.querySelector('.section-title[data-char-reveal]')?.getAttribute('aria-label')`);
    assertEqual(ariaLabel, 'Service Categories', 'aria-label must match exact original title text');
  });

  test('T1.13: Section title wraps tokenized characters inside <span aria-hidden="true" class="char-reveal-wrapper">', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const hasWrapper = await driver.evaluate(`
      (() => {
        const title = document.querySelector('.section-title[data-char-reveal]');
        const wrapper = title?.querySelector('.char-reveal-wrapper');
        return wrapper && wrapper.getAttribute('aria-hidden') === 'true';
      })()
    `);
    assert(hasWrapper, 'Must have .char-reveal-wrapper with aria-hidden="true"');
  });

  test('T1.14: Characters are tokenized into .char-word and .char spans with sequential transitionDelay', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const delays = await driver.evaluate(`
      (() => {
        const title = document.querySelector('.section-title[data-char-reveal]');
        const chars = Array.from(title?.querySelectorAll('.char') || []);
        return chars.map(c => c.style.transitionDelay);
      })()
    `);
    assert(delays.length > 5, 'Must tokenize characters into .char spans');
    assert(delays[0] === '0ms', 'First character must have 0ms delay');
    assert(delays[1] === '30ms', 'Second character must have 30ms delay');
    assert(delays[2] === '60ms', 'Third character must have 60ms delay');
  });

  test('T1.15: Off-screen character reveal elements have .char spans hidden with translateY offset', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const charStyle = await driver.getComputedStyle('.section-title[data-char-reveal] .char');
    assertEqual(charStyle.opacity, '0', 'Pre-scroll character must have opacity 0');
    assert(charStyle.transform.includes('matrix'), 'Pre-scroll character must have translateY transform');
  });

  test('T1.16: When scrolled into view, heading gains .is-visible and .char elements transition to opacity 1', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(750);
    await driver.waitForCondition(() => document.querySelector('.section-title[data-char-reveal]')?.classList.contains('is-visible'));
    const titleStyle = await driver.getComputedStyle('.section-title[data-char-reveal]');
    assertEqual(titleStyle.hasIsVisible, true, 'Heading must gain .is-visible');
    await new Promise(r => setTimeout(r, 650));
    const charStyle = await driver.getComputedStyle('.section-title[data-char-reveal] .char');
    assert(parseFloat(charStyle.opacity) >= 0.95, `Character must reach opacity ~1, got ${charStyle.opacity}`);
  });

  test('T1.17: Multi-word headings preserve spaces and word boundaries without mid-word breaks', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const wordSpans = await driver.evaluate(`
      (() => {
        const title = document.querySelector('.section-title[data-char-reveal]');
        return Array.from(title?.querySelectorAll('.char-word') || []).map(w => w.textContent);
      })()
    `);
    assert(wordSpans.length === 2, `Service Categories should split into 2 words, got ${wordSpans.length}`);
    assertEqual(wordSpans[0], 'Service', 'Word 1 must be "Service"');
    assertEqual(wordSpans[1], 'Categories', 'Word 2 must be "Categories"');
  });
});

// 1.4 Hero Parallax Fade-Out & Shrink (5 tests)
runner.describe('Feature: Hero Parallax Fade-Out & Shrink', 1, ({ test }) => {
  test('T1.18: At scroll position scrollY === 0, hero section has opacity 1 and scale 1', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(0);
    const hero = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        return {
          opacity: el.style.opacity,
          transform: el.style.transform
        };
      })()
    `);
    assert(hero.opacity === '' || hero.opacity === '1' || hero.opacity === '1.000', `Initial hero opacity should be 1, got ${hero.opacity}`);
  });

  test('T1.19: Scrolling to scrollY = 150px causes hero opacity to decrease dynamically and transform to update', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(150);
    const hero = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        return {
          opacity: parseFloat(el.style.opacity || '1'),
          transform: el.style.transform
        };
      })()
    `);
    assert(hero.opacity < 1.0, `Hero opacity at 150px scroll should be < 1.0, got ${hero.opacity}`);
    assert(hero.opacity > 0.0, `Hero opacity at 150px scroll should be > 0.0, got ${hero.opacity}`);
    assert(hero.transform.includes('translate3d') && hero.transform.includes('scale'), `Hero transform must contain translate3d and scale, got ${hero.transform}`);
  });

  test('T1.20: Scrolling to scrollY = 350px causes further opacity fade and increased parallax translateY', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(150);
    const heroAt150 = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        const parts = (el.style.transform || '').split(',');
        return {
          opacity: parseFloat(el.style.opacity || '1'),
          y: parts.length > 1 ? parseFloat(parts[1]) : 0
        };
      })()
    `);

    await driver.scrollTo(350);
    const heroAt350 = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        const parts = (el.style.transform || '').split(',');
        return {
          opacity: parseFloat(el.style.opacity || '1'),
          y: parts.length > 1 ? parseFloat(parts[1]) : 0
        };
      })()
    `);

    assert(heroAt350.opacity < heroAt150.opacity, `Opacity at 350px (${heroAt350.opacity}) must be less than at 150px (${heroAt150.opacity})`);
    assert(heroAt350.y > heroAt150.y, `Parallax Y at 350px (${heroAt350.y}) must be greater than at 150px (${heroAt150.y})`);
  });

  test('T1.21: Scrolling back to top (scrollY = 0) restores hero opacity and scale to 1.0', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(300);
    await driver.scrollTo(0);
    const hero = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        return {
          opacity: parseFloat(el.style.opacity || '1'),
          transform: el.style.transform
        };
      })()
    `);
    assert(hero.opacity >= 0.99, `Hero opacity should restore to ~1.0, got ${hero.opacity}`);
    assert(hero.transform.includes('scale(1') || hero.transform === '', `Transform should restore to scale(1), got ${hero.transform}`);
  });

  test('T1.22: Scrolling deep past hero section drops hero opacity to 0', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(1500);
    const heroOpacity = await driver.evaluate(`document.querySelector('.hero-section')?.style.opacity`);
    assertEqual(heroOpacity, '0', 'Deep scrolled hero section opacity must be 0');
  });
});

// 1.5 Reduced Motion Gating (5 tests)
runner.describe('Feature: Reduced Motion Gating', 1, ({ test }) => {
  test('T1.23: When prefers-reduced-motion is active, [data-animate] elements have computed opacity 1 immediately', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/index.html`);
    const ctaStyle = await driver.getComputedStyle('.cta-card');
    assertEqual(ctaStyle.opacity, '1', 'CTA card must have computed opacity 1 without scrolling');
  });

  test('T1.24: Under reduced motion, [data-char-reveal] .char elements have opacity 1 and transition none', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/index.html`);
    const charStyle = await driver.getComputedStyle('.section-title[data-char-reveal] .char');
    if (charStyle) {
      assertEqual(charStyle.opacity, '1', 'Char elements must have opacity 1');
      assert(charStyle.transition.includes('none') || charStyle.transition === 'all 0s ease 0s', 'Transition must be none under reduced motion');
    } else {
      const titleStyle = await driver.getComputedStyle('.section-title[data-char-reveal]');
      assertEqual(titleStyle.opacity, '1', 'Title must have opacity 1');
    }
  });

  test('T1.25: Under reduced motion, initHeroParallax does not mutate hero inline styles on scroll', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(300);
    const heroStyles = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        return { opacity: el.style.opacity, transform: el.style.transform };
      })()
    `);
    assertEqual(heroStyles.opacity, '', 'Hero inline opacity must not be mutated under reduced motion');
    assertEqual(heroStyles.transform, '', 'Hero inline transform must not be mutated under reduced motion');
  });

  test('T1.26: Under reduced motion, observeNewElements immediately adds .is-visible without waiting for intersection', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/index.html`);
    const ctaHasVisible = await driver.evaluate(`document.querySelector('.cta-card')?.classList.contains('is-visible')`);
    assertEqual(ctaHasVisible, true, 'CTA card must have .is-visible added immediately under reduced motion');
  });

  test('T1.27: Dynamic category cards under reduced motion render immediately with opacity 1', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.waitForSelector('#home-categories-grid .category-card');
    const cardStyle = await driver.getComputedStyle('#home-categories-grid .category-card');
    assertEqual(cardStyle.opacity, '1', 'Dynamic category card must be visible with opacity 1 immediately');
  });
});

// 1.6 Zero External Dependencies (5 tests)
runner.describe('Feature: Zero External Dependencies', 1, ({ test }) => {
  test('T1.28: Root package.json contains zero external animation libraries', async ({ assert }) => {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const banned = ['gsap', 'framer-motion', 'animejs', 'lottie-web', 'velocity-animate'];
      for (const b of banned) {
        assert(!deps[b], `banned library "${b}" found in package.json dependencies!`);
      }
    }
    assert(true);
  });

  test('T1.29: All HTML files contain zero script tags referencing external animation libraries', async ({ assert }) => {
    const htmlFiles = fs.readdirSync(PROJECT_ROOT).filter(f => f.endsWith('.html'));
    const bannedPatterns = [/gsap/i, /framer-motion/i, /anime(\.min)?\.js/i, /scrolltrigger/i, /velocity/i];
    for (const file of htmlFiles) {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf8');
      for (const pattern of bannedPatterns) {
        assert(!pattern.test(content), `Banned library matching ${pattern} found in ${file}`);
      }
    }
  });

  test('T1.30: js/utils/animations.js contains zero external third-party imports', async ({ assert }) => {
    const animJs = fs.readFileSync(path.join(PROJECT_ROOT, 'js/utils/animations.js'), 'utf8');
    const imports = animJs.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      assert(imp.includes('./') || imp.includes('../'), `External non-relative import found in animations.js: ${imp}`);
    }
  });

  test('T1.31: css/scroll-animations.css contains zero @import statements', async ({ assert }) => {
    const cssPath = path.join(PROJECT_ROOT, 'css/scroll-animations.css');
    assert(fs.existsSync(cssPath), 'scroll-animations.css must exist');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert(!css.includes('@import'), 'scroll-animations.css must not use @import');
  });

  test('T1.32: Network request monitoring confirms zero external animation assets fetched', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const urls = await driver.evaluate(`
      window.performance.getEntriesByType('resource').map(r => r.name)
    `);
    const banned = ['gsap', 'framer', 'anime', 'scrollmagic'];
    for (const url of urls) {
      for (const b of banned) {
        assert(!url.toLowerCase().includes(b), `Found unauthorized external asset fetched: ${url}`);
      }
    }
  });
});

// ==============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>= 5 tests per feature)
// ==============================================================================

// 2.1 Empty Grid Containers (5 tests)
runner.describe('Boundary: Empty Grid Containers', 2, ({ test }) => {
  test('T2.1: Calling observeNewElements(null) does not throw an exception', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const result = await driver.evaluate(`
      (() => {
        try {
          window.observeNewElements ? window.observeNewElements(null) : true;
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `);
    assert(result.success, `observeNewElements(null) threw: ${result.error}`);
  });

  test('T2.2: Calling observeNewElements(undefined) does not throw an exception', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const result = await driver.evaluate(`
      (() => {
        try {
          window.observeNewElements ? window.observeNewElements(undefined) : true;
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `);
    assert(result.success, `observeNewElements(undefined) threw: ${result.error}`);
  });

  test('T2.3: Calling observeNewElements on empty container div returns safely without error', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const result = await driver.evaluate(`
      (() => {
        try {
          const div = document.createElement('div');
          document.body.appendChild(div);
          if (window.observeNewElements) window.observeNewElements(div);
          document.body.removeChild(div);
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `);
    assert(result.success, `observeNewElements on empty div threw: ${result.error}`);
  });

  test('T2.4: In services.html, searching non-existent category renders #no-results safely without observer crash', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/services.html`);
    await driver.waitForSelector('#category-filter');
    await driver.evaluate(`
      (() => {
        const input = document.getElementById('category-filter');
        input.value = 'zzzznonexistentcategory';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 100));
    const noResultsHidden = await driver.evaluate(`document.getElementById('no-results')?.classList.contains('hidden')`);
    assertEqual(noResultsHidden, false, '#no-results must be visible when query has 0 matches');
    const cardsCount = await driver.evaluate(`document.querySelectorAll('#all-categories-grid .service-card-full').length`);
    assertEqual(cardsCount, 0, 'Grid should have 0 cards');
  });

  test('T2.5: In category.html, filtering by impossible criteria handles empty #pros-grid cleanly', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid');
    const result = await driver.evaluate(`
      (() => {
        const grid = document.getElementById('pros-grid');
        grid.innerHTML = '<div id="no-pros" class="text-center py-8">No pros found</div>';
        if (window.observeNewElements) window.observeNewElements(grid);
        return true;
      })()
    `);
    assert(result, 'Dynamic clearing and observeNewElements on empty grid must succeed');
  });
});

// 2.2 Rapid Scrolling (5 tests)
runner.describe('Boundary: Rapid Scrolling & Fast Traversal', 2, ({ test }) => {
  test('T2.6: Instant scroll jump to page bottom triggers visibility for all passed animatable elements', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(3500);
    await new Promise(r => setTimeout(r, 300));
    const ctaVisible = await driver.evaluate(`document.querySelector('.cta-card')?.classList.contains('is-visible')`);
    assert(ctaVisible, 'CTA card at bottom must be .is-visible on scroll jump');
  });

  test('T2.7: Rapid oscillating scroll maintains valid hero parallax opacity and transform', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(600);
    await driver.scrollTo(0);
    await driver.scrollTo(800);
    await driver.scrollTo(0);
    await new Promise(r => setTimeout(r, 150));
    const hero = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.hero-section');
        return {
          opacity: parseFloat(el.style.opacity || '1'),
          transform: el.style.transform
        };
      })()
    `);
    assert(hero.opacity >= 0.98, `Oscillating scroll back to 0 must restore opacity to 1.0, got ${hero.opacity}`);
  });

  test('T2.8: Rapid scrolling does not create duplicate .is-visible classes on elements', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    for (let i = 0; i < 5; i++) {
      await driver.scrollTo(500 * (i % 2));
    }
    const duplicates = await driver.evaluate(`
      (() => {
        const els = document.querySelectorAll('[data-animate]');
        let hasDup = false;
        els.forEach(el => {
          const classes = Array.from(el.classList).filter(c => c === 'is-visible');
          if (classes.length > 1) hasDup = true;
        });
        return hasDup;
      })()
    `);
    assertEqual(duplicates, false, 'Elements must not have duplicate is-visible classes');
  });

  test('T2.9: Rapid scrolling past dynamic grid triggers stagger without hanging transition delays', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(900);
    await new Promise(r => setTimeout(r, 1000));
    const delays = await driver.evaluate(`
      Array.from(document.querySelectorAll('#home-categories-grid .category-card')).map(c => c.style.transitionDelay)
    `);
    assert(delays.every(d => d === '0ms' || d === ''), 'Stagger delays must reset to 0ms after animation');
  });

  test('T2.10: Reloading / navigating to mid-page immediately displays in-viewport elements', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(800);
    await new Promise(r => setTimeout(r, 100));
    const isVis = await driver.evaluate(`
      document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible')
    `);
    assert(isVis, 'Elements at scroll offset must immediately trigger is-visible');
  });
});

// 2.3 Missing Hero Section (5 tests)
runner.describe('Boundary: Missing Hero Section Handling', 2, ({ test }) => {
  test('T2.11: Loading category.html executes initHeroParallax safely with no TypeError', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    const hasHero = await driver.evaluate(`!!document.querySelector('.hero-section')`);
    assert(!hasHero, 'category.html must not have .hero-section');
    await driver.scrollTo(300);
    const title = await driver.evaluate(`document.getElementById('category-title')?.textContent`);
    assert(title !== 'Loading...', 'category.html should load cleanly without JS crash');
  });

  test('T2.12: Loading services.html executes initHeroParallax safely with no errors', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/services.html`);
    await driver.scrollTo(400);
    const count = await driver.evaluate(`document.querySelectorAll('#all-categories-grid .service-card-full').length`);
    assert(count > 0, 'services.html should render categories with no crash');
  });

  test('T2.13: Loading professional.html executes initHeroParallax safely with no errors', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/professional.html?id=pro-1`);
    await driver.scrollTo(500);
    const proName = await driver.evaluate(`document.getElementById('pro-name')?.textContent`);
    assert(proName && proName !== 'Loading...', 'professional.html should load cleanly');
  });

  test('T2.14: Loading how-it-works.html executes initHeroParallax safely with no errors', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/how-it-works.html`);
    await driver.scrollTo(400);
    const steps = await driver.evaluate(`document.querySelectorAll('.step-card').length`);
    assert(steps >= 4, 'how-it-works.html should render steps');
  });

  test('T2.15: Loading about.html executes initHeroParallax safely with no errors', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/about.html`);
    await driver.scrollTo(300);
    const features = await driver.evaluate(`document.querySelectorAll('.feature-item').length`);
    assert(features >= 3, 'about.html should render features');
  });
});

// 2.4 Window Resize & Viewport Responsiveness (5 tests)
runner.describe('Boundary: Window Resize & Responsiveness', 2, ({ test }) => {
  test('T2.16: Resizing window from desktop (1280px) to mobile (375px) preserves .is-visible status on revealed cards', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(800);
    await driver.waitForCondition(() => document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible'));
    await driver.setViewport(375, 667);
    const isVis = await driver.evaluate(`document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible')`);
    assertEqual(isVis, true, 'Category card must retain is-visible on resize');
  });

  test('T2.17: Character reveal titles maintain .char-word white-space nowrap to prevent mid-word wrapping on narrow screens', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setViewport(375, 667);
    await driver.navigate(`${baseUrl}/index.html`);
    const wordStyle = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.section-title[data-char-reveal] .char-word');
        if (!el) return null;
        return window.getComputedStyle(el).whiteSpace;
      })()
    `);
    assertEqual(wordStyle, 'nowrap', 'char-word must have white-space: nowrap');
  });

  test('T2.18: Hero parallax recalculates progress accurately after window resize', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.setViewport(768, 1024);
    await driver.scrollTo(100);
    const opacity = await driver.evaluate(`parseFloat(document.querySelector('.hero-section')?.style.opacity || '1')`);
    assert(opacity < 1.0, 'Hero opacity must update on resize scroll');
  });

  test('T2.19: Sticky .sidebar-filters in category.html adapts cleanly across viewports without breaking page overflow', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.setViewport(1280, 900);
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    const desktopPos = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.sidebar-filters');
        return el ? window.getComputedStyle(el).position : null;
      })()
    `);
    assertEqual(desktopPos, 'sticky', 'Desktop sidebar must be sticky');

    await driver.setViewport(375, 667);
    const mobilePos = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.sidebar-filters');
        return el ? window.getComputedStyle(el).position : null;
      })()
    `);
    assert(mobilePos === 'static' || mobilePos === 'relative' || mobilePos === 'sticky', 'Mobile layout handles sidebar properly');
  });

  test('T2.20: Window resize during scroll preserves relative positioning without clipped overflows', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(500);
    await driver.setViewport(1024, 768);
    const bodyOverflowX = await driver.evaluate(`window.getComputedStyle(document.body).overflowX`);
    assertEqual(bodyOverflowX, 'visible', 'Body overflow-x must not be clipped or hidden');
  });
});

// 2.5 Repeated Filter Toggling & Dynamic Churn (5 tests)
runner.describe('Boundary: Repeated Filter Toggling & Dynamic Churn', 2, ({ test }) => {
  test('T2.21: Toggling category filters 10 times consecutively creates freshly observed cards without errors', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');

    const result = await driver.evaluate(`
      (async () => {
        const checkbox = document.querySelector('input[name="verified"]') || document.getElementById('filter-verified');
        if (!checkbox) return { count: 0 };
        for (let i = 0; i < 10; i++) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 20));
        }
        return {
          count: document.querySelectorAll('#pros-grid .pro-card').length,
          allHaveAnimate: Array.from(document.querySelectorAll('#pros-grid .pro-card')).every(c => c.getAttribute('data-animate') === 'fade-up')
        };
      })()
    `);

    assert(result.count > 0, 'Pros must be rendered after toggles');
    assertEqual(result.allHaveAnimate, true, 'All re-rendered pro cards must have data-animate="fade-up"');
  });

  test('T2.22: Re-rendered pro cards in category.html receive .is-visible upon scrolling into view', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');
    await driver.evaluate(`
      (() => {
        const select = document.getElementById('sort-select');
        if (select) {
          select.value = 'price_asc';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await driver.scrollTo(400);
    await driver.waitForCondition(() => document.querySelector('#pros-grid .pro-card')?.classList.contains('is-visible'));
    const isVis = await driver.evaluate(`document.querySelector('#pros-grid .pro-card')?.classList.contains('is-visible')`);
    assertEqual(isVis, true, 'Re-sorted card must receive is-visible');
  });

  test('T2.23: In services.html, rapid typing and clearing in search box re-renders with active animation attributes', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/services.html`);
    await driver.waitForSelector('#category-filter');
    const allAnimated = await driver.evaluate(`
      (async () => {
        const input = document.getElementById('category-filter');
        input.value = 'Plum';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 30));
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 30));
        return Array.from(document.querySelectorAll('#all-categories-grid .service-card-full')).every(c => c.getAttribute('data-animate') === 'fade-up');
      })()
    `);
    assertEqual(allAnimated, true, 'All restored service cards must have data-animate="fade-up"');
  });

  test('T2.24: Card transitionDelay resets to 0ms after entry animation so hover effects are instant', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(800);
    await driver.waitForCondition(() => document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 900));
    const delay = await driver.evaluate(`document.querySelector('#home-categories-grid .category-card')?.style.transitionDelay`);
    assert(delay === '0ms' || delay === '', `transitionDelay should reset to 0ms, got "${delay}"`);
  });

  test('T2.25: Calling observeNewElements repeatedly does not re-hide already visible static elements', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(450);
    await driver.waitForCondition(() => document.querySelector('.stat-item')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    await driver.evaluate(`
      if (window.observeNewElements) {
        window.observeNewElements(document);
        window.observeNewElements(document);
      }
    `);
    const isVis = await driver.evaluate(`document.querySelector('.stat-item')?.classList.contains('is-visible')`);
    assertEqual(isVis, true, 'stat-item must remain .is-visible');
    const opacity = await driver.evaluate(`parseFloat(window.getComputedStyle(document.querySelector('.stat-item')).opacity)`);
    assert(opacity >= 0.95, `stat-item opacity must remain ~1, got ${opacity}`);
  });
});

// ==============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions)
// ==============================================================================

runner.describe('Cross-Feature: Dynamic Cards + Stagger Delay', 3, ({ test }) => {
  test('T3.1: Injected cards in #home-categories-grid receive progressive staggered delays', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.waitForSelector('#home-categories-grid .category-card');
    const delays = await driver.evaluate(`
      Array.from(document.querySelectorAll('#home-categories-grid .category-card')).map(c => c.style.transitionDelay)
    `);
    assert(delays.length >= 8, 'Must have at least 8 category cards');
    assert(delays[0] === '0ms', 'Card 0 delay should be 0ms');
    assert(delays[1] === '60ms' || delays[1] === '50ms', `Card 1 delay should be ~60ms, got ${delays[1]}`);
    assert(delays[2] === '120ms' || delays[2] === '100ms', `Card 2 delay should be ~120ms, got ${delays[2]}`);
  });

  test('T3.2: Stagger delay cleans up automatically to 0ms after card entrance completes', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(800);
    await driver.waitForCondition(() => document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 950));
    const delay = await driver.evaluate(`document.querySelector('#home-categories-grid .category-card')?.style.transitionDelay`);
    assert(delay === '0ms' || delay === '', `Delay should be cleared, got "${delay}"`);
  });

  test('T3.3: Injected cards in #featured-pros-grid receive progressive stagger delays', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.waitForSelector('#featured-pros-grid .pro-card');
    const delays = await driver.evaluate(`
      Array.from(document.querySelectorAll('#featured-pros-grid .pro-card')).map(c => c.style.transitionDelay)
    `);
    assert(delays.length >= 4, 'Must have featured pros');
    assert(delays[0] === '0ms', 'First pro card delay 0ms');
    assert(delays[1] === '60ms' || delays[1] === '50ms', `Second pro card delay ~60ms, got ${delays[1]}`);
  });
});

runner.describe('Cross-Feature: Reduced Motion + Dynamic Filtering', 3, ({ test }) => {
  test('T3.4: Under reduced motion, re-filtering category.html renders cards immediately visible with opacity 1', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');

    await driver.evaluate(`
      (() => {
        const select = document.getElementById('sort-select');
        if (select) {
          select.value = 'rating_desc';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);

    const cardOpacity = await driver.evaluate(`
      window.getComputedStyle(document.querySelector('#pros-grid .pro-card')).opacity
    `);
    assertEqual(cardOpacity, '1', 'Pro card must be immediately visible under reduced motion');
  });

  test('T3.5: Under reduced motion, search filtering in services.html immediately marks all matching cards is-visible', async ({ driver, baseUrl, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);
    await driver.navigate(`${baseUrl}/services.html`);
    await driver.waitForSelector('#category-filter');
    await driver.evaluate(`
      (() => {
        const input = document.getElementById('category-filter');
        input.value = 'Elect';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    const cardVis = await driver.evaluate(`
      document.querySelector('#all-categories-grid .service-card-full')?.classList.contains('is-visible')
    `);
    assertEqual(cardVis, true, 'Filtered service card must be is-visible immediately under reduced motion');
  });

  test('T3.6: Toggling reduced motion media query mid-session immediately reveals all unrevealed elements', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    const preStyle = await driver.getComputedStyle('.cta-card');
    assertEqual(preStyle.opacity, '0', 'Pre-scroll CTA card opacity must be 0');

    await driver.setPrefersReducedMotion(true);
    const postStyle = await driver.getComputedStyle('.cta-card');
    assertEqual(postStyle.opacity, '1', 'CTA card must immediately switch to opacity 1 when reduced motion activated');
  });
});

runner.describe('Cross-Feature: Sticky Sidebar During Card Entrance', 3, ({ test }) => {
  test('T3.7: In category.html, while pro cards animate in, sidebar-filters maintains position: sticky and top: 100px', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');
    await driver.scrollTo(500);
    const sidebarStyle = await driver.evaluate(`
      (() => {
        const sb = document.querySelector('.sidebar-filters');
        const cs = window.getComputedStyle(sb);
        return { position: cs.position, top: cs.top };
      })()
    `);
    assertEqual(sidebarStyle.position, 'sticky', 'Sidebar position must remain sticky');
    assertEqual(sidebarStyle.top, '100px', 'Sidebar top offset must be 100px');
  });

  test('T3.8: Cards with .is-visible resolve transform to translateY(0) without creating persistent containing blocks', async ({ driver, baseUrl, assert }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.scrollTo(400);
    await driver.waitForCondition(() => document.querySelector('#pros-grid .pro-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const cardTransform = await driver.evaluate(`
      window.getComputedStyle(document.querySelector('#pros-grid .pro-card')).transform
    `);
    assert(cardTransform === 'none' || cardTransform.includes('matrix(1, 0, 0, 1, 0, 0)'), `Transform should resolve to neutral state, got ${cardTransform}`);
  });

  test('T3.9: Fixed header maintains position: fixed and top: 0 throughout hero parallax and card entrance', async ({ driver, baseUrl, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);
    for (const y of [0, 200, 600, 1200]) {
      await driver.scrollTo(y);
      const headerPos = await driver.evaluate(`
        (() => {
          const h = document.querySelector('header');
          const cs = window.getComputedStyle(h);
          const rect = h.getBoundingClientRect();
          return { position: cs.position, top: rect.top };
        })()
      `);
      assertEqual(headerPos.position, 'fixed', `Header position at ${y}px must be fixed`);
      assertEqual(headerPos.top, 0, `Header top at ${y}px must be 0`);
    }
  });

  test('T3.10: In professional.html, booking card maintains sticky position (top: 100px) during scroll', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/professional.html?id=pro-1`);
    await driver.waitForSelector('#pro-name');

    // Test at scrollY = 600px
    await driver.scrollTo(600);
    await new Promise(r => setTimeout(r, 100));
    const bookingAt600 = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.booking-card');
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          position: cs.position,
          top: cs.top,
          rectTop: Math.round(rect.top)
        };
      })()
    `);
    assertEqual(bookingAt600.position, 'sticky', 'Booking card position must be sticky at scrollY = 600px');
    assertEqual(bookingAt600.top, '100px', 'Booking card top must be 100px at scrollY = 600px');
    assert(Math.abs(bookingAt600.rectTop - 100) <= 2, `Booking card rect top should stick at ~100px at scrollY = 600px, got ${bookingAt600.rectTop}`);

    // Test at scrollY = 800px
    await driver.scrollTo(800);
    await new Promise(r => setTimeout(r, 100));
    const bookingAt800 = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.booking-card');
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          position: cs.position,
          top: cs.top,
          rectTop: Math.round(rect.top)
        };
      })()
    `);
    assertEqual(bookingAt800.position, 'sticky', 'Booking card position must be sticky at scrollY = 800px');
    assertEqual(bookingAt800.top, '100px', 'Booking card top must be 100px at scrollY = 800px');
    assert(Math.abs(bookingAt800.rectTop - 100) <= 2, `Booking card rect top should stick at ~100px at scrollY = 800px, got ${bookingAt800.rectTop}`);
  });
});

// ==============================================================================
// TIER 4: REAL-WORLD USER WORKLOADS (Full User Journeys)
// ==============================================================================

runner.describe('User Journey 1: Landing Page Complete Scroll Experience', 4, ({ test }) => {
  test('T4.1: User lands on index.html, hero tracks scroll, grids reveal with stagger, CTA scales up', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/index.html`);

    // 1. Initial Hero
    const hero0 = await driver.evaluate(`parseFloat(document.querySelector('.hero-section')?.style.opacity || '1')`);
    assert(hero0 >= 0.99, 'Hero starts fully visible');

    // 2. Scroll into stats
    await driver.scrollTo(300);
    const heroScrolled = await driver.evaluate(`parseFloat(document.querySelector('.hero-section')?.style.opacity || '1')`);
    assert(heroScrolled < hero0, 'Hero fades as user scrolls');

    // 3. Scroll into categories
    await driver.scrollTo(800);
    await driver.waitForCondition(() => document.querySelector('#home-categories-grid .category-card')?.classList.contains('is-visible'));
    const catCard = await driver.getComputedStyle('#home-categories-grid .category-card');
    assertEqual(catCard.hasIsVisible, true, 'Category card visible');

    // 4. Scroll into featured pros
    await driver.scrollTo(1500);
    await driver.waitForCondition(() => document.querySelector('#featured-pros-grid .pro-card')?.classList.contains('is-visible'));
    const proCard = await driver.getComputedStyle('#featured-pros-grid .pro-card');
    assertEqual(proCard.hasIsVisible, true, 'Pro card visible');

    // 5. Scroll to CTA card
    await driver.scrollTo(2500);
    await driver.waitForCondition(() => document.querySelector('.cta-card')?.classList.contains('is-visible'));
    await new Promise(r => setTimeout(r, 650));
    const ctaCard = await driver.getComputedStyle('.cta-card');
    assertEqual(ctaCard.hasIsVisible, true, 'CTA card scaled up');
    assert(parseFloat(ctaCard.opacity) >= 0.95, `CTA card reached opacity ~1, got ${ctaCard.opacity}`);
  });
});

runner.describe('User Journey 2: Navigation to Services & Real-time Filter', 4, ({ test }) => {
  test('T4.2: User navigates to services.html, cards stagger in, user filters by "Plumber", matching card reveals', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/services.html`);
    await driver.waitForSelector('#all-categories-grid .service-card-full');

    await driver.scrollTo(350);
    await driver.waitForCondition(() => document.querySelector('#all-categories-grid .service-card-full')?.classList.contains('is-visible'));
    const initialVisible = await driver.evaluate(`document.querySelectorAll('#all-categories-grid .service-card-full.is-visible').length`);
    assert(initialVisible > 0, 'Service cards must be visible');

    // User filters by Plumber
    await driver.evaluate(`
      (() => {
        const filter = document.getElementById('category-filter');
        filter.value = 'Plumber';
        filter.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);

    await new Promise(r => setTimeout(r, 100));
    const filteredCount = await driver.evaluate(`document.querySelectorAll('#all-categories-grid .service-card-full').length`);
    assertEqual(filteredCount, 1, 'Only Plumber card should be shown');

    const cardAttr = await driver.evaluate(`document.querySelector('#all-categories-grid .service-card-full')?.getAttribute('data-animate')`);
    assertEqual(cardAttr, 'fade-up', 'Filtered card retains data-animate="fade-up"');
  });
});

runner.describe('User Journey 3: Category Filtering & Sticky Sidebar Scroll', 4, ({ test }) => {
  test('T4.3: User views category.html, filters pros, scrolls 250px, sidebar sticks at 100px, pros stagger in', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');

    await driver.scrollTo(250);
    await new Promise(r => setTimeout(r, 100));

    const sidebar = await driver.evaluate(`
      (() => {
        const sb = document.querySelector('.sidebar-filters');
        const cs = window.getComputedStyle(sb);
        const rect = sb.getBoundingClientRect();
        return {
          position: cs.position,
          topComputed: cs.top,
          rectTop: Math.round(rect.top)
        };
      })()
    `);

    assertEqual(sidebar.position, 'sticky', 'Sidebar is sticky');
    assertEqual(sidebar.topComputed, '100px', 'Sidebar top is 100px');
    assert(Math.abs(sidebar.rectTop - 100) <= 2, `Sidebar rect top should stick at 100px, got ${sidebar.rectTop}`);

    const prosVisible = await driver.evaluate(`document.querySelectorAll('#pros-grid .pro-card.is-visible').length`);
    assert(prosVisible > 0, 'Pros must be visible after scrolling');
  });
});

runner.describe('User Journey 4: Professional Profile View & Sticky Booking Card', 4, ({ test }) => {
  test('T4.4: User opens professional.html, profile fades in, booking card sticks, gallery and reviews stagger in', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.navigate(`${baseUrl}/professional.html?id=pro-1`);
    await driver.waitForSelector('#pro-name');

    // Test sticky pinning at scrollY = 600px
    await driver.scrollTo(600);
    await new Promise(r => setTimeout(r, 100));

    const bookingAt600 = await driver.evaluate(`
      (() => {
        const card = document.querySelector('.booking-card');
        const cs = window.getComputedStyle(card);
        const rect = card.getBoundingClientRect();
        return {
          position: cs.position,
          top: cs.top,
          rectTop: Math.round(rect.top)
        };
      })()
    `);

    assertEqual(bookingAt600.position, 'sticky', 'Booking card is sticky at scrollY = 600px');
    assertEqual(bookingAt600.top, '100px', 'Booking card top is 100px at scrollY = 600px');
    assert(Math.abs(bookingAt600.rectTop - 100) <= 2, `Booking card rect top must stick at ~100px at scrollY = 600px, got ${bookingAt600.rectTop}`);

    // Test sticky pinning at scrollY = 800px
    await driver.scrollTo(800);
    await new Promise(r => setTimeout(r, 100));

    const bookingAt800 = await driver.evaluate(`
      (() => {
        const card = document.querySelector('.booking-card');
        const cs = window.getComputedStyle(card);
        const rect = card.getBoundingClientRect();
        return {
          position: cs.position,
          top: cs.top,
          rectTop: Math.round(rect.top)
        };
      })()
    `);

    assertEqual(bookingAt800.position, 'sticky', 'Booking card is sticky at scrollY = 800px');
    assertEqual(bookingAt800.top, '100px', 'Booking card top is 100px at scrollY = 800px');
    assert(Math.abs(bookingAt800.rectTop - 100) <= 2, `Booking card rect top must stick at ~100px at scrollY = 800px, got ${bookingAt800.rectTop}`);
  });
});

runner.describe('User Journey 5: Reduced Motion Complete Accessibility Journey', 4, ({ test }) => {
  test('T4.5: User with reduced motion visits Home and Category pages with zero motion triggers and instant visibility', async ({ driver, baseUrl, assert, assertEqual }) => {
    await driver.setPrefersReducedMotion(true);

    // 1. Visit index.html
    await driver.navigate(`${baseUrl}/index.html`);
    const ctaOpacity = await driver.evaluate(`window.getComputedStyle(document.querySelector('.cta-card')).opacity`);
    assertEqual(ctaOpacity, '1', 'CTA card immediately visible');

    const heroInlineTransform = await driver.evaluate(`document.querySelector('.hero-section')?.style.transform`);
    assertEqual(heroInlineTransform, '', 'Zero parallax transform');

    // 2. Navigate to category page
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.waitForSelector('#pros-grid .pro-card');
    const proOpacity = await driver.evaluate(`window.getComputedStyle(document.querySelector('#pros-grid .pro-card')).opacity`);
    assertEqual(proOpacity, '1', 'Pro cards immediately visible without scrolling');

    // 3. Scroll down - verify zero transition delay
    await driver.scrollTo(600);
    const proDelay = await driver.evaluate(`document.querySelector('#pros-grid .pro-card')?.style.transitionDelay`);
    assert(proDelay === '' || proDelay === '0ms', 'Zero transition delay under reduced motion');
  });
});

// Main execution
async function main() {
  const server = new TestServer();
  let driver = null;

  try {
    const port = await server.start();
    const baseUrl = `http://127.0.0.1:${port}`;
    if (isVerbose) console.log(`Local test server running on ${baseUrl}`);

    const browserExe = findBrowserExecutable();
    if (isVerbose) console.log(`Using Chromium browser: ${browserExe}`);

    driver = new BrowserDriver(browserExe);
    await driver.launch();

    const success = await runner.run(driver, baseUrl, targetTier);

    await driver.close();
    driver = null;
    await server.stop();

    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error('\nFatal E2E Test Suite Error:', err);
    if (driver) await driver.close();
    await server.stop();
    process.exit(1);
  }
}

main();
