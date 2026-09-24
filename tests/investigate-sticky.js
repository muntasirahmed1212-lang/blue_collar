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
  '.svg': 'image/svg+xml'
};

function findBrowser() {
  const winCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of winCandidates) if (fs.existsSync(p)) return p;
  throw new Error('No browser');
}

async function run() {
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(PROJECT_ROOT, pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'text/plain' });
      res.end(data);
    });
  });

  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  const baseUrl = `http://127.0.0.1:${port}`;
  const userDataDir = path.join(os.tmpdir(), `investigate_sticky_${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const proc = spawn(findBrowser(), [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--window-size=1280,900',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  const wsUrl = await new Promise((resolve) => {
    proc.stderr.on('data', chunk => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/);
      if (match) resolve(match[1]);
    });
  });

  const portMatch = wsUrl.match(/:(\d+)\//);
  const listRes = await fetch(`http://127.0.0.1:${portMatch[1]}/json/list`);
  const pages = await listRes.json();
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);

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

  async function evaluate(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails);
    }
    return res.result?.value;
  }

  async function navigate(url) {
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('=== INVESTIGATING category.html STICKY ===');
  await navigate(`${baseUrl}/category.html?cat=plumber`);
  await new Promise(r => setTimeout(r, 400));

  const diag = await evaluate(`
    (() => {
      const sb = document.querySelector('.sidebar-filters');
      const layout = document.querySelector('.layout-with-sidebar');
      const section = sb.closest('section');
      const main = document.querySelector('main');
      const body = document.body;
      const html = document.documentElement;

      function getChain(el) {
        const chain = [];
        let curr = el;
        while (curr) {
          const cs = window.getComputedStyle(curr);
          chain.push({
            tag: curr.tagName,
            cls: curr.className,
            overflow: cs.overflow,
            overflowX: cs.overflowX,
            overflowY: cs.overflowY,
            transform: cs.transform,
            position: cs.position,
            display: cs.display,
            height: cs.height,
            offsetHeight: curr.offsetHeight,
            scrollHeight: curr.scrollHeight
          });
          curr = curr.parentElement;
        }
        return chain;
      }

      return {
        chain: getChain(sb),
        sbTransform: window.getComputedStyle(sb).transform,
        sbWillChange: window.getComputedStyle(sb).willChange
      };
    })()
  `);
  console.log('Hierarchy chain from .sidebar-filters up:');
  diag.chain.forEach(c => console.log(`  ${c.tag}.${c.cls}: pos=${c.position} overflow=${c.overflow}/${c.overflowX}/${c.overflowY} transform=${c.transform} h=${c.offsetHeight}/${c.height}`));

  console.log('\nTesting scroll behavior now:');
  for (const sy of [0, 200, 250, 300, 400, 500]) {
    await evaluate(`window.scrollTo(0, ${sy})`);
    const r = await evaluate(`
      (() => {
        const sb = document.querySelector('.sidebar-filters');
        return {
          scrollY: window.scrollY,
          rectTop: sb.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`scrollY: ${r.scrollY} -> rect.top: ${r.rectTop}`);
  }

  console.log('\n--- Experiment: remove transform from .sidebar-filters ---');
  await evaluate(`
    document.querySelector('.sidebar-filters').style.transform = 'none';
  `);
  for (const sy of [0, 200, 250, 300, 400, 500]) {
    await evaluate(`window.scrollTo(0, ${sy})`);
    const r = await evaluate(`
      (() => {
        const sb = document.querySelector('.sidebar-filters');
        return {
          scrollY: window.scrollY,
          rectTop: sb.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`[without transform] scrollY: ${r.scrollY} -> rect.top: ${r.rectTop}`);
  }

  console.log('\n=== INVESTIGATING professional.html STICKY ===');
  await navigate(`${baseUrl}/professional.html?id=pro-1`);
  await new Promise(r => setTimeout(r, 400));

  const proDiag = await evaluate(`
    (() => {
      const card = document.querySelector('.booking-card');
      function getChain(el) {
        const chain = [];
        let curr = el;
        while (curr) {
          const cs = window.getComputedStyle(curr);
          chain.push({
            tag: curr.tagName,
            cls: curr.className,
            overflow: cs.overflow,
            overflowX: cs.overflowX,
            overflowY: cs.overflowY,
            transform: cs.transform,
            position: cs.position,
            display: cs.display,
            height: cs.height,
            offsetHeight: curr.offsetHeight
          });
          curr = curr.parentElement;
        }
        return chain;
      }
      return getChain(card);
    })()
  `);
  console.log('Hierarchy chain from .booking-card up:');
  proDiag.forEach(c => console.log(`  ${c.tag}.${c.cls}: pos=${c.position} overflow=${c.overflow}/${c.overflowX}/${c.overflowY} transform=${c.transform} h=${c.offsetHeight}/${c.height}`));

  console.log('\nTesting booking-card scroll behavior:');
  for (const sy of [0, 100, 200, 300, 400, 500, 700]) {
    await evaluate(`window.scrollTo(0, ${sy})`);
    const r = await evaluate(`
      (() => {
        const card = document.querySelector('.booking-card');
        return {
          scrollY: window.scrollY,
          rectTop: card.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`scrollY: ${r.scrollY} -> rect.top: ${r.rectTop}`);
  }

  console.log('\n--- Experiment: remove transform from .booking-card ---');
  await evaluate(`document.querySelector('.booking-card').style.transform = 'none';`);
  for (const sy of [0, 100, 200, 300, 400, 500, 700]) {
    await evaluate(`window.scrollTo(0, ${sy})`);
    const r = await evaluate(`
      (() => {
        const card = document.querySelector('.booking-card');
        return {
          scrollY: window.scrollY,
          rectTop: card.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`[without transform] scrollY: ${r.scrollY} -> rect.top: ${r.rectTop}`);
  }

  console.log('\n--- Experiment: fix .profile-layout align-items or height ---');
  await evaluate(`
    document.querySelector('.profile-layout').style.alignItems = 'stretch';
    document.querySelector('.profile-sidebar').style.height = '100%';
  `);
  for (const sy of [0, 100, 200, 300, 400, 500, 700]) {
    await evaluate(`window.scrollTo(0, ${sy})`);
    const r = await evaluate(`
      (() => {
        const card = document.querySelector('.booking-card');
        return {
          scrollY: window.scrollY,
          rectTop: card.getBoundingClientRect().top
        };
      })()
    `);
    console.log(`[with stretch + 100% height] scrollY: ${r.scrollY} -> rect.top: ${r.rectTop}`);
  }

  ws.close();
  proc.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  server.close();
}

run().catch(console.error);
