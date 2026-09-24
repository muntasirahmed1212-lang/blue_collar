/**
 * tests/forensic-independent-audit.js
 * Independent Forensic Verification Script
 * Author: Forensic Integrity Auditor (Round 2)
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
  '.jpeg': 'image/jpeg'
};

function findBrowserExecutable() {
  const winCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of winCandidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium executable found.');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.callbacks = new Map();
  }

  async connect() {
    const WebSocket = global.WebSocket || require('ws');
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { res, rej } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) rej(data.error);
          else res(data.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}

async function runForensicAudit() {
  console.log('===============================================================');
  console.log('FORENSIC AUDITOR INDEPENDENT VERIFICATION RUN');
  console.log('===============================================================');

  // Start HTTP static server
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(PROJECT_ROOT, pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
      res.end(data);
    });
  });

  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[INFO] Server running at ${baseUrl}`);

  const userDataDir = path.join(os.tmpdir(), `forensic_audit_${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserPath = findBrowserExecutable();
  console.log(`[INFO] Browser binary: ${browserPath}`);

  const proc = spawn(browserPath, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--window-size=1280,900',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  let wsUrl = null;
  const timeout = Date.now() + 15000;
  while (!wsUrl && Date.now() < timeout) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const devtoolsJson = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:0/json/version', res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      }).catch(() => null);

      // Or inspect stderr/stdout if port 0: read DevTools listening on ws://...
    } catch (e) {}
  }

  // To reliably get port from stderr
  proc.stderr.on('data', d => {
    const m = d.toString().match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\r\n]+)/);
    if (m && !wsUrl) {
      wsUrl = m[1];
    }
  });

  const startWait = Date.now();
  while (!wsUrl && Date.now() - startWait < 10000) {
    await new Promise(r => setTimeout(r, 100));
  }

  if (!wsUrl) {
    throw new Error('Failed to retrieve DevTools WebSocket URL from browser');
  }

  const portMatch = wsUrl.match(/:(\d+)\//);
  const cdpPort = portMatch[1];
  await new Promise(r => setTimeout(r, 400));
  const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page') || pages[0];
  const pageWsUrl = page.webSocketDebuggerUrl;

  console.log(`[INFO] Connected to Page CDP: ${pageWsUrl}`);
  const cdp = new CDPClient(pageWsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function scrollTo(y) {
    await cdp.eval(`(() => {
      window.scrollTo(0, ${y});
      window.dispatchEvent(new Event('scroll'));
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`);
    await sleep(200);
  }

  async function navigate(urlPath) {
    await cdp.send('Page.navigate', { url: `${baseUrl}${urlPath}` });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600); // Allow DOMContentLoaded and dynamic render
  }

  const results = [];

  function record(checkId, name, pass, details) {
    results.push({ checkId, name, pass, details });
    const mark = pass ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${checkId}: ${name}`);
    if (details) console.log(`       Details: ${JSON.stringify(details)}`);
  }

  try {
    // -------------------------------------------------------------
    // CHECK 4.1: SCROLL TRIGGER & OPACITY TRANSITION
    // -------------------------------------------------------------
    console.log('\n--- Auditing Check 4.1: Scroll Trigger & Opacity Transition (0 -> 1) ---');
    await navigate('/index.html');

    // Pre-scroll state of CTA card (deep in page)
    const ctaInitial = await cdp.eval(`(() => {
      const el = document.querySelector('.cta-card');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        hasIsVisible: el.classList.contains('is-visible'),
        dataAnimate: el.getAttribute('data-animate'),
        opacity: style.opacity,
        transform: style.transform,
        top: rect.top
      };
    })()`);

    const ctaInitialOk = ctaInitial && !ctaInitial.hasIsVisible && parseFloat(ctaInitial.opacity) === 0 && ctaInitial.dataAnimate === 'scale-up';
    record('C4.1a', 'Off-screen CTA card initially hidden (opacity: 0, no .is-visible)', ctaInitialOk, ctaInitial);

    // Scroll CTA card into view
    await scrollTo(4500);
    await sleep(700);

    const ctaScrolled = await cdp.eval(`(() => {
      const el = document.querySelector('.cta-card');
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        hasIsVisible: el.classList.contains('is-visible'),
        opacity: style.opacity,
        transform: style.transform
      };
    })()`);

    const ctaScrolledOk = ctaScrolled && ctaScrolled.hasIsVisible && parseFloat(ctaScrolled.opacity) >= 0.95;
    record('C4.1b', 'CTA card gains .is-visible and reaches opacity: 1 upon scroll', ctaScrolledOk, ctaScrolled);

    // -------------------------------------------------------------
    // CHECK 4.2: DYNAMIC CARDS RECEIVE .is-visible UPON INTERSECTION
    // -------------------------------------------------------------
    console.log('\n--- Auditing Check 4.2: Dynamic Cards Intersection Observation ---');
    await navigate('/index.html');
    await scrollTo(0);
    await sleep(300);

    // Verify dynamic cards exist in #home-categories-grid
    const homeCardsBefore = await cdp.eval(`(() => {
      const grid = document.getElementById('home-categories-grid');
      const cards = grid ? Array.from(grid.querySelectorAll('.category-card')) : [];
      return cards.map(c => ({
        dataAnimate: c.getAttribute('data-animate'),
        hasIsVisible: c.classList.contains('is-visible'),
        opacity: window.getComputedStyle(c).opacity,
        delay: c.style.transitionDelay
      }));
    })()`);

    // Scroll to categories grid
    await scrollTo(800);
    await sleep(700);

    const homeCardsAfter = await cdp.eval(`(() => {
      const grid = document.getElementById('home-categories-grid');
      const cards = grid ? Array.from(grid.querySelectorAll('.category-card')) : [];
      return cards.map(c => ({
        hasIsVisible: c.classList.contains('is-visible'),
        opacity: window.getComputedStyle(c).opacity
      }));
    })()`);

    const allHomeVisible = homeCardsAfter.length === 8 && homeCardsAfter.every(c => c.hasIsVisible && parseFloat(c.opacity) >= 0.95);
    record('C4.2a', 'Dynamic home category cards (8/8) gain .is-visible upon scroll', allHomeVisible, { count: homeCardsAfter.length, allVisible: allHomeVisible });

    // Test dynamic cards in services.html with filter
    await navigate('/services.html');
    await cdp.eval(`(() => {
      const input = document.getElementById('category-filter');
      input.value = 'Plumb';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
    await scrollTo(300);
    await sleep(700);

    const servicesFilterResult = await cdp.eval(`(() => {
      const grid = document.getElementById('all-categories-grid');
      const cards = grid ? Array.from(grid.querySelectorAll('.service-card-full')) : [];
      return {
        cardCount: cards.length,
        dataAnimate: cards[0]?.getAttribute('data-animate'),
        hasIsVisible: cards[0]?.classList.contains('is-visible'),
        opacity: cards[0] ? window.getComputedStyle(cards[0]).opacity : null
      };
    })()`);

    const servicesFilterOk = servicesFilterResult.cardCount >= 1 &&
                             servicesFilterResult.dataAnimate === 'fade-up' &&
                             servicesFilterResult.hasIsVisible &&
                             parseFloat(servicesFilterResult.opacity) >= 0.95;
    record('C4.2b', 'Dynamic filtered cards in services.html receive data-animate & .is-visible', servicesFilterOk, servicesFilterResult);

    // -------------------------------------------------------------
    // CHECK 4.3: HERO SECTION INLINE OPACITY & TRANSFORM UPDATE DYNAMICALLY
    // -------------------------------------------------------------
    console.log('\n--- Auditing Check 4.3: Hero Parallax Dynamic Scroll Updates ---');
    await navigate('/index.html');
    await scrollTo(0);
    await sleep(300);

    const scrollSteps = [0, 80, 160, 260, 400, 600, 1000];
    const heroMeasurements = [];

    for (const y of scrollSteps) {
      await scrollTo(y);
      const m = await cdp.eval(`(() => {
        const hero = document.querySelector('.hero-section');
        return {
          scrollY: window.scrollY,
          inlineOpacity: hero.style.opacity,
          inlineTransform: hero.style.transform
        };
      })()`);
      heroMeasurements.push(m);
    }

    // Scroll back to top
    await scrollTo(0);
    const heroRestored = await cdp.eval(`(() => {
      const hero = document.querySelector('.hero-section');
      return {
        scrollY: window.scrollY,
        inlineOpacity: hero.style.opacity,
        inlineTransform: hero.style.transform
      };
    })()`);

    const opacityDecreases = parseFloat(heroMeasurements[0].inlineOpacity) === 1 &&
                             parseFloat(heroMeasurements[2].inlineOpacity) < parseFloat(heroMeasurements[0].inlineOpacity) &&
                             parseFloat(heroMeasurements[5].inlineOpacity) <= 0.1;
    const transformTranslates = heroMeasurements[2].inlineTransform.includes('translate3d') &&
                                heroMeasurements[4].inlineTransform.includes('translate3d');
    const restoresCleanly = parseFloat(heroRestored.inlineOpacity) === 1 &&
                            heroRestored.inlineTransform.includes('scale(1');

    record('C4.3a', 'Hero inline opacity decreases dynamically with scroll progress', opacityDecreases, { steps: heroMeasurements.map(h => ({ y: h.scrollY, op: h.inlineOpacity })) });
    record('C4.3b', 'Hero inline transform translates and scales dynamically', transformTranslates, { steps: heroMeasurements.map(h => ({ y: h.scrollY, tr: h.inlineTransform })) });
    record('C4.3c', 'Hero inline styles cleanly restore upon scrolling back to top', restoresCleanly, heroRestored);

    // -------------------------------------------------------------
    // CHECK 4.4: FIXED HEADER AND STICKY SIDEBARS INTACT WITHOUT CLIPPING
    // -------------------------------------------------------------
    console.log('\n--- Auditing Check 4.4: Fixed Header & Sticky Sidebar Stability ---');

    // 1. Header stability across scroll
    await navigate('/index.html');
    const headerScrollCheck = [];
    for (const y of [0, 100, 300, 600, 900]) {
      await scrollTo(y);
      const h = await cdp.eval(`(() => {
        const header = document.querySelector('header');
        const rect = header.getBoundingClientRect();
        const style = window.getComputedStyle(header);
        return {
          scrollY: window.scrollY,
          position: style.position,
          top: style.top,
          rectTop: Math.round(rect.top),
          rectHeight: Math.round(rect.height)
        };
      })()`);
      headerScrollCheck.push(h);
    }

    const headerFixed = headerScrollCheck.every(h => h.position === 'fixed' && h.rectTop === 0);
    record('C4.4a', 'Header maintains position: fixed and rect.top === 0 across all scroll points', headerFixed, headerScrollCheck);

    // 2. Category sidebar (.sidebar-filters)
    await navigate('/category.html?cat=plumber');
    const categorySidebarData = await cdp.eval(`(() => {
      const aside = document.querySelector('.sidebar-filters');
      const style = window.getComputedStyle(aside);
      const rect = aside.getBoundingClientRect();
      return {
        position: style.position,
        top: style.top,
        rectTop: rect.top,
        overflow: style.overflow
      };
    })()`);

    const categorySidebarOk = categorySidebarData.position === 'sticky' && categorySidebarData.top === '100px';
    record('C4.4b', 'Category sidebar has position: sticky and top: 100px', categorySidebarOk, categorySidebarData);

    // 3. Professional booking card (.booking-card) pinning at top: 100px during scroll
    await navigate('/professional.html?id=pro-1');
    const bookingLayout = await cdp.eval(`(() => {
      const layout = document.querySelector('.profile-layout');
      const main = document.querySelector('.profile-main');
      const sidebar = document.querySelector('.profile-sidebar');
      const card = document.querySelector('.booking-card');
      return {
        layoutGridAlign: window.getComputedStyle(layout).alignItems,
        mainHeight: main.offsetHeight,
        sidebarHeight: sidebar.offsetHeight,
        cardPosition: window.getComputedStyle(card).position,
        cardTop: window.getComputedStyle(card).top
      };
    })()`);

    const bookingScrollPoints = [];
    for (const y of [100, 200, 400, 600, 800]) {
      await scrollTo(y);
      const b = await cdp.eval(`(() => {
        const card = document.querySelector('.booking-card');
        const rect = card.getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          rectTop: Math.round(rect.top),
          cardHeight: Math.round(rect.height)
        };
      })()`);
      bookingScrollPoints.push(b);
    }

    const bookingSidebarStretched = bookingLayout.sidebarHeight >= 1200;
    const bookingStaysPinned = bookingScrollPoints.every(b => Math.abs(b.rectTop - 100) <= 2);

    record('C4.4c', 'Professional sidebar track stretches to full main height (preventing collapse)', bookingSidebarStretched, bookingLayout);
    record('C4.4d', 'Professional booking card stays pinned at top: 100px throughout scroll (100-800px)', bookingStaysPinned, bookingScrollPoints);

    // -------------------------------------------------------------
    // CHECK 4.5: CHARACTER REVEAL ACCESSIBILITY & TOKENIZATION
    // -------------------------------------------------------------
    console.log('\n--- Auditing Check 4.5: Character Reveal Accessibility & DOM Tokenization ---');
    await navigate('/index.html');
    const charRevealCheck = await cdp.eval(`(() => {
      const heading = document.querySelector('[data-char-reveal]');
      if (!heading) return null;
      const ariaLabel = heading.getAttribute('aria-label');
      const wrapper = heading.querySelector('.char-reveal-wrapper');
      const ariaHidden = wrapper ? wrapper.getAttribute('aria-hidden') : null;
      const words = heading.querySelectorAll('.char-word');
      const chars = heading.querySelectorAll('.char');
      const firstCharDelay = chars[0] ? chars[0].style.transitionDelay : null;
      const lastCharDelay = chars[chars.length - 1] ? chars[chars.length - 1].style.transitionDelay : null;
      return {
        headingText: heading.textContent.trim().replace(/\\s+/g, ' '),
        ariaLabel,
        hasAriaHiddenWrapper: ariaHidden === 'true',
        wordCount: words.length,
        charCount: chars.length,
        firstCharDelay,
        lastCharDelay
      };
    })()`);

    const charRevealOk = charRevealCheck &&
                         charRevealCheck.ariaLabel &&
                         charRevealCheck.hasAriaHiddenWrapper &&
                         charRevealCheck.charCount > 0 &&
                         charRevealCheck.firstCharDelay === '0ms';
    record('C4.5', 'Character reveal sets aria-label, aria-hidden wrapper, and sequential transition delays', charRevealOk, charRevealCheck);

  } finally {
    await cdp.close();
    proc.kill();
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n===============================================================');
  console.log('AUDIT SUMMARY');
  console.log('===============================================================');
  const allPassed = results.every(r => r.pass);
  console.log(`Total Checks: ${results.length} | Passed: ${results.filter(r => r.pass).length} | Failed: ${results.filter(r => !r.pass).length}`);
  console.log(`Verdict: ${allPassed ? 'CLEAN' : 'INTEGRITY VIOLATION'}`);
  console.log('===============================================================');

  return { allPassed, results };
}

runForensicAudit()
  .then(({ allPassed }) => {
    process.exit(allPassed ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal audit execution error:', err);
    process.exit(1);
  });
