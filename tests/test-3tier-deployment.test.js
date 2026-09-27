/**
 * tests/test-3tier-deployment.test.js
 * Verification Suite for 3-Tier Deployment Architecture Configuration
 * (Frontend on Vercel, Backend API on Render, Database on Neon)
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const net = require('net');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper: Get random free port
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

// Helper: Spawn server.js child process
function startServerProcess(port, envOverrides = {}) {
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
    }, 15000);

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

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }

  console.log('======================================================================');
  console.log('  3-TIER DEPLOYMENT ARCHITECTURE VERIFICATION SUITE');
  console.log('======================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // R1: Vercel Proxy Rewrites in vercel.json
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: VERCEL REWRITES & HEADERS CONFIGURATION (R1) ---');

  await test('vercel.json exists and is valid JSON', () => {
    const vercelPath = path.join(PROJECT_ROOT, 'vercel.json');
    assert.ok(fs.existsSync(vercelPath), 'vercel.json must exist');
    const raw = fs.readFileSync(vercelPath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed, 'object', 'vercel.json must be a JSON object');
  });

  await test('vercel.json contains rewrite rule matching /api/:path* to Render URL', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'vercel.json'), 'utf8'));
    assert.ok(Array.isArray(vercel.rewrites), 'rewrites must be an array');
    const apiRewrite = vercel.rewrites.find(r => r.source === '/api/:path*');
    assert.ok(apiRewrite, 'Must contain a rewrite with source "/api/:path*"');
    assert.ok(
      apiRewrite.destination.includes('.onrender.com/api/:path*'),
      `destination must point to a Render URL ending in /api/:path*, got: ${apiRewrite.destination}`
    );
  });

  await test('vercel.json contains Cache-Control: no-store header for /api/* routes', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'vercel.json'), 'utf8'));
    assert.ok(Array.isArray(vercel.headers), 'headers must be an array');
    const apiHeaderRule = vercel.headers.find(h => h.source.includes('/api/'));
    assert.ok(apiHeaderRule, 'Must contain a headers rule for /api/ routes');
    assert.ok(Array.isArray(apiHeaderRule.headers), 'rule headers must be an array');
    const ccHeader = apiHeaderRule.headers.find(h => h.key.toLowerCase() === 'cache-control');
    assert.ok(ccHeader, 'Must contain a Cache-Control header');
    assert.equal(ccHeader.value, 'no-store', 'Cache-Control value must be "no-store"');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R2: Render Configuration in render.yaml
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: RENDER SERVICE CONFIGURATION (R2) ---');

  await test('render.yaml exists and contains start command for Node backend', () => {
    const renderPath = path.join(PROJECT_ROOT, 'render.yaml');
    assert.ok(fs.existsSync(renderPath), 'render.yaml must exist');
    const content = fs.readFileSync(renderPath, 'utf8');
    assert.ok(
      content.includes('npm start') || content.includes('node server.js'),
      'render.yaml must contain startCommand running npm start or node server.js'
    );
  });

  await test('render.yaml is syntactically valid YAML and has valid blueprint structure', () => {
    try {
      const output = execSync('python -c "import yaml, json; print(json.dumps(yaml.safe_load(open(\'render.yaml\'))))"', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });
      const parsed = JSON.parse(output);
      assert.ok(Array.isArray(parsed.services), 'services must be an array');
      assert.equal(parsed.services[0].name, 'blue-collar-connect');
      assert.equal(parsed.services[0].startCommand, 'npm start');
    } catch (e) {
      assert.fail(`render.yaml failed YAML validation: ${e.message}`);
    }
  });

  await test('render.yaml contains FRONTEND_URL in envVars with sync: false', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'render.yaml'), 'utf8');
    // Check that FRONTEND_URL is declared with sync: false
    const frontendUrlRegex = /-\s*key:\s*FRONTEND_URL\s*\n\s*sync:\s*false/m;
    assert.ok(
      frontendUrlRegex.test(content),
      'render.yaml must have FRONTEND_URL with sync: false'
    );
  });

  await test('render.yaml contains other secrets with sync: false', () => {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, 'render.yaml'), 'utf8');
    assert.ok(/-\s*key:\s*DATABASE_URL\s*\n\s*sync:\s*false/m.test(content), 'DATABASE_URL with sync: false');
    assert.ok(/-\s*key:\s*SESSION_SECRET\s*\n\s*sync:\s*false/m.test(content), 'SESSION_SECRET with sync: false');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R3: Server.js Environment-Guarded Static Serving
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: SERVER.JS STATIC SERVING ENVIRONMENT ISOLATION (R3) ---');

  await test('server.js contains code guard checking NODE_ENV !== "production" for static serving', () => {
    const serverCode = fs.readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
    assert.ok(
      serverCode.includes("process.env.NODE_ENV !== 'production'"),
      "server.js must check process.env.NODE_ENV !== 'production'"
    );
    const staticIndex = serverCode.indexOf('express.static');
    const checkIndex = serverCode.indexOf("process.env.NODE_ENV !== 'production'");
    assert.ok(checkIndex !== -1 && staticIndex !== -1 && checkIndex < staticIndex,
      "NODE_ENV check must wrap express.static"
    );
  });

  // Test local development behavior (NODE_ENV !== 'production')
  const devPort = await getFreePort();
  let devServer;
  try {
    devServer = await startServerProcess(devPort, { NODE_ENV: 'development' });
    await test('Development mode: Server serves root / (index.html) with HTTP 200', async () => {
      const res = await fetch(`${devServer.baseUrl}/`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('BlueCollar Connect') || text.includes('<!DOCTYPE html>'));
    });

    await test('Development mode: Server serves static file /jobs.html with HTTP 200', async () => {
      const res = await fetch(`${devServer.baseUrl}/jobs.html`);
      assert.equal(res.status, 200);
    });

    await test('Development mode: Server handles API requests (GET /api/jobs) with HTTP 200', async () => {
      const res = await fetch(`${devServer.baseUrl}/api/jobs`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });
  } finally {
    if (devServer && devServer.child) {
      devServer.child.kill();
    }
  }

  // Test local development behavior with unset NODE_ENV (default developer workflow)
  const defaultPort = await getFreePort();
  let defaultServer;
  try {
    defaultServer = await startServerProcess(defaultPort, { NODE_ENV: '' });
    await test('Default mode (unset NODE_ENV): Server serves root / with HTTP 200', async () => {
      const res = await fetch(`${defaultServer.baseUrl}/`);
      assert.equal(res.status, 200);
    });

    await test('Default mode (unset NODE_ENV): Server serves /jobs.html with HTTP 200', async () => {
      const res = await fetch(`${defaultServer.baseUrl}/jobs.html`);
      assert.equal(res.status, 200);
    });
  } finally {
    if (defaultServer && defaultServer.child) {
      defaultServer.child.kill();
    }
  }

  // Test production behavior (NODE_ENV === 'production')
  const prodPort = await getFreePort();
  let prodServer;
  try {
    prodServer = await startServerProcess(prodPort, {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://blue-collar-connect.vercel.app'
    });
    await test('Production mode: Server does NOT serve root / and responds with HTTP 404', async () => {
      const res = await fetch(`${prodServer.baseUrl}/`);
      assert.equal(res.status, 404, `Expected 404 for root / in production, got ${res.status}`);
    });

    await test('Production mode: Server does NOT serve static /jobs.html and responds with HTTP 404', async () => {
      const res = await fetch(`${prodServer.baseUrl}/jobs.html`);
      assert.equal(res.status, 404, `Expected 404 for /jobs.html in production, got ${res.status}`);
    });

    await test('Production mode: Server does NOT serve static /css/variables.css and responds with HTTP 404', async () => {
      const res = await fetch(`${prodServer.baseUrl}/css/variables.css`);
      assert.equal(res.status, 404, `Expected 404 for /css/variables.css in production, got ${res.status}`);
    });

    await test('Production mode: Server does NOT serve static /js/services/authService.js and responds with HTTP 404', async () => {
      const res = await fetch(`${prodServer.baseUrl}/js/services/authService.js`);
      assert.equal(res.status, 404, `Expected 404 for /js/services/authService.js in production, got ${res.status}`);
    });

    await test('Production mode: Server STILL serves API routes (GET /api/jobs) with HTTP 200', async () => {
      const res = await fetch(`${prodServer.baseUrl}/api/jobs`);
      assert.equal(res.status, 200, `Expected 200 for API in production, got ${res.status}`);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    await test('Production mode: CORS allows configured FRONTEND_URL with credentials', async () => {
      const res = await fetch(`${prodServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://blue-collar-connect.vercel.app' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://blue-collar-connect.vercel.app');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    await test('Production mode: CORS handles preflight OPTIONS request with HTTP 204 and CORS headers', async () => {
      const res = await fetch(`${prodServer.baseUrl}/api/jobs`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://blue-collar-connect.vercel.app',
          'Access-Control-Request-Method': 'POST'
        }
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://blue-collar-connect.vercel.app');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    await test('Production mode: CORS rejects unauthorized origin without 500 crash', async () => {
      const res = await fetch(`${prodServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://malicious-site.example.com' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  } finally {
    if (prodServer && prodServer.child) {
      prodServer.child.kill();
    }
  }

  // Test production CORS with trailing slash in FRONTEND_URL
  const trailingSlashPort = await getFreePort();
  let trailingSlashServer;
  try {
    trailingSlashServer = await startServerProcess(trailingSlashPort, {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://blue-collar-connect.vercel.app/'
    });
    await test('Production mode: CORS normalizes FRONTEND_URL trailing slash correctly', async () => {
      const res = await fetch(`${trailingSlashServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://blue-collar-connect.vercel.app' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://blue-collar-connect.vercel.app');
    });
  } finally {
    if (trailingSlashServer && trailingSlashServer.child) {
      trailingSlashServer.child.kill();
    }
  }

  // Test production CORS with case-insensitive RFC 6454 origin matching
  const caseSensitivityPort = await getFreePort();
  let caseServer;
  try {
    caseServer = await startServerProcess(caseSensitivityPort, {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://Blue-Collar-Connect.vercel.app'
    });
    await test('Production mode: CORS allows RFC 6454 case-insensitive origin matching', async () => {
      const res = await fetch(`${caseServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://blue-collar-connect.vercel.app' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://blue-collar-connect.vercel.app');
    });
  } finally {
    if (caseServer && caseServer.child) {
      caseServer.child.kill();
    }
  }

  // Test production CORS with multiple comma-separated FRONTEND_URLs
  const multiUrlPort = await getFreePort();
  let multiUrlServer;
  try {
    multiUrlServer = await startServerProcess(multiUrlPort, {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://production.vercel.app, https://preview-deploy.vercel.app/'
    });
    await test('Production mode: CORS allows first URL in comma-separated FRONTEND_URL', async () => {
      const res = await fetch(`${multiUrlServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://production.vercel.app' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://production.vercel.app');
    });
    await test('Production mode: CORS allows second trailing-slashed URL in comma-separated FRONTEND_URL', async () => {
      const res = await fetch(`${multiUrlServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://preview-deploy.vercel.app' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://preview-deploy.vercel.app');
    });
  } finally {
    if (multiUrlServer && multiUrlServer.child) {
      multiUrlServer.child.kill();
    }
  }

  // Test production CORS with quoted FRONTEND_URL
  const quotedPort = await getFreePort();
  let quotedServer;
  try {
    quotedServer = await startServerProcess(quotedPort, {
      NODE_ENV: 'production',
      FRONTEND_URL: '"https://quoted-origin.vercel.app"'
    });
    await test('Production mode: CORS normalizes FRONTEND_URL enclosed in quotes', async () => {
      const res = await fetch(`${quotedServer.baseUrl}/api/jobs`, {
        headers: { Origin: 'https://quoted-origin.vercel.app' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://quoted-origin.vercel.app');
    });
  } finally {
    if (quotedServer && quotedServer.child) {
      quotedServer.child.kill();
    }
  }

  // Neon PostgreSQL resilience & network architecture tests
  await test('Neon PostgreSQL: database.js registers error listener on pool to prevent idle drop crashes', () => {
    const dbPath = path.join(PROJECT_ROOT, 'server', 'db', 'database.js');
    const content = fs.readFileSync(dbPath, 'utf8');
    assert.ok(
      content.includes("pool.on('error'") || content.includes('pool.on("error"'),
      'server/db/database.js must register pool.on("error") handler for Neon idle connection resilience'
    );
    const db = require(dbPath);
    if (db.pool && typeof db.pool.listenerCount === 'function') {
      assert.ok(db.pool.listenerCount('error') > 0, 'database.js pool must have at least 1 error listener');
    }
  });

  await test('Neon PostgreSQL: server.js registers error listener on sessionPool', () => {
    const serverPath = path.join(PROJECT_ROOT, 'server.js');
    const content = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      content.includes("sessionPool.on('error'") || content.includes('sessionPool.on("error"'),
      'server.js must register sessionPool.on("error") handler for Neon idle connection resilience'
    );
  });

  await test('Network Architecture: server.js configures trust proxy for 2 hops in production', () => {
    const serverPath = path.join(PROJECT_ROOT, 'server.js');
    const content = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      content.includes('trust proxy'),
      'server.js must configure trust proxy'
    );
    assert.ok(
      content.includes('2') && content.includes('trust proxy'),
      'server.js must trust 2 hops in production to prevent Vercel edge IP rate limit collapse'
    );
  });

  await test('package.json defines runnable npm test command for 3-tier verification', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts && pkg.scripts.test, 'package.json must have scripts.test');
    assert.ok(
      pkg.scripts.test.includes('test-3tier-deployment.test.js'),
      `package.json test script must run deployment tests, got: ${pkg.scripts.test}`
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R4: Clean Up Deprecated Functions (api/auth.js)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: DEPRECATED FUNCTIONS CLEANUP (R4) ---');

  await test('api/auth.js has been deleted and does not exist', () => {
    const authPath = path.join(PROJECT_ROOT, 'api', 'auth.js');
    assert.equal(fs.existsSync(authPath), false, 'api/auth.js must not exist');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R5: Forbidden Files Immutability Audit
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: FORBIDDEN FILES IMMUTABILITY (R5) ---');

  await test('js/services/authService.js is completely unmodified from git HEAD', () => {
    const diff = execSync('git diff HEAD -- js/services/authService.js', { cwd: PROJECT_ROOT }).toString();
    assert.equal(diff.trim(), '', 'authService.js must have 0 diff from HEAD');
  });

  await test('js/components/authUI.js is completely unmodified from git HEAD', () => {
    const diff = execSync('git diff HEAD -- js/components/authUI.js', { cwd: PROJECT_ROOT }).toString();
    assert.equal(diff.trim(), '', 'authUI.js must have 0 diff from HEAD');
  });

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
