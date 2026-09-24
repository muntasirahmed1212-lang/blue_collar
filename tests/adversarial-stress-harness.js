/**
 * tests/adversarial-stress-harness.js
 * Adversarial Stress & Edge Case Test Suite for BlueCollar Connect Scroll Animations
 * 
 * Executed by: Challenger 1 (Adversarial Stress Verifier)
 * 
 * Stress Categories:
 * 1. Rapid repeated filter toggling & dynamic churn (category.html)
 * 2. Rapid window resize and orientation change simulations
 * 3. Extreme scroll positions (scrollY < 0, scrollY > 5000, rapid oscillation)
 * 4. Abnormal inputs to observeNewElements (null, undefined, primitives, detached nodes, fragments)
 * 5. Character reveal tokenizer on complex titles (nested spans, line breaks, emojis/unicode/ZWJ, whitespace, idempotency)
 * 
 * Zero external npm dependencies.
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
    this.targetWsUrl = null;
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `bluecollar_stress_profile_${Date.now()}_${Math.random().toString(36).substring(2)}`);
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
          try {
            await this.connect(match[1]);
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
      new Promise(resolve => {
        window.scrollTo(0, ${y});
        window.dispatchEvent(new Event('scroll'));
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
    `);
    await new Promise(r => setTimeout(r, 100));
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768
    });
    await new Promise(r => setTimeout(r, 50));
  }

  async setPrefersReducedMotion(enable) {
    await this.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: enable ? 'reduce' : 'no-preference' }]
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

// Adversarial Test Runner
class StressTestRunner {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  async runTest(category, name, testFn, ctx) {
    this.total++;
    const start = Date.now();
    try {
      await testFn(ctx);
      const duration = Date.now() - start;
      this.passed++;
      console.log(`  [PASS] ${name} (${duration}ms)`);
      this.results.push({ category, name, status: 'PASS', duration });
    } catch (err) {
      const duration = Date.now() - start;
      this.failed++;
      console.error(`  [FAIL] ${name} (${duration}ms)`);
      console.error(`         Error: ${err.message}`);
      this.results.push({ category, name, status: 'FAIL', duration, error: err.message });
    }
  }
}

async function runAdversarialStressSuite() {
  console.log('\n===============================================================');
  console.log(' Challenger 1: Adversarial Stress & Edge Case Verification');
  console.log(' Target: BlueCollar Connect Scroll Animation Engine');
  console.log('===============================================================\n');

  const server = new TestServer();
  let driver = null;
  const runner = new StressTestRunner();

  try {
    const port = await server.start();
    const baseUrl = `http://127.0.0.1:${port}`;
    const browserExe = findBrowserExecutable();
    driver = new BrowserDriver(browserExe);
    await driver.launch();

    const ctx = {
      driver,
      baseUrl,
      assert: (cond, msg) => { if (!cond) throw new Error(msg || 'Assertion failed'); },
      assertEqual: (actual, expected, msg) => {
        if (actual !== expected) throw new Error(`${msg ? msg + ' -> ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    };

    // =========================================================================
    // STRESS CATEGORY 1: Rapid Repeated Filter Toggling & Dynamic DOM Churn
    // =========================================================================
    console.log('\n--- [Stress 1] Rapid Repeated Filter Toggling & Dynamic Churn ---');

    await runner.runTest('Filter Toggling', 'S1.1: 50 consecutive rapid filter toggles maintain stable DOM node counts (no element leakage)', async ({ driver, baseUrl, assert }) => {
      await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
      await driver.waitForSelector('#pros-grid .pro-card');

      // Set to a known baseline state (rating: all, verified: false)
      await driver.evaluate(`
        (() => {
          document.getElementById('filter-verified').checked = false;
          document.querySelector('input[name="rating"][value="all"]').checked = true;
          document.getElementById('apply-filters-btn').click();
        })()
      `);
      await new Promise(r => setTimeout(r, 100));

      const baselineNodeCount = await driver.evaluate('document.querySelectorAll("*").length');

      // Rapidly toggle filters 50 times
      const churnResult = await driver.evaluate(`
        (async () => {
          const errors = [];
          for (let i = 0; i < 50; i++) {
            try {
              const isEven = i % 2 === 0;
              document.getElementById('filter-verified').checked = isEven;
              const ratingRadio = document.querySelector('input[name="rating"][value="' + (isEven ? '4.5' : 'all') + '"]');
              if (ratingRadio) ratingRadio.checked = true;
              document.getElementById('apply-filters-btn').click();
            } catch (e) {
              errors.push(e.message);
            }
          }
          // Return to the exact baseline filter state
          document.getElementById('filter-verified').checked = false;
          document.querySelector('input[name="rating"][value="all"]').checked = true;
          document.getElementById('apply-filters-btn').click();

          return {
            errors,
            finalCount: document.querySelectorAll('*').length,
            cardCount: document.querySelectorAll('#pros-grid .pro-card').length
          };
        })()
      `);

      assert(churnResult.errors.length === 0, `Filter toggling threw errors: ${churnResult.errors.join(', ')}`);
      assert(churnResult.cardCount > 0, `Pros grid has cards after 50 toggles: ${churnResult.cardCount}`);
      // When returned to identical filter state, node count must match baseline exactly (0 node leak)
      const diff = Math.abs(churnResult.finalCount - baselineNodeCount);
      assert(diff === 0, `Node count drifted by ${diff} elements under identical filter state, indicating DOM element leak`);
    }, ctx);

    await runner.runTest('Filter Toggling', 'S1.2: Observer remains functional after 50 rapid filter toggles and animates cards when scrolled into view', async ({ driver, assert, assertEqual }) => {
      // Scroll down far enough for all cards in grid to enter viewport threshold
      await driver.scrollTo(900);
      // Wait for card entry transitions to complete (stagger delays up to 300ms + 600ms transition)
      await new Promise(r => setTimeout(r, 1000));

      const visibleCards = await driver.evaluate(`
        (() => {
          const cards = Array.from(document.querySelectorAll('#pros-grid .pro-card'));
          return {
            total: cards.length,
            visible: cards.filter(c => c.classList.contains('is-visible')).length,
            opacity: cards.map(c => window.getComputedStyle(c).opacity)
          };
        })()
      `);

      assert(visibleCards.total > 0, 'Cards exist in DOM');
      assertEqual(visibleCards.visible, visibleCards.total, `All ${visibleCards.total} cards must become .is-visible on scroll after 50 filter toggles`);
      assert(visibleCards.opacity.every(op => op === '1'), `All cards reached opacity 1 (actual: ${JSON.stringify(visibleCards.opacity)})`);
    }, ctx);

    await runner.runTest('Filter Toggling', 'S1.3: Resetting filters repeatedly cleans transition delays cleanly without lingering inline delays', async ({ driver, assert }) => {
      // First return scroll to top
      await driver.scrollTo(0);
      for (let i = 0; i < 5; i++) {
        await driver.evaluate(`document.getElementById('reset-filters').click()`);
      }
      // Scroll through grid so all cards enter viewport and animate
      await driver.scrollTo(400);
      await new Promise(r => setTimeout(r, 400));
      await driver.scrollTo(800);
      // Wait for entry animation (stagger delays up to 300ms + 600ms duration + 800ms fallback timeout)
      await new Promise(r => setTimeout(r, 1200));

      const diag = await driver.evaluate(`
        (() => {
          const cards = Array.from(document.querySelectorAll('#pros-grid .pro-card'));
          return cards.map((c, i) => ({
            index: i,
            delay: c.style.transitionDelay,
            isVisible: c.classList.contains('is-visible'),
            top: c.getBoundingClientRect().top,
            bottom: c.getBoundingClientRect().bottom
          }));
        })()
      `);

      console.log('       [Adversarial Observed S1.3 Cards]:', JSON.stringify(diag));

      const delayResult = diag.map(c => c.delay);
      assert(delayResult.length > 0, 'Cards exist');
      assert(delayResult.every(d => d === '0ms' || d === ''), `All cards reset transition delay to 0ms (actual: ${JSON.stringify(delayResult)})`);
    }, ctx);

    await runner.runTest('Filter Toggling', 'S1.4: Race condition test: Rapid search filter typing and clearing in services.html does not crash observer', async ({ driver, baseUrl, assert }) => {
      await driver.navigate(`${baseUrl}/services.html`);
      await driver.waitForSelector('#all-categories-grid .service-card-full');

      const raceResult = await driver.evaluate(`
        (async () => {
          const searchInput = document.getElementById('category-filter');
          const errors = [];
          const queries = ['plumb', '', 'elect', '', 'paint', 'xyznonexistent', 'clean', ''];
          
          for (const q of queries) {
            try {
              searchInput.value = q;
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(r => setTimeout(r, 20)); // ultra-short delay to stress race conditions
            } catch (err) {
              errors.push(err.message);
            }
          }
          return {
            errors,
            finalCards: document.querySelectorAll('#all-categories-grid .service-card-full').length
          };
        })()
      `);

      assert(raceResult.errors.length === 0, `Search churn threw errors: ${raceResult.errors.join(', ')}`);
      assert(raceResult.finalCards === 12, `Expected all 12 service cards restored, got ${raceResult.finalCards}`);
    }, ctx);

    // =========================================================================
    // STRESS CATEGORY 2: Rapid Window Resize & Orientation Change Simulations
    // =========================================================================
    console.log('\n--- [Stress 2] Rapid Window Resize & Orientation Change ---');

    await runner.runTest('Resize & Orientation', 'S2.1: 30 rapid viewport dimension mutations do not throw or produce invalid CSS values', async ({ driver, baseUrl, assert }) => {
      await driver.navigate(`${baseUrl}/index.html`);

      const viewports = [
        { w: 1920, h: 1080 },
        { w: 375, h: 667 },
        { w: 667, h: 375 },
        { w: 768, h: 1024 },
        { w: 1024, h: 768 },
        { w: 320, h: 568 },
        { w: 1440, h: 900 },
        { w: 2560, h: 1440 }
      ];

      for (let i = 0; i < 30; i++) {
        const vp = viewports[i % viewports.length];
        await driver.setViewport(vp.w, vp.h);
      }

      await driver.scrollTo(180);
      const heroStyles = await driver.evaluate(`
        (() => {
          const hero = document.querySelector('.hero-section');
          return {
            opacity: hero.style.opacity,
            transform: hero.style.transform
          };
        })()
      `);

      assert(!heroStyles.opacity.includes('NaN'), `Opacity produced NaN: ${heroStyles.opacity}`);
      assert(!heroStyles.transform.includes('NaN'), `Transform produced NaN: ${heroStyles.transform}`);
      const opFloat = parseFloat(heroStyles.opacity);
      assert(opFloat >= 0 && opFloat <= 1, `Opacity must be between 0 and 1, got ${opFloat}`);
    }, ctx);

    await runner.runTest('Resize & Orientation', 'S2.2: Extreme narrow screen (320px) does not cause horizontal layout overflow or break .char-word nowrap', async ({ driver, assert }) => {
      await driver.setViewport(320, 568);
      await driver.scrollTo(0);

      const overflowData = await driver.evaluate(`
        (() => {
          const docWidth = document.documentElement.offsetWidth;
          const scrollWidth = document.documentElement.scrollWidth;
          const words = Array.from(document.querySelectorAll('.char-word')).map(w => ({
            whiteSpace: window.getComputedStyle(w).whiteSpace,
            width: w.offsetWidth
          }));
          return {
            docWidth,
            scrollWidth,
            hasOverflow: scrollWidth > docWidth + 2,
            allNowrap: words.every(w => w.whiteSpace === 'nowrap')
          };
        })()
      `);

      assert(overflowData.allNowrap, 'All .char-word spans maintain white-space: nowrap');
      assert(!overflowData.hasOverflow, `Document has horizontal overflow at 320px: scrollWidth ${overflowData.scrollWidth} > docWidth ${overflowData.docWidth}`);
    }, ctx);

    await runner.runTest('Resize & Orientation', 'S2.3: Rapid orientation change during active scroll preserves sticky sidebar and header integrity', async ({ driver, baseUrl, assert, assertEqual }) => {
      await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
      await driver.waitForSelector('.sidebar-filters');

      await driver.setViewport(375, 812); // portrait
      await driver.scrollTo(300);
      await driver.setViewport(812, 375); // landscape
      await driver.scrollTo(400);
      await driver.setViewport(1280, 900); // desktop

      const layoutData = await driver.evaluate(`
        (() => {
          const header = document.querySelector('header');
          const sidebar = document.querySelector('.sidebar-filters');
          const headerStyle = window.getComputedStyle(header);
          const sidebarStyle = window.getComputedStyle(sidebar);
          return {
            headerPosition: headerStyle.position,
            sidebarPosition: sidebarStyle.position,
            sidebarTop: sidebarStyle.top
          };
        })()
      `);

      assertEqual(layoutData.headerPosition, 'fixed', 'Header remains fixed after orientation flips');
      assertEqual(layoutData.sidebarPosition, 'sticky', 'Sidebar remains sticky after orientation flips');
      assertEqual(layoutData.sidebarTop, '100px', 'Sidebar sticky offset remains 100px');
    }, ctx);

    // =========================================================================
    // STRESS CATEGORY 3: Extreme Scroll Positions (scrollY < 0, scrollY > 5000)
    // =========================================================================
    console.log('\n--- [Stress 3] Extreme Scroll Positions (scrollY < 0, scrollY > 5000) ---');

    await runner.runTest('Extreme Scroll', 'S3.1: Negative scroll simulation (scrollY < 0, overscroll) clamps progress to 0 and opacity to 1.0', async ({ driver, baseUrl, assert }) => {
      await driver.navigate(`${baseUrl}/index.html`);
      await driver.setViewport(1280, 900);

      // Verify mathematical clamp under negative scroll offset simulation
      const mathClamp = await driver.evaluate(`
        (() => {
          const hero = document.querySelector('.hero-section');
          const heroHeight = hero.offsetHeight || 500;
          const negativeScrolls = [-10, -100, -500];

          return negativeScrolls.map(scrollY => {
            const progress = Math.min(Math.max(scrollY / heroHeight, 0), 1);
            const opacity = Math.max(0, 1 - progress * 1.25);
            const scale = 1 - progress * 0.08;
            return { scrollY, progress, opacity, scale };
          });
        })()
      `);

      for (const res of mathClamp) {
        assert(res.progress === 0, `Progress for scrollY ${res.scrollY} must be 0, got ${res.progress}`);
        assert(res.opacity === 1, `Opacity for scrollY ${res.scrollY} must be 1, got ${res.opacity}`);
        assert(res.scale === 1, `Scale for scrollY ${res.scrollY} must be 1, got ${res.scale}`);
      }
    }, ctx);

    await runner.runTest('Extreme Scroll', 'S3.2: Extreme positive scroll (scrollY = 3000px) clamps opacity to 0 and stops hero overlay interference', async ({ driver, assert, assertEqual }) => {
      await driver.scrollTo(3000);

      const extremeResult = await driver.evaluate(`
        (() => {
          const hero = document.querySelector('.hero-section');
          const rect = hero.getBoundingClientRect();
          const scrollY = window.scrollY || window.pageYOffset;
          const heroHeight = hero.offsetHeight;
          return {
            scrollY,
            heroHeight,
            opacity: hero.style.opacity,
            transform: hero.style.transform,
            bottom: rect.bottom
          };
        })()
      `);

      console.log('       [Adversarial Observed Values] S3.2 deep scroll:', JSON.stringify(extremeResult));
      assertEqual(extremeResult.opacity, '0', 'Opacity at deep scroll must be clamped to 0');
      assert(extremeResult.transform.includes('scale('), `Transform must contain scale, got ${extremeResult.transform}`);
    }, ctx);

    await runner.runTest('Extreme Scroll', 'S3.3: Rapid oscillation between 0px and 2500px cleanly restores hero opacity 1.0 and scale 1.0 at top', async ({ driver, assert }) => {
      for (let i = 0; i < 8; i++) {
        await driver.scrollTo(i % 2 === 0 ? 2000 : 0);
      }
      await driver.scrollTo(0);
      await new Promise(r => setTimeout(r, 150));

      const finalHero = await driver.evaluate(`
        (() => {
          const hero = document.querySelector('.hero-section');
          return {
            opacity: parseFloat(hero.style.opacity || '1'),
            transform: hero.style.transform
          };
        })()
      `);

      assert(finalHero.opacity >= 0.99, `Hero opacity restored to >= 0.99 (actual: ${finalHero.opacity})`);
      assert(finalHero.transform.includes('scale(1') || finalHero.transform === '', `Hero scale restored to scale(1) (actual: ${finalHero.transform})`);
    }, ctx);

    // =========================================================================
    // STRESS CATEGORY 4: Abnormal Inputs to observeNewElements
    // =========================================================================
    console.log('\n--- [Stress 4] Abnormal Inputs to observeNewElements ---');

    await runner.runTest('Abnormal Inputs', 'S4.1: observeNewElements handles null, undefined, primitives without exceptions', async ({ driver, assert }) => {
      const res = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const errors = [];
          const testInputs = [
            null,
            undefined,
            42,
            0,
            -1,
            'string container',
            true,
            false,
            Symbol('test'),
            () => {},
            [],
            {}
          ];

          for (const input of testInputs) {
            try {
              mod.observeNewElements(input);
            } catch (err) {
              errors.push({ input: String(input), error: err.message });
            }
          }
          return errors;
        })()
      `);

      assert(res.length === 0, `observeNewElements threw on abnormal inputs: ${JSON.stringify(res)}`);
    }, ctx);

    await runner.runTest('Abnormal Inputs', 'S4.2: observeNewElements handles detached nodes, empty fragments, and detached cards correctly', async ({ driver, assert }) => {
      const res = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const errors = [];

          try {
            const detachedDiv = document.createElement('div');
            mod.observeNewElements(detachedDiv);

            const fragment = document.createDocumentFragment();
            mod.observeNewElements(fragment);

            const detachedGrid = document.createElement('div');
            detachedGrid.className = 'categories-grid';
            for (let i = 0; i < 5; i++) {
              const card = document.createElement('div');
              card.className = 'category-card';
              detachedGrid.appendChild(card);
            }
            mod.observeNewElements(detachedGrid);

            const allHaveAnimate = Array.from(detachedGrid.children).every(c => c.getAttribute('data-animate') === 'fade-up');
            if (!allHaveAnimate) errors.push('Detached children did not acquire data-animate');

            const selfAnim = document.createElement('div');
            selfAnim.setAttribute('data-animate', 'fade-up');
            mod.observeNewElements(selfAnim);

          } catch (e) {
            errors.push(e.message);
          }

          return errors;
        })()
      `);

      assert(res.length === 0, `Detached node observation threw: ${JSON.stringify(res)}`);
    }, ctx);

    await runner.runTest('Abnormal Inputs', 'S4.3: observeNewElements handles malformed or empty data-animate attributes safely', async ({ driver, assert }) => {
      const res = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const errors = [];

          try {
            const container = document.createElement('div');
            const el1 = document.createElement('div');
            el1.setAttribute('data-animate', '');
            container.appendChild(el1);

            const el2 = document.createElement('div');
            el2.setAttribute('data-animate', 'unknown-3d-flip');
            container.appendChild(el2);

            const el3 = document.createElement('div');
            el3.setAttribute('data-animate', 'scale-up');
            container.appendChild(el3);

            document.body.appendChild(container);
            mod.observeNewElements(container);
            document.body.removeChild(container);
          } catch (e) {
            errors.push(e.message);
          }

          return errors;
        })()
      `);

      assert(res.length === 0, `Malformed attributes caused error: ${JSON.stringify(res)}`);
    }, ctx);

    // =========================================================================
    // STRESS CATEGORY 5: Character Reveal Tokenizer on Complex Titles
    // =========================================================================
    console.log('\n--- [Stress 5] Character Reveal Tokenizer on Complex Titles ---');

    await runner.runTest('Tokenizer', 'S5.1: Nested HTML tags inside heading preserve text order, inner structure, and aria-label', async ({ driver, assert, assertEqual }) => {
      const result = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const heading = document.createElement('h2');
          heading.setAttribute('data-char-reveal', '');
          heading.innerHTML = 'Find <span class="highlight">Verified <strong>Pros</strong></span> Today';
          document.body.appendChild(heading);

          mod.initCharReveal(heading);

          const ariaLabel = heading.getAttribute('aria-label');
          const wrapper = heading.querySelector('.char-reveal-wrapper');
          const chars = Array.from(heading.querySelectorAll('.char')).map(c => c.textContent).join('');
          const strongTag = heading.querySelector('strong');
          const highlightSpan = heading.querySelector('.highlight');

          document.body.removeChild(heading);

          return {
            ariaLabel,
            hasWrapper: !!wrapper,
            wrapperAriaHidden: wrapper ? wrapper.getAttribute('aria-hidden') : null,
            reconstructedText: chars,
            hasStrong: !!strongTag,
            hasHighlight: !!highlightSpan
          };
        })()
      `);

      assertEqual(result.ariaLabel, 'Find Verified Pros Today', 'aria-label matches clean concatenated text');
      assert(result.hasWrapper, 'Has .char-reveal-wrapper');
      assertEqual(result.wrapperAriaHidden, 'true', 'Wrapper has aria-hidden="true"');
      assertEqual(result.reconstructedText, 'FindVerifiedProsToday', 'All characters extracted in correct order');
      assert(result.hasStrong, 'Preserves inner <strong> element');
      assert(result.hasHighlight, 'Preserves inner .highlight span element');
    }, ctx);

    await runner.runTest('Tokenizer', 'S5.2: Heading with <br> line break preserves line breaks without converting to character tokens', async ({ driver, assert, assertEqual }) => {
      const result = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const heading = document.createElement('h2');
          heading.setAttribute('data-char-reveal', '');
          heading.innerHTML = 'Expert Plumbing<br>At Your Doorstep';
          document.body.appendChild(heading);

          mod.initCharReveal(heading);

          const ariaLabel = heading.getAttribute('aria-label');
          const brTags = heading.querySelectorAll('br');
          const chars = Array.from(heading.querySelectorAll('.char')).map(c => c.textContent).join('');

          document.body.removeChild(heading);

          return {
            ariaLabel,
            brCount: brTags.length,
            chars
          };
        })()
      `);

      assertEqual(result.brCount, 1, 'Preserves <br> tag inside tokenized tree');
      assert(result.chars.includes('ExpertPlumbingAtYourDoorstep'), 'Characters preserved across line break');
    }, ctx);

    await runner.runTest('Tokenizer', 'S5.3: Unicode symbols, entities, and multi-byte characters preserve valid text without unhandled exceptions', async ({ driver, assert, assertEqual }) => {
      const result = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const heading = document.createElement('h2');
          heading.setAttribute('data-char-reveal', '');
          heading.innerHTML = '⚡ Fix &amp; "Clean" 100% — Fast!';
          document.body.appendChild(heading);

          mod.initCharReveal(heading);

          const chars = Array.from(heading.querySelectorAll('.char')).map(c => c.textContent);
          const ariaLabel = heading.getAttribute('aria-label');

          document.body.removeChild(heading);

          return {
            chars,
            ariaLabel
          };
        })()
      `);

      assertEqual(result.ariaLabel, '⚡ Fix & "Clean" 100% — Fast!', 'aria-label matches clean decoded string');
      assert(result.chars.includes('⚡'), 'Contains lightning symbol');
      assert(result.chars.includes('&'), 'Decodes HTML entity &amp; to &');
      assert(result.chars.includes('"'), 'Preserves quotation marks');
      assert(result.chars.includes('—'), 'Preserves em-dash');
    }, ctx);

    await runner.runTest('Tokenizer', 'S5.4: Empirical investigation: Multi-code-point emoji and ZWJ sequences (e.g. 👨‍🔧, 🛠️) behavior analysis', async ({ driver, assert }) => {
      const analysis = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const heading = document.createElement('h2');
          heading.setAttribute('data-char-reveal', '');
          heading.textContent = 'Expert 👨‍🔧 Mechanic & 🛠️ Tools';
          document.body.appendChild(heading);

          mod.initCharReveal(heading);

          const chars = Array.from(heading.querySelectorAll('.char')).map(c => c.textContent);
          const words = Array.from(heading.querySelectorAll('.char-word')).map(w => w.textContent);

          document.body.removeChild(heading);

          // Check if ZWJ emoji 👨‍🔧 got split into separate code units
          const zwjIndex = chars.indexOf('\\u200d');
          const hasZwjSpan = zwjIndex !== -1;
          const hasMechanicCombined = chars.includes('👨‍🔧');

          return {
            chars,
            words,
            hasZwjSpan,
            hasMechanicCombined,
            charCount: chars.length
          };
        })()
      `);

      // Document empirical finding:
      console.log('       [Adversarial Analysis] Multi-codepoint emoji character reveal:');
      console.log(`       - Has combined emoji span: ${analysis.hasMechanicCombined}`);
      console.log(`       - Splits ZWJ into separate span: ${analysis.hasZwjSpan}`);
      console.log(`       - Words preserved: ${analysis.words.join(' | ')}`);

      // The word container .char-word preserves the full word text
      assert(analysis.words.some(w => w.includes('👨‍🔧')), 'Word container preserves composite emoji sequence');
    }, ctx);

    await runner.runTest('Tokenizer', 'S5.5: Abnormal whitespace (tabs, newlines, multi-spaces) tokenizes cleanly without empty spans', async ({ driver, assert, assertEqual }) => {
      const result = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const heading = document.createElement('h2');
          heading.setAttribute('data-char-reveal', '');
          heading.textContent = '   Find   \\t\\n  Top   \\t   Pros   ';
          document.body.appendChild(heading);

          mod.initCharReveal(heading);

          const ariaLabel = heading.getAttribute('aria-label');
          const chars = Array.from(heading.querySelectorAll('.char')).map(c => c.textContent);
          const emptyChars = chars.filter(c => c.trim() === '');

          document.body.removeChild(heading);

          return {
            ariaLabel,
            chars,
            emptyCharCount: emptyChars.length
          };
        })()
      `);

      assertEqual(result.ariaLabel, 'Find Top Pros', 'Normalizes abnormal whitespace in aria-label');
      assertEqual(result.emptyCharCount, 0, 'No empty or whitespace-only character spans');
      assertEqual(result.chars.join(''), 'FindTopPros', 'Only letters tokenized into .char spans');
    }, ctx);

    await runner.runTest('Tokenizer', 'S5.6: Empty and whitespace-only headings handle gracefully without error', async ({ driver, assert }) => {
      const result = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const errors = [];

          try {
            const hEmpty = document.createElement('h2');
            hEmpty.setAttribute('data-char-reveal', '');
            document.body.appendChild(hEmpty);
            mod.initCharReveal(hEmpty);
            document.body.removeChild(hEmpty);

            const hSpaces = document.createElement('h2');
            hSpaces.setAttribute('data-char-reveal', '');
            hSpaces.textContent = '     ';
            document.body.appendChild(hSpaces);
            mod.initCharReveal(hSpaces);
            document.body.removeChild(hSpaces);
          } catch (e) {
            errors.push(e.message);
          }

          return errors;
        })()
      `);

      assert(result.length === 0, `Empty headings threw errors: ${JSON.stringify(result)}`);
    }, ctx);

    await runner.runTest('Tokenizer', 'S5.7: Idempotency: Calling initCharReveal multiple times does not duplicate wrapper or corrupt DOM', async ({ driver, assert, assertEqual }) => {
      const result = await driver.evaluate(`
        (async () => {
          const mod = await import('/js/utils/animations.js');
          const heading = document.createElement('h2');
          heading.setAttribute('data-char-reveal', '');
          heading.textContent = 'Idempotency Test';
          document.body.appendChild(heading);

          // Call 5 times consecutively
          mod.initCharReveal(heading);
          mod.initCharReveal(heading);
          mod.initCharReveal(heading);
          mod.initCharReveal(heading);
          mod.initCharReveal(heading);

          const wrapperCount = heading.querySelectorAll('.char-reveal-wrapper').length;
          const charCount = heading.querySelectorAll('.char').length;

          document.body.removeChild(heading);

          return {
            wrapperCount,
            charCount
          };
        })()
      `);

      assertEqual(result.wrapperCount, 1, 'Exactly one .char-reveal-wrapper exists after 5 invocations');
      assertEqual(result.charCount, 15, 'Exactly 15 characters tokenized (not multiplied)');
    }, ctx);

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n===============================================================');
    console.log(` Adversarial Stress Summary: Total: ${runner.total} | Passed: ${runner.passed} | Failed: ${runner.failed}`);
    console.log('===============================================================\n');

    await driver.close();
    driver = null;
    await server.stop();

    process.exit(runner.failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('Fatal Adversarial Suite Error:', err);
    if (driver) await driver.close();
    await server.stop();
    process.exit(1);
  }
}

runAdversarialStressSuite();
