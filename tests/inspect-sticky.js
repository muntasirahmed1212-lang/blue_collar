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
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of winCandidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium executable found.');
}

async function inspectSticky() {
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(PROJECT_ROOT, pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
      res.end(data);
    });
  });

  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  const baseUrl = `http://127.0.0.1:${port}`;
  const userDataDir = path.join(os.tmpdir(), `inspect_sticky_${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const proc = spawn(findBrowserExecutable(), [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--window-size=1280,900',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  const wsUrl = await new Promise((resolve, reject) => {
    proc.stderr.on('data', chunk => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/);
      if (match) resolve(match[1]);
    });
    setTimeout(() => reject('timeout starting browser'), 10000);
  });

  const portMatch = wsUrl.match(/:(\d+)\//);
  const listRes = await fetch(`http://127.0.0.1:${portMatch[1]}/json/list`);
  const pages = await listRes.json();
  const pageWs = pages[0].webSocketDebuggerUrl;

  const ws = new WebSocket(pageWs);
  let msgId = 0;
  const callbacks = new Map();
  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data.result);
      callbacks.delete(data.id);
    }
  };
  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = ++msgId;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return res.result?.value;
  }

  async function navigate(url) {
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('--- Inspecting category.html ---');
  await navigate(`${baseUrl}/category.html?cat=plumber`);
  const catDetails = await evaluate(`
    (() => {
      const sb = document.querySelector('.sidebar-filters');
      const layout = document.querySelector('.layout-with-sidebar');
      const main = document.querySelector('.main-content');
      const pros = document.querySelectorAll('#pros-grid .pro-card');
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        proCardCount: pros.length,
        sbHeight: sb.offsetHeight,
        sbOffsetTop: sb.offsetTop,
        mainHeight: main.offsetHeight,
        layoutHeight: layout.offsetHeight,
        layoutDisplay: window.getComputedStyle(layout).display,
        layoutGridCols: window.getComputedStyle(layout).gridTemplateColumns,
        sbComputedPosition: window.getComputedStyle(sb).position,
        sbComputedTop: window.getComputedStyle(sb).top,
        sbRectInitial: sb.getBoundingClientRect().top
      };
    })()
  `);
  console.log('Category Page DOM Metrics:', catDetails);

  console.log('\n--- Scrolling category.html ---');
  for (const y of [0, 100, 200, 250, 300, 400, 600]) {
    await evaluate(`window.scrollTo(0, ${y})`);
    await new Promise(r => setTimeout(r, 50));
    const r = await evaluate(`
      (() => {
        const sb = document.querySelector('.sidebar-filters');
        return {
          scrollY: window.scrollY,
          rectTop: sb.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`ScrollY ${r.scrollY}: rectTop = ${r.rectTop}`);
  }

  console.log('\n--- Inspecting professional.html ---');
  await navigate(`${baseUrl}/professional.html?id=pro-1`);
  const proDetails = await evaluate(`
    (() => {
      const card = document.querySelector('.booking-card');
      const sidebar = document.querySelector('.profile-sidebar');
      const layout = document.querySelector('.profile-layout');
      const main = document.querySelector('.profile-main');
      return {
        viewportWidth: window.innerWidth,
        cardHeight: card.offsetHeight,
        sidebarHeight: sidebar.offsetHeight,
        mainHeight: main.offsetHeight,
        layoutHeight: layout.offsetHeight,
        layoutAlignItems: window.getComputedStyle(layout).alignItems,
        cardPosition: window.getComputedStyle(card).position,
        cardTop: window.getComputedStyle(card).top,
        sidebarPosition: window.getComputedStyle(sidebar).position,
        cardRectInitial: card.getBoundingClientRect().top
      };
    })()
  `);
  console.log('Professional Page DOM Metrics:', proDetails);

  console.log('\n--- Scrolling professional.html ---');
  for (const y of [0, 100, 200, 300, 400, 600, 800]) {
    await evaluate(`window.scrollTo(0, ${y})`);
    await new Promise(r => setTimeout(r, 50));
    const r = await evaluate(`
      (() => {
        const card = document.querySelector('.booking-card');
        return {
          scrollY: window.scrollY,
          rectTop: card.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`ScrollY ${r.scrollY}: rectTop = ${r.rectTop}`);
  }

  ws.close();
  proc.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  server.close();
}

inspectSticky().catch(console.error);
