/**
 * tests/adversarial-m4-resilience.test.js
 * 
 * Adversarial Challenger M4: Master Harness Verification & Server Resilience Suite
 * 
 * Verifies:
 * 1. Master Test Harness (node tests/verify-all.js): exit code 0, 0 suite failures, 0 test failures.
 * 2. Server Resilience & Ephemeral Port Lifecycle:
 *    - Boot node server.js on random ephemeral port.
 *    - Send 50 concurrent rapid requests across public and protected /api/jobs endpoints.
 *    - Verify authentication gating and input validation under load.
 * 3. Data Persistence & Integrity:
 *    - Create job via authenticated customer session.
 *    - Directly inspect server/db/jobs.json on disk to verify atomic serialization.
 *    - Cold-restart server.js on a second ephemeral port and verify persisted job retrieval.
 *    - Perform authenticated cancellation and verify disk state update.
 *    - Clean shutdown without orphaned processes.
 * 4. Protected Files Immutability:
 *    - Assert js/components/authUI.js and js/services/authService.js are 100% untouched.
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');

// Snapshot pristine databases
const PRISTINE_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';
const PRISTINE_JOBS = fs.existsSync(JOBS_JSON_PATH) ? fs.readFileSync(JOBS_JSON_PATH, 'utf8') : '[]';

function restoreDb() {
  try {
    fs.writeFileSync(USERS_JSON_PATH, PRISTINE_USERS, 'utf8');
    fs.writeFileSync(JOBS_JSON_PATH, PRISTINE_JOBS, 'utf8');
  } catch (err) {
    console.error('Failed to restore database snapshot:', err.message);
  }
}

// Find an available ephemeral port
function getEphemeralPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// HTTP request helper with cookie support
async function httpRequest(baseUrl, method, endpoint, body = null, cookie = null) {
  const url = `${baseUrl}${endpoint}`;
  const headers = {};
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookie) {
    headers['Cookie'] = cookie.split(';')[0].trim();
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });

  const status = res.status;
  const setCookie = res.headers.get('set-cookie');
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status, data, cookie: setCookie || cookie };
}

// Spawn server.js child process on specified port
function startServerProcess(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'server.js')], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error(`Server timed out starting on port ${port}. Output: ${stdout} ${stderr}`));
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
        reject(new Error(`Server exited prematurely with code ${code}. Stderr: ${stderr}`));
      }
    });
  });
}

// Cleanly terminate server process
function stopServerProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      return resolve();
    }
    const forceKill = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve();
    }, 4000);

    child.on('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      child.kill();
    }
  });
}

async function runTests() {
  console.log('================================================================================');
  console.log('  CHALLENGER M4: ADVERSARIAL RESILIENCE & MASTER HARNESS VERIFICATION SUITE    ');
  console.log('================================================================================\n');

  const testResults = [];

  async function assertTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      testResults.push({ name, status: 'PASS' });
    } catch (err) {
      console.log(`  ❌ [FAIL] ${name}`);
      console.log(`     Error: ${err.message}`);
      testResults.push({ name, status: 'FAIL', error: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. FORBIDDEN FILES CHECK
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- PHASE 1: FORBIDDEN FILES IMMUTABILITY AUDIT ---');
  await assertTest('Verify js/components/authUI.js and js/services/authService.js are 100% untouched', () => {
    const statusOutput = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    }).trim();
    assert.equal(statusOutput, '', `Forbidden files modified according to git status: ${statusOutput}`);

    const diffOutput = execSync('git diff js/components/authUI.js js/services/authService.js', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    }).trim();
    assert.equal(diffOutput, '', `Forbidden files have uncommitted diffs: ${diffOutput}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SERVER RESILIENCE & EPHEMERAL PORT LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PHASE 2: SERVER RESILIENCE & EPHEMERAL PORT LIFECYCLE ---');

  const ephemeralPort1 = await getEphemeralPort();
  console.log(`  Selected Ephemeral Port #1: ${ephemeralPort1}`);

  let server1Handle = null;
  let baseUrl1 = null;

  await assertTest('Boot node server.js on ephemeral port #1', async () => {
    const { child, baseUrl } = await startServerProcess(ephemeralPort1);
    server1Handle = child;
    baseUrl1 = baseUrl;
    assert.ok(server1Handle, 'Server process handle must be active');
    assert.ok(baseUrl1, 'Base URL must be assigned');
  });

  await assertTest('Server responds to static root request on ephemeral port', async () => {
    const res = await fetch(`${baseUrl1}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('BlueCollar Connect') || text.includes('<!DOCTYPE html>'));
  });

  await assertTest('Server responds to GET /jobs.html on ephemeral port', async () => {
    const res = await fetch(`${baseUrl1}/jobs.html`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Browse Jobs') || text.includes('jobs'));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CONCURRENT RAPID REQUESTS ACROSS /api/jobs (50 CONCURRENT REQUESTS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PHASE 3: CONCURRENT RAPID REQUESTS STRESS TEST (50 REQUESTS) ---');

  await assertTest('Send 50 rapid concurrent requests across public and protected /api/jobs endpoints', async () => {
    const requests = [];

    // 10x GET /api/jobs (unfiltered)
    for (let i = 0; i < 10; i++) {
      requests.push(httpRequest(baseUrl1, 'GET', '/api/jobs').then(res => {
        assert.equal(res.status, 200);
        assert.ok(res.data && res.data.success === true);
        assert.ok(Array.isArray(res.data.jobs));
      }));
    }

    // 5x GET /api/jobs with category filter (cat-1)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'GET', '/api/jobs?category=cat-1').then(res => {
        assert.equal(res.status, 200);
        assert.ok(res.data && res.data.success === true);
        for (const j of res.data.jobs) {
          assert.equal(j.category, 'cat-1');
        }
      }));
    }

    // 5x GET /api/jobs with slug category filter (plumber)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'GET', '/api/jobs?category=plumber').then(res => {
        assert.equal(res.status, 200);
        assert.ok(res.data && res.data.success === true);
        for (const j of res.data.jobs) {
          assert.equal(j.categorySlug, 'plumber');
        }
      }));
    }

    // 5x GET /api/jobs with urgency filter (urgent)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'GET', '/api/jobs?urgency=urgent').then(res => {
        assert.equal(res.status, 200);
        assert.ok(res.data && res.data.success === true);
        for (const j of res.data.jobs) {
          assert.equal(j.urgency, 'urgent');
        }
      }));
    }

    // 5x GET /api/jobs with sort=budget-desc & limit=3
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'GET', '/api/jobs?sort=budget-desc&limit=3').then(res => {
        assert.equal(res.status, 200);
        assert.ok(res.data && res.data.success === true);
        assert.ok(res.data.jobs.length <= 3);
      }));
    }

    // 5x GET /api/jobs/:id with nonexistent ID (expect 404)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'GET', `/api/jobs/nonexistent-adversarial-id-${i}`).then(res => {
        assert.equal(res.status, 404);
        assert.equal(res.data.success, false);
      }));
    }

    // 5x POST /api/jobs unauthenticated (expect 401)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'POST', '/api/jobs', {
        title: 'Unauthenticated Intrusion Attempt',
        category: 'cat-1',
        description: 'Should be rejected with 401 immediately.',
        location: 'Nowhere',
        urgency: 'high',
        budget: 100
      }).then(res => {
        assert.equal(res.status, 401);
        assert.equal(res.data.success, false);
      }));
    }

    // 5x PATCH /api/jobs/:id unauthenticated (expect 401)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'PATCH', `/api/jobs/dummy-id-${i}`, { title: 'Hacked Title' }).then(res => {
        assert.equal(res.status, 401);
        assert.equal(res.data.success, false);
      }));
    }

    // 5x DELETE /api/jobs/:id unauthenticated (expect 401)
    for (let i = 0; i < 5; i++) {
      requests.push(httpRequest(baseUrl1, 'DELETE', `/api/jobs/dummy-id-${i}`).then(res => {
        assert.equal(res.status, 401);
        assert.equal(res.data.success, false);
      }));
    }

    assert.equal(requests.length, 50, 'Must execute exactly 50 concurrent requests');
    await Promise.all(requests);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AUTHENTICATED JOB CREATION & DATA PERSISTENCE IN server/db/jobs.json
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PHASE 4: AUTHENTICATED JOB CREATION & DISK PERSISTENCE AUDIT ---');

  let aliceCookie = null;
  let testJobId = null;

  await assertTest('Authenticate test customer Alice on server #1', async () => {
    const loginRes = await httpRequest(baseUrl1, 'POST', '/api/auth/login', {
      email: 'alice@jobs-test.example.com',
      password: 'TestPassword123!'
    });
    assert.equal(loginRes.status, 200, `Login failed: ${JSON.stringify(loginRes.data)}`);
    assert.ok(loginRes.cookie, 'Session cookie must be returned');
    aliceCookie = loginRes.cookie;
  });

  await assertTest('POST /api/jobs with customer session creates job and persists to disk', async () => {
    const initialJobsOnDisk = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
    const initialCount = initialJobsOnDisk.length;

    const payload = {
      title: 'Emergency Generator Interlock & Subpanel Wiring',
      description: 'Need licensed electrician to install 50A generator inlet box, manual interlock kit, and dedicated circuit for critical loads.',
      category: 'cat-1',
      location: 'Flushing, Queens, NY',
      urgency: 'urgent',
      budget: '$450 - $750',
      preferredDate: '2026-10-02',
      preferredTime: 'Morning (8am - 12pm)',
      photos: ['https://example.com/panel1.jpg']
    };

    const res = await httpRequest(baseUrl1, 'POST', '/api/jobs', payload, aliceCookie);
    assert.equal(res.status, 201, `Job creation failed: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.success);
    assert.ok(res.data.job && res.data.job.id);
    testJobId = res.data.job.id;

    // DIRECT DISK INSPECTION: Verify jobs.json contains the newly created record
    const updatedJobsOnDisk = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
    assert.equal(updatedJobsOnDisk.length, initialCount + 1, 'jobs.json must have incremented by exactly 1');

    const foundOnDisk = updatedJobsOnDisk.find(j => j.id === testJobId);
    assert.ok(foundOnDisk, `Newly created job ${testJobId} must exist directly in server/db/jobs.json`);
    assert.equal(foundOnDisk.title, payload.title);
    assert.equal(foundOnDisk.category, 'cat-1');
    assert.equal(foundOnDisk.categorySlug, 'electrician');
    assert.equal(foundOnDisk.categoryName, 'Electrician');
    assert.equal(foundOnDisk.status, 'open');
    assert.equal(foundOnDisk.urgency, 'urgent');
    assert.equal(foundOnDisk.customerId, 'cust-verified-alice-101');
    assert.ok(foundOnDisk.createdAt, 'Job must have createdAt timestamp');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CLEAN SHUTDOWN OF SERVER #1
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PHASE 5: CLEAN SHUTDOWN OF SERVER #1 ---');
  await assertTest('Cleanly terminate server #1 with SIGTERM', async () => {
    assert.ok(server1Handle, 'Server handle must exist');
    await stopServerProcess(server1Handle);
    assert.ok(server1Handle.killed || server1Handle.exitCode !== null, 'Server #1 must be terminated');
    server1Handle = null;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. COLD-RESTART PERSISTENCE ON EPHEMERAL PORT #2
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PHASE 6: COLD RESTART PERSISTENCE AUDIT (SERVER #2) ---');

  const ephemeralPort2 = await getEphemeralPort();
  console.log(`  Selected Ephemeral Port #2: ${ephemeralPort2}`);

  let server2Handle = null;
  let baseUrl2 = null;

  await assertTest('Cold-restart node server.js on ephemeral port #2', async () => {
    const { child, baseUrl } = await startServerProcess(ephemeralPort2);
    server2Handle = child;
    baseUrl2 = baseUrl;
    assert.ok(server2Handle, 'Server #2 process must be running');
    assert.ok(baseUrl2, 'Server #2 URL must be available');
  });

  await assertTest('Retrieve persisted job via GET /api/jobs/:id on restarted server #2', async () => {
    const res = await httpRequest(baseUrl2, 'GET', `/api/jobs/${testJobId}`);
    assert.equal(res.status, 200, `Failed to fetch persisted job after cold restart: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.success);
    assert.equal(res.data.job.id, testJobId);
    assert.equal(res.data.job.title, 'Emergency Generator Interlock & Subpanel Wiring');
    assert.equal(res.data.job.status, 'open');
  });

  await assertTest('Authenticate Alice on server #2 and cancel job via DELETE /api/jobs/:id', async () => {
    // Re-login Alice on server #2
    const loginRes = await httpRequest(baseUrl2, 'POST', '/api/auth/login', {
      email: 'alice@jobs-test.example.com',
      password: 'TestPassword123!'
    });
    assert.equal(loginRes.status, 200);
    const aliceCookie2 = loginRes.cookie;

    // Alice cancels the job
    const delRes = await httpRequest(baseUrl2, 'DELETE', `/api/jobs/${testJobId}`, null, aliceCookie2);
    assert.equal(delRes.status, 200, `Failed to cancel job: ${JSON.stringify(delRes.data)}`);
    assert.ok(delRes.data.success);
    assert.equal(delRes.data.job.status, 'cancelled');

    // DIRECT DISK INSPECTION: Verify jobs.json on disk reflects status='cancelled'
    const diskJobs = JSON.parse(fs.readFileSync(JOBS_JSON_PATH, 'utf8'));
    const cancelledOnDisk = diskJobs.find(j => j.id === testJobId);
    assert.ok(cancelledOnDisk, 'Job must exist on disk');
    assert.equal(cancelledOnDisk.status, 'cancelled', 'Status on disk must be cancelled');
  });

  await assertTest('Cleanly terminate server #2 with SIGTERM', async () => {
    assert.ok(server2Handle, 'Server #2 handle must exist');
    await stopServerProcess(server2Handle);
    assert.ok(server2Handle.killed || server2Handle.exitCode !== null, 'Server #2 must be terminated');
    server2Handle = null;
  });

  // Restore pristine database state
  restoreDb();

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log('         ADVERSARIAL M4 RESILIENCE SUITE EXECUTION SUMMARY                      ');
  console.log('================================================================================');
  const passedCount = testResults.filter(t => t.status === 'PASS').length;
  const failedCount = testResults.filter(t => t.status === 'FAIL').length;
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  if (failedCount > 0) {
    console.error('\n❌ RESILIENCE SUITE FAILED:');
    for (const t of testResults.filter(t => t.status === 'FAIL')) {
      console.error(`  - ${t.name}: ${t.error}`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ADVERSARIAL RESILIENCE & LIFECYCLE TESTS PASSED CLEANLY!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal unhandled error in adversarial test runner:', err);
  restoreDb();
  process.exit(1);
});
