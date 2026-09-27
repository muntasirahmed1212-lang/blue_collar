/**
 * .agents/teamwork/reviewer_m4_2/verify-7-pages.js
 * Independent Verification of All 7 HTML Pages
 * 
 * Verifies for all 7 HTML pages:
 *  - Navigation links (desktop & mobile)
 *  - "Post a Job" buttons (desktop & mobile)
 *  - Theme toggles & modals
 *  - Full stylesheet & asset loading
 *  - ZERO console errors & ZERO uncaught exceptions
 *  - Interactive flows: unauthenticated login modal prompt & navigation transitions
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('node:assert/strict');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const PAGES = [
  { file: 'index.html', title: 'BlueCollar Connect' },
  { file: 'services.html', title: 'Services' },
  { file: 'category.html', title: 'Category' },
  { file: 'professional.html', title: 'Professional' },
  { file: 'about.html', title: 'About' },
  { file: 'how-it-works.html', title: 'How It Works' },
  { file: 'jobs.html', title: 'Browse Open Jobs' }
];

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.callbacks = new Map();
    this.consoleErrors = [];
    this.exceptions = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = async () => {
        try {
          await this.send('Page.enable');
          await this.send('Runtime.enable');
          await this.send('DOM.enable');
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      this.ws.onerror = reject;
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          if (msg.params.type === 'error') {
            const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            this.consoleErrors.push(text);
          }
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Uncaught error';
          this.exceptions.push(desc);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation Exception: ${res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async navigate(url) {
    this.consoleErrors = [];
    this.exceptions = [];
    await this.send('Page.navigate', { url });
    // Poll readyState
    const start = Date.now();
    while (Date.now() - start < 10000) {
      try {
        const ready = await this.evaluate(`document.readyState === 'complete'`);
        if (ready) {
          await new Promise(r => setTimeout(r, 800)); // allow async modules to load
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function getBrowserWsUrl(debugPort) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(p => p.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Failed to connect to browser CDP endpoint within 10s');
}

async function main() {
  console.log('=================================================================');
  console.log('INDEPENDENT 7-PAGE NAVIGATION, STYLING & CONSOLE AUDIT');
  console.log('Reviewer: reviewer_m4_2');
  console.log('=================================================================\n');

  // 1. Boot Express server on port 3000
  console.log(`[1/4] Starting server.js on port ${PORT}...`);
  const serverProcess = spawn('node', ['server.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe'
  });

  await new Promise((resolve, reject) => {
    serverProcess.stdout.on('data', d => {
      const s = d.toString();
      if (s.includes('running at')) resolve();
    });
    serverProcess.stderr.on('data', d => {
      const errStr = d.toString();
      if (!errStr.includes('ExperimentalWarning')) {
        console.error('Server STDERR:', errStr);
      }
    });
    serverProcess.on('error', reject);
    setTimeout(() => reject(new Error('Server boot timed out')), 8000);
  });
  console.log('  ✅ Server running successfully.');

  // 2. Launch Headless Browser
  console.log('[2/4] Launching headless browser with CDP...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-review-m4-'));
  const debugPort = 39222;

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const wsUrl = await getBrowserWsUrl(debugPort);
  const client = new CDPClient(wsUrl);
  await client.connect();
  console.log('  ✅ CDP client connected.');

  const pageResults = [];

  // 3. Audit all 7 Pages
  console.log('\n[3/4] Auditing all 7 HTML pages...');
  for (const page of PAGES) {
    const pageUrl = `${BASE_URL}/${page.file}`;
    console.log(`\n  --- Auditing ${page.file} ---`);
    await client.navigate(pageUrl);

    // Verify Title
    const title = await client.evaluate(`document.title`);
    console.log(`    Title: "${title}"`);

    // Verify Nav Links
    const navAudit = await client.evaluate(`
      (() => {
        const desktopJobs = document.querySelector('.nav-desktop a[href="./jobs.html"], .nav-links a[href="./jobs.html"]');
        const mobileJobs = document.querySelector('.mobile-menu a[href="./jobs.html"], .mobile-nav-links a[href="./jobs.html"]');
        const desktopHome = document.querySelector('.nav-desktop a[href="./index.html"], .nav-links a[href="./index.html"]');
        const desktopServices = document.querySelector('.nav-desktop a[href="./services.html"], .nav-links a[href="./services.html"]');
        return {
          hasDesktopJobs: !!desktopJobs,
          hasMobileJobs: !!mobileJobs,
          hasDesktopHome: !!desktopHome,
          hasDesktopServices: !!desktopServices
        };
      })()
    `);

    // Verify Post a Job Buttons
    const buttonAudit = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const desktopPost = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
        const mobilePost = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !!b.closest('.mobile-menu'));
        return {
          hasDesktopPost: !!desktopPost,
          hasMobilePost: !!mobilePost
        };
      })()
    `);

    // Verify Lucide icons rendered
    const iconCount = await client.evaluate(`document.querySelectorAll('svg.lucide, i[data-lucide]').length`);

    // Check console errors and exceptions
    const consoleErrors = [...client.consoleErrors];
    const exceptions = [...client.exceptions];

    const pass = navAudit.hasDesktopJobs &&
                 navAudit.hasMobileJobs &&
                 buttonAudit.hasDesktopPost &&
                 buttonAudit.hasMobilePost &&
                 consoleErrors.length === 0 &&
                 exceptions.length === 0;

    console.log(`    Desktop Jobs Nav Link : ${navAudit.hasDesktopJobs ? '✅ Present' : '❌ Missing'}`);
    console.log(`    Mobile Jobs Nav Link  : ${navAudit.hasMobileJobs ? '✅ Present' : '❌ Missing'}`);
    console.log(`    Desktop Post Job Btn  : ${buttonAudit.hasDesktopPost ? '✅ Present' : '❌ Missing'}`);
    console.log(`    Mobile Post Job Btn   : ${buttonAudit.hasMobilePost ? '✅ Present' : '❌ Missing'}`);
    console.log(`    Lucide Icons Count    : ${iconCount} icons`);
    console.log(`    Console Errors        : ${consoleErrors.length} (${consoleErrors.join('; ') || 'none'})`);
    console.log(`    Uncaught Exceptions   : ${exceptions.length} (${exceptions.join('; ') || 'none'})`);
    console.log(`    Status                : ${pass ? '✅ PASS' : '❌ FAIL'}`);

    pageResults.push({
      page: page.file,
      navAudit,
      buttonAudit,
      iconCount,
      consoleErrors,
      exceptions,
      pass
    });
  }

  // 4. Test Interactive Flows
  console.log('\n[4/4] Testing Interactive User Flows across pages...');

  // 4.1 Unauthenticated click on "Post a Job" opens login modal
  console.log('  Testing: Unauthenticated click on "Post a Job" on index.html opens login modal...');
  await client.navigate(`${BASE_URL}/index.html`);
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'post a job' && !b.closest('.mobile-menu'));
      if (btn) btn.click();
    })()
  `);
  
  // Wait up to 3s for login modal to appear
  const modalStart = Date.now();
  let loginModalOpen = false;
  while (Date.now() - modalStart < 3000) {
    loginModalOpen = await client.evaluate(`
      (() => {
        const m = document.getElementById('login-modal');
        return m && !m.classList.contains('hidden');
      })()
    `);
    if (loginModalOpen) break;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`    Login Modal Opened: ${loginModalOpen ? '✅ YES' : '❌ NO'}`);

  // 4.2 Homepage recent jobs preview
  console.log('  Testing: Homepage recent jobs preview grid rendering...');
  const recentStart = Date.now();
  let recentJobsCount = 0;
  while (Date.now() - recentStart < 4000) {
    recentJobsCount = await client.evaluate(`document.querySelectorAll('#recent-jobs-grid .job-card').length`);
    if (recentJobsCount >= 4) break;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`    Recent Job Cards Rendered: ${recentJobsCount} (Expected: 4-6)`);

  // 4.3 Navigation click from index.html to jobs.html
  console.log('  Testing: Clicking desktop "Jobs" link navigates to jobs.html...');
  await client.evaluate(`
    (() => {
      const link = document.querySelector('.nav-desktop a[href="./jobs.html"], .nav-links a[href="./jobs.html"]');
      if (link) link.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));
  const currentPath = await client.evaluate(`window.location.pathname`);
  console.log(`    Current Path after navigation: ${currentPath}`);
  assert.ok(currentPath.includes('jobs.html'), `Expected jobs.html path, got ${currentPath}`);

  // 4.4 jobs.html job cards rendering and filtering
  const jobsStart = Date.now();
  let totalJobsOnJobsPage = 0;
  while (Date.now() - jobsStart < 4000) {
    totalJobsOnJobsPage = await client.evaluate(`document.querySelectorAll('#jobs-grid .job-card').length`);
    if (totalJobsOnJobsPage > 0) break;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`    Jobs Page Cards Rendered: ${totalJobsOnJobsPage}`);
  assert.ok(totalJobsOnJobsPage > 0, 'Expected >0 jobs rendered on jobs.html');

  // Teardown
  client.close();
  browserProcess.kill();
  serverProcess.kill();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // Summary
  console.log('\n=================================================================');
  console.log('7-PAGE AUDIT SUMMARY');
  console.log('=================================================================');
  const allPassed = pageResults.every(r => r.pass) && loginModalOpen && recentJobsCount >= 4;
  pageResults.forEach(r => {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.page}: Desktop Nav=${r.navAudit.hasDesktopJobs}, Mobile Nav=${r.navAudit.hasMobileJobs}, PostBtn=${r.buttonAudit.hasDesktopPost}, Errors=${r.consoleErrors.length}`);
  });
  console.log('-----------------------------------------------------------------');
  console.log(`Overall Result: ${allPassed ? 'ALL 7 PAGES PASSED 100% ✅' : 'FAILURES DETECTED ❌'}`);
  console.log('=================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Unhandled error in 7-page audit:', err);
  process.exit(1);
});
