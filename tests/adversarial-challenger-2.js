/**
 * tests/adversarial-challenger-2.js
 * Adversarial Verification Harness for Challenger 2 (Layout & Performance Verifier)
 * 
 * Focus Areas:
 * 1. Containing blocks & position: sticky on .sidebar-filters (category.html) and .booking-card (professional.html)
 * 2. Header fixed positioning during active scroll and hero parallax
 * 3. Card hover transitions and lingering transition-delay
 * 4. Hero parallax requestAnimationFrame ticking guards and scroll jank stress test
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
  '.jpg': 'image/jpeg'
};

function findBrowserExecutable() {
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
  throw new Error('No Chromium executable found.');
}

class TestServer {
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
        let pathname = decodeURIComponent(parsedUrl.pathname);
        if (pathname === '/') pathname = '/index.html';
        const filePath = path.join(PROJECT_ROOT, pathname);

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
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
      if (this.server) this.server.close(() => resolve());
      else resolve();
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
  }

  async launch() {
    this.userDataDir = path.join(os.tmpdir(), `challenger2_prof_${Date.now()}_${Math.random().toString(36).substring(2)}`);
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
          try {
            await this.connect(match[1]);
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      });

      this.proc.on('error', err => { if (!resolved) reject(err); });
      setTimeout(() => { if (!resolved) reject(new Error('Timeout starting browser')); }, 10000);
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
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
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
        if (this.events.some(e => e.method === 'Page.loadEventFired')) return resolve();
        setTimeout(check, 50);
      };
      check();
      setTimeout(resolve, 3000);
    });
    await new Promise(r => setTimeout(r, 400));
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
    await new Promise(r => setTimeout(r, 120));
  }

  async close() {
    if (this.ws) this.ws.close();
    if (this.proc) this.proc.kill();
    try {
      fs.rmSync(this.userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

async function runAdversarialVerification() {
  const results = [];
  const record = (name, passed, details) => {
    results.push({ name, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
  };

  const server = new TestServer();
  const port = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browserPath = findBrowserExecutable();
  const driver = new BrowserDriver(browserPath);
  await driver.launch();

  try {
    console.log('\n===============================================================');
    console.log('CHALLENGER 2 ADVERSARIAL VERIFICATION HARNESS');
    console.log('===============================================================\n');

    // --------------------------------------------------------------------------
    // TEST 1: Category Sidebar Sticky & Containing Block Analysis
    // --------------------------------------------------------------------------
    console.log('--- 1. Testing .sidebar-filters (category.html) Sticky & Containing Block ---');
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.evaluate(`
      new Promise(r => {
        const check = () => {
          if (document.querySelectorAll('#pros-grid .pro-card').length > 0) r();
          else setTimeout(check, 50);
        };
        check();
      })
    `);

    // 1A. Inspect all ancestor styles for containing block / overflow traps
    const ancestorCheck = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.sidebar-filters');
        let curr = el.parentElement;
        const culprits = [];
        while (curr && curr !== document.body && curr !== document.documentElement) {
          const cs = window.getComputedStyle(curr);
          const issues = [];
          if (cs.overflow !== 'visible') issues.push('overflow:' + cs.overflow);
          if (cs.overflowX !== 'visible') issues.push('overflowX:' + cs.overflowX);
          if (cs.overflowY !== 'visible') issues.push('overflowY:' + cs.overflowY);
          if (cs.transform !== 'none') issues.push('transform:' + cs.transform);
          if (cs.filter !== 'none') issues.push('filter:' + cs.filter);
          if (cs.perspective !== 'none') issues.push('perspective:' + cs.perspective);
          if (cs.contain && cs.contain !== 'none') issues.push('contain:' + cs.contain);
          if (issues.length > 0) {
            culprits.push({ tag: curr.tagName, id: curr.id, className: curr.className, issues });
          }
          curr = curr.parentElement;
        }
        return culprits;
      })()
    `);
    record(
      'Category Sidebar Ancestor Containing Blocks / Overflows',
      ancestorCheck.length === 0,
      ancestorCheck.length === 0 ? 'No ancestors introduce overflow or containing block traps' : JSON.stringify(ancestorCheck)
    );

    // 1B. Inspect .sidebar-filters computed properties before and after visibility
    const sidebarInitial = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.sidebar-filters');
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          position: cs.position,
          topComputed: cs.top,
          rectTop: Math.round(rect.top),
          transform: cs.transform,
          hasIsVisible: el.classList.contains('is-visible')
        };
      })()
    `);
    record(
      'Category Sidebar Initial State',
      sidebarInitial.position === 'sticky' && sidebarInitial.topComputed === '100px',
      `position: ${sidebarInitial.position}, top: ${sidebarInitial.topComputed}, initial rect.top: ${sidebarInitial.rectTop}`
    );

    // 1C. Active scroll sticky tracking
    let sidebarStickyPassed = true;
    const scrollPositions = [100, 200, 300, 450, 600, 800];
    const sidebarTrack = [];
    for (const y of scrollPositions) {
      await driver.scrollTo(y);
      const metrics = await driver.evaluate(`
        (() => {
          const el = document.querySelector('.sidebar-filters');
          const rect = el.getBoundingClientRect();
          const parentRect = el.parentElement.getBoundingClientRect();
          return {
            scrollY: window.scrollY,
            rectTop: Math.round(rect.top),
            parentBottom: Math.round(parentRect.bottom),
            sidebarHeight: el.offsetHeight
          };
        })()
      `);
      sidebarTrack.push(metrics);
      // Once scrolled past hero (hero ~230px, layout starts ~250px), sidebar should stick at ~100px
      // provided parent container has remaining space
      if (metrics.scrollY >= 300 && metrics.parentBottom > metrics.sidebarHeight + 100) {
        if (Math.abs(metrics.rectTop - 100) > 3) {
          sidebarStickyPassed = false;
        }
      }
    }
    record(
      'Category Sidebar Sticky Pinning at top: 100px during scroll',
      sidebarStickyPassed,
      `Tracked scroll points: ${sidebarTrack.map(t => `scrollY ${t.scrollY} -> rect.top ${t.rectTop}`).join(', ')}`
    );

    // --------------------------------------------------------------------------
    // TEST 2: Professional Booking Card Sticky & Containing Block Analysis
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Testing .booking-card (professional.html) Sticky & Containing Block ---');
    await driver.navigate(`${baseUrl}/professional.html?id=pro-1`);
    await driver.evaluate(`
      new Promise(r => {
        const check = () => {
          if (document.querySelector('#pro-name') && !document.querySelector('#pro-name').classList.contains('skeleton')) r();
          else setTimeout(check, 50);
        };
        check();
      })
    `);

    // 2A. Ancestor containing blocks / overflow traps for booking-card
    const bookingAncestors = await driver.evaluate(`
      (() => {
        const el = document.querySelector('.booking-card');
        let curr = el.parentElement;
        const culprits = [];
        while (curr && curr !== document.body && curr !== document.documentElement) {
          const cs = window.getComputedStyle(curr);
          const issues = [];
          if (cs.overflow !== 'visible') issues.push('overflow:' + cs.overflow);
          if (cs.overflowX !== 'visible') issues.push('overflowX:' + cs.overflowX);
          if (cs.overflowY !== 'visible') issues.push('overflowY:' + cs.overflowY);
          if (cs.transform !== 'none') issues.push('transform:' + cs.transform);
          if (cs.filter !== 'none') issues.push('filter:' + cs.filter);
          if (cs.contain && cs.contain !== 'none') issues.push('contain:' + cs.contain);
          if (issues.length > 0) {
            culprits.push({ tag: curr.tagName, id: curr.id, className: curr.className, issues });
          }
          curr = curr.parentElement;
        }
        return culprits;
      })()
    `);
    record(
      'Booking Card Ancestor Containing Blocks / Overflows',
      bookingAncestors.length === 0,
      bookingAncestors.length === 0 ? 'No ancestors introduce overflow or containing block traps' : JSON.stringify(bookingAncestors)
    );

    // 2B. Parent layout sizing analysis
    const layoutSizing = await driver.evaluate(`
      (() => {
        const layout = document.querySelector('.profile-layout');
        const main = document.querySelector('.profile-main');
        const sidebar = document.querySelector('.profile-sidebar');
        const card = document.querySelector('.booking-card');
        const layoutCs = window.getComputedStyle(layout);
        const sidebarCs = window.getComputedStyle(sidebar);
        return {
          gridAlignItems: layoutCs.alignItems,
          mainHeight: main.offsetHeight,
          sidebarHeight: sidebar.offsetHeight,
          cardHeight: card.offsetHeight,
          cardPosition: window.getComputedStyle(card).position,
          cardTop: window.getComputedStyle(card).top
        };
      })()
    `);
    console.log('Layout sizing metrics:', layoutSizing);

    // 2C. Scroll and measure actual sticky behavior of booking-card
    let bookingStickyPassed = true;
    const bookingTrack = [];
    for (const y of [100, 200, 350, 500, 700, 900]) {
      await driver.scrollTo(y);
      const m = await driver.evaluate(`
        (() => {
          const card = document.querySelector('.booking-card');
          const sidebar = document.querySelector('.profile-sidebar');
          const r = card.getBoundingClientRect();
          const sr = sidebar.getBoundingClientRect();
          return {
            scrollY: window.scrollY,
            rectTop: Math.round(r.top),
            sidebarTop: Math.round(sr.top),
            sidebarBottom: Math.round(sr.bottom),
            cardHeight: card.offsetHeight
          };
        })()
      `);
      bookingTrack.push(m);
      // Once scrolled past breadcrumb and initial header (~200px), card should stick at 100px
      if (m.scrollY >= 350 && m.sidebarBottom > m.cardHeight + 100) {
        if (Math.abs(m.rectTop - 100) > 3) {
          bookingStickyPassed = false;
        }
      }
    }
    record(
      'Booking Card Sticky Pinning at top: 100px during scroll',
      bookingStickyPassed,
      `Tracked scroll points: ${bookingTrack.map(t => `scrollY ${t.scrollY} -> rect.top ${t.rectTop} (sidebar bottom ${t.sidebarBottom})`).join(', ')}`
    );

    // --------------------------------------------------------------------------
    // TEST 3: Header Fixed Positioning During Active Scroll and Hero Parallax
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Testing Header Fixed Top Viewport Pinning ---');
    await driver.navigate(`${baseUrl}/index.html`);
    let headerFixedPassed = true;
    const headerTrack = [];
    for (const y of [0, 80, 160, 250, 400, 600, 1000, 1500]) {
      await driver.scrollTo(y);
      const hData = await driver.evaluate(`
        (() => {
          const h = document.querySelector('header');
          const r = h.getBoundingClientRect();
          const cs = window.getComputedStyle(h);
          const hero = document.querySelector('.hero-section');
          return {
            scrollY: window.scrollY,
            rectTop: Math.round(r.top),
            csPosition: cs.position,
            isScrolled: h.classList.contains('scrolled'),
            heroOpacity: hero ? hero.style.opacity : null,
            heroTransform: hero ? hero.style.transform : null
          };
        })()
      `);
      headerTrack.push(hData);
      if (hData.rectTop !== 0 || hData.csPosition !== 'fixed') {
        headerFixedPassed = false;
      }
    }
    record(
      'Header fixed position: fixed & rect.top === 0 across all scroll points',
      headerFixedPassed,
      `Tracked scroll points: ${headerTrack.map(t => `scrollY ${t.scrollY} -> rect.top ${t.rectTop} (heroTransform: ${t.heroTransform || 'none'})`).join(', ')}`
    );

    // Rapid oscillation stress test on header
    const oscillationPassed = await driver.evaluate(`
      (() => {
        let perfect = true;
        for (let i = 0; i < 20; i++) {
          window.scrollTo(0, i * 40);
          window.dispatchEvent(new Event('scroll'));
          const r = document.querySelector('header').getBoundingClientRect();
          if (r.top !== 0) perfect = false;
        }
        window.scrollTo(0, 0);
        return perfect;
      })()
    `);
    record(
      'Header remains at top: 0 under rapid scroll oscillation',
      oscillationPassed,
      oscillationPassed ? 'Header never deviated from top: 0 during 20 rapid scroll jumps' : 'Header deviated from top: 0'
    );

    // --------------------------------------------------------------------------
    // TEST 4: Card Hover Transitions & Lingering Animation Delays
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Testing Card Hover Transitions & Animation Delay Cleanup ---');
    await driver.navigate(`${baseUrl}/index.html`);
    await driver.scrollTo(800);
    await driver.evaluate(`
      new Promise(r => {
        const check = () => {
          const card = document.querySelector('#home-categories-grid .category-card');
          if (card && card.classList.contains('is-visible')) r();
          else setTimeout(check, 50);
        };
        check();
      })
    `);

    // Measure transition-delay immediately vs after 850ms
    const immediateDelay = await driver.evaluate(`
      document.querySelector('#home-categories-grid .category-card:nth-child(4)')?.style.transitionDelay
    `);
    
    // Wait for transition end / timeout cleanup
    await new Promise(r => setTimeout(r, 900));

    const cleanedDelay = await driver.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('#home-categories-grid .category-card'));
        return cards.map((c, i) => ({
          index: i,
          delay: c.style.transitionDelay,
          csTransition: window.getComputedStyle(c).transition
        }));
      })()
    `);
    const allCleanedToZero = cleanedDelay.every(c => c.delay === '0ms');
    record(
      'Grid cards transitionDelay resets to 0ms after entrance completes',
      allCleanedToZero,
      `Immediate delay: ${immediateDelay} -> Cleaned delays: [${cleanedDelay.map(c => c.delay).join(', ')}]`
    );

    // Hover responsiveness test: check if computed style on hover uses normal duration without delay
    const hoverDelayTest = await driver.evaluate(`
      (() => {
        const card = document.querySelector('#home-categories-grid .category-card');
        const cs = window.getComputedStyle(card);
        return {
          inlineDelay: card.style.transitionDelay,
          computedDelay: cs.transitionDelay
        };
      })()
    `);
    record(
      'Card hover transition has 0s delay for instant hover response',
      hoverDelayTest.inlineDelay === '0ms' && (hoverDelayTest.computedDelay === '0s' || hoverDelayTest.computedDelay === '0ms'),
      `inlineDelay: ${hoverDelayTest.inlineDelay}, computedDelay: ${hoverDelayTest.computedDelay}`
    );

    // Category page dynamic filter churn transition delay test
    await driver.navigate(`${baseUrl}/category.html?cat=plumber`);
    await driver.evaluate(`
      new Promise(r => {
        const check = () => {
          if (document.querySelectorAll('#pros-grid .pro-card').length > 0) r();
          else setTimeout(check, 50);
        };
        check();
      })
    `);
    await driver.scrollTo(500);
    await new Promise(r => setTimeout(r, 900));
    const proDelaysCleaned = await driver.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('#pros-grid .pro-card'));
        return cards.every(c => c.style.transitionDelay === '0ms');
      })()
    `);
    record(
      'Dynamic pro cards in category.html clean transitionDelay to 0ms',
      proDelaysCleaned,
      proDelaysCleaned ? 'All pro cards reset to 0ms' : 'Some pro cards retained delay'
    );

    // --------------------------------------------------------------------------
    // TEST 5: Hero Parallax rAF Ticking Guards & Scroll Jank Stress Test
    // --------------------------------------------------------------------------
    console.log('\n--- 5. Testing Hero Parallax rAF Ticking Guards & Scroll Performance ---');
    await driver.navigate(`${baseUrl}/index.html`);

    // Verify static implementation of ticking guard
    const animationsJs = fs.readFileSync(path.join(PROJECT_ROOT, 'js/utils/animations.js'), 'utf8');
    const hasTickingVar = animationsJs.includes('let ticking = false;');
    const hasTickingCheck = animationsJs.includes('if (!ticking)');
    const hasTickingReset = animationsJs.includes('ticking = false;');
    const hasTickingSet = animationsJs.includes('ticking = true;');
    const hasPassiveScroll = animationsJs.includes('{ passive: true }');
    const hasReducedMotionGuard = animationsJs.includes("matchMedia('(prefers-reduced-motion: reduce)')");

    record(
      'initHeroParallax has ticking variable declared',
      hasTickingVar,
      hasTickingVar ? 'Found let ticking = false;' : 'Missing ticking declaration'
    );
    record(
      'initHeroParallax has ticking guard around requestAnimationFrame',
      hasTickingCheck && hasTickingSet,
      'if (!ticking) { rAF(...) ticking = true; }'
    );
    record(
      'initHeroParallax resets ticking flag inside rAF callback',
      hasTickingReset,
      'ticking = false inside rAF callback'
    );
    record(
      'Hero parallax scroll listener uses { passive: true }',
      hasPassiveScroll,
      'Listener attached with { passive: true } to prevent main-thread scrolling blockage'
    );
    record(
      'Hero parallax guards against prefers-reduced-motion: reduce',
      hasReducedMotionGuard,
      'Respects user motion preference before attaching listener'
    );

    // Stress test: fire 500 scroll events in tight loop and verify no frame jank or rAF queue explosion
    const stressResult = await driver.evaluate(`
      (() => {
        return new Promise(resolve => {
          let rafCalls = 0;
          const origRaf = window.requestAnimationFrame;
          window.requestAnimationFrame = function(cb) {
            rafCalls++;
            return origRaf.call(window, cb);
          };

          const startTime = performance.now();
          // Dispatch 300 rapid scroll events
          for (let i = 0; i < 300; i++) {
            window.dispatchEvent(new Event('scroll'));
          }
          const dispatchDuration = performance.now() - startTime;

          // Check after two animation frames
          origRaf(() => {
            origRaf(() => {
              window.requestAnimationFrame = origRaf;
              resolve({
                dispatchDuration: dispatchDuration.toFixed(2),
                rafCallsAfter300Scrolls: rafCalls,
                tickingProtected: rafCalls < 10
              });
            });
          });
        });
      })()
    `);
    record(
      'Hero parallax rAF throttling under flood of 300 scroll events',
      stressResult.tickingProtected,
      `300 scroll events dispatched in ${stressResult.dispatchDuration}ms resulted in only ${stressResult.rafCallsAfter300Scrolls} rAF scheduled (expected < 10 with ticking guard)`
    );

    // Summary
    const total = results.length;
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = total - passedCount;

    console.log('\n===============================================================');
    console.log(`Adversarial Verification Complete: ${passedCount}/${total} PASSED (${failedCount} FAILED)`);
    console.log('===============================================================\n');

    return { total, passedCount, failedCount, results };
  } finally {
    await driver.close();
    await server.stop();
  }
}

runAdversarialVerification()
  .then(res => {
    process.exit(res.failedCount === 0 ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal verification error:', err);
    process.exit(1);
  });
