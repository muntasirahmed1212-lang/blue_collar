// independent_audit_test.js
// Independent Victory Auditor Verification Suite
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const net = require('net');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function startServer(port, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'server.js')], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PORT: String(port), ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error(`Server timed out starting on port ${port}. Output:\n${stdout}\n${stderr}`));
      }
    }, 12000);

    child.stdout.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      if (str.includes(`http://localhost:${port}`) || str.includes('BlueCollar Connect server running')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ child, baseUrl: `http://127.0.0.1:${port}` });
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Server exited prematurely with code ${code}. Output:\n${stdout}\n${stderr}`));
      }
    });
  });
}

async function runAudit() {
  console.log('=== RUNNING INDEPENDENT VICTORY AUDIT CHECKS ===\n');

  // Check 1: vercel.json
  console.log('[1/6] Auditing vercel.json...');
  const vercelRaw = fs.readFileSync(path.join(PROJECT_ROOT, 'vercel.json'), 'utf8');
  const vercel = JSON.parse(vercelRaw);
  assert.ok(Array.isArray(vercel.rewrites), 'rewrites array missing in vercel.json');
  const apiRewrite = vercel.rewrites.find(r => r.source === '/api/:path*');
  assert.ok(apiRewrite, 'rewrite rule for /api/:path* missing in vercel.json');
  assert.ok(apiRewrite.destination.includes('.onrender.com/api/:path*'), 'rewrite destination must route to onrender.com URL');
  
  assert.ok(Array.isArray(vercel.headers), 'headers array missing in vercel.json');
  const apiHeader = vercel.headers.find(h => h.source === '/api/:path*');
  assert.ok(apiHeader, 'header rule for /api/:path* missing in vercel.json');
  const cacheControl = apiHeader.headers.find(h => h.key.toLowerCase() === 'cache-control');
  assert.ok(cacheControl && cacheControl.value === 'no-store', 'Cache-Control: no-store header missing in vercel.json');
  console.log('  -> PASS: vercel.json rewrites and headers verified.');

  // Check 2: render.yaml
  console.log('[2/6] Auditing render.yaml...');
  const renderYaml = fs.readFileSync(path.join(PROJECT_ROOT, 'render.yaml'), 'utf8');
  assert.ok(renderYaml.includes('startCommand: npm start') || renderYaml.includes('startCommand: node server.js'), 'startCommand missing in render.yaml');
  const frontendUrlPattern = /-\s*key:\s*FRONTEND_URL\s*\n\s*sync:\s*false/m;
  assert.ok(frontendUrlPattern.test(renderYaml), 'FRONTEND_URL with sync: false missing in render.yaml');
  console.log('  -> PASS: render.yaml configuration verified.');

  // Check 3: api/auth.js deletion
  console.log('[3/6] Auditing api/auth.js deletion...');
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, 'api', 'auth.js')), false, 'api/auth.js MUST be deleted');
  console.log('  -> PASS: api/auth.js does not exist.');

  // Check 4: Forbidden files diff
  console.log('[4/6] Auditing forbidden files immutability...');
  const diffAuthService = execSync('git diff HEAD -- js/services/authService.js', { cwd: PROJECT_ROOT }).toString().trim();
  const diffAuthUI = execSync('git diff HEAD -- js/components/authUI.js', { cwd: PROJECT_ROOT }).toString().trim();
  assert.equal(diffAuthService, '', 'js/services/authService.js was modified!');
  assert.equal(diffAuthUI, '', 'js/components/authUI.js was modified!');
  console.log('  -> PASS: js/services/authService.js and js/components/authUI.js have 0 diff from HEAD.');

  // Check 5: Production static serving disabled
  console.log('[5/6] Auditing server.js in production mode (NODE_ENV=production)...');
  const prodPort = await getFreePort();
  const prodServer = await startServer(prodPort, { NODE_ENV: 'production', FRONTEND_URL: 'https://example.vercel.app' });
  try {
    const rootRes = await fetch(`${prodServer.baseUrl}/`);
    assert.equal(rootRes.status, 404, `Expected 404 for GET / in production, got ${rootRes.status}`);

    const staticRes = await fetch(`${prodServer.baseUrl}/jobs.html`);
    assert.equal(staticRes.status, 404, `Expected 404 for GET /jobs.html in production, got ${staticRes.status}`);

    const cssRes = await fetch(`${prodServer.baseUrl}/css/variables.css`);
    assert.equal(cssRes.status, 404, `Expected 404 for GET /css/variables.css in production, got ${cssRes.status}`);

    const apiRes = await fetch(`${prodServer.baseUrl}/api/jobs`);
    assert.equal(apiRes.status, 200, `Expected 200 for GET /api/jobs in production, got ${apiRes.status}`);
    const apiData = await apiRes.json();
    assert.equal(apiData.success, true);
    console.log('  -> PASS: Static files 404 in production, API endpoints functional (200).');
  } finally {
    prodServer.child.kill();
  }

  // Check 6: Development static serving enabled
  console.log('[6/6] Auditing server.js in development mode (NODE_ENV=development)...');
  const devPort = await getFreePort();
  const devServer = await startServer(devPort, { NODE_ENV: 'development' });
  try {
    const rootRes = await fetch(`${devServer.baseUrl}/`);
    assert.equal(rootRes.status, 200, `Expected 200 for GET / in development, got ${rootRes.status}`);

    const staticRes = await fetch(`${devServer.baseUrl}/jobs.html`);
    assert.equal(staticRes.status, 200, `Expected 200 for GET /jobs.html in development, got ${staticRes.status}`);

    const cssRes = await fetch(`${devServer.baseUrl}/css/variables.css`);
    assert.equal(cssRes.status, 200, `Expected 200 for GET /css/variables.css in development, got ${cssRes.status}`);
    console.log('  -> PASS: Static files return 200 in development mode.');
  } finally {
    devServer.child.kill();
  }

  console.log('\n=== ALL INDEPENDENT VICTORY AUDIT CHECKS PASSED ===');
}

runAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
