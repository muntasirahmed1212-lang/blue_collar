/**
 * tests/adversarial-stress-m1.test.js
 * Adversarial Stress, Concurrency & Security Verification Suite for Milestone M1
 *
 * Executed by: challenger_m1_1 (Critic / Specialist)
 *
 * Challenge Dimensions:
 * 1. Rapid Sequential & High-Load Concurrent Job Creation
 *    - 50 rapid sequential creations in tight loop
 *    - 40 simultaneous concurrent creations via Promise.all across multiple customers
 *    - 60 mixed concurrent read/write hammer
 *    - Extreme payload & boundary fuzzing (Unicode, XSS strings, budget variants, boundary lengths)
 * 2. Persistence Integrity & Crash Resilience
 *    - Child process abrupt termination (exit/SIGKILL) after job creation
 *    - Server cold-restart persistence verification across fresh port
 *    - Corrupted / malformed jobs.json self-healing and error defensiveness
 * 3. Permission Bypass & Security Attack Scenarios
 *    - BOLA / IDOR cross-customer job modification attempt on PATCH /api/jobs/:id
 *    - BOLA / IDOR cross-customer job cancellation attempt on DELETE /api/jobs/:id
 *    - Session spoofing / customerId impersonation attempt in request body on POST /api/jobs
 *    - Ownership hijacking & immutable field tampering on PATCH /api/jobs/:id
 *    - Role-based privilege escalation (professional role, unverified customer role)
 *    - Forged / nonexistent session cookie & header tampering
 *    - Admin privileges vs non-admin header spoofing
 *    - Prototype pollution attack vectors (__proto__, constructor)
 *    - Soft delete audit trail & query status visibility
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');

const db = require('../server/db/database');
const authRoutes = require('../server/routes/auth');
const jobRoutes = require('../server/routes/jobs');
const emailService = require('../server/services/emailService');

// ─── Database State Preservation ─────────────────────────────────────────────
const PRISTINE_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';
const PRISTINE_JOBS = fs.existsSync(JOBS_JSON_PATH) ? fs.readFileSync(JOBS_JSON_PATH, 'utf8') : '[]';
const originalSendOTPEmail = emailService.sendOTPEmail;

let dbRestored = false;
function restoreDb() {
  if (dbRestored) return;
  dbRestored = true;
  try {
    if (PRISTINE_USERS) {
      fs.writeFileSync(USERS_JSON_PATH, PRISTINE_USERS, 'utf8');
    }
    if (PRISTINE_JOBS) {
      fs.writeFileSync(JOBS_JSON_PATH, PRISTINE_JOBS, 'utf8');
    }
    emailService.sendOTPEmail = originalSendOTPEmail;
  } catch (err) {
    console.error('Error restoring database in adversarial test:', err.message);
  }
}

process.on('exit', restoreDb);
process.on('SIGINT', () => { restoreDb(); process.exit(1); });
process.on('SIGTERM', () => { restoreDb(); process.exit(1); });

// ─── HTTP Client Helper ──────────────────────────────────────────────────────
async function httpRequest(baseUrl, method, endpoint, body = null, cookie = null, extraHeaders = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = { ...extraHeaders };
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

// ─── Ephemeral Server Factory ────────────────────────────────────────────────
function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: 'adversarial_challenger_session_secret_998877',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
  }));

  // Test-only session helper: sets arbitrary session fields for edge case testing
  app.post('/__test__/set-session', (req, res) => {
    if (req.body) {
      Object.assign(req.session, req.body);
    }
    res.json({ success: true, session: req.session });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/jobs', jobRoutes);
  return app;
}

async function startServer() {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

// ─── Test Suite Execution ────────────────────────────────────────────────────
async function runAdversarialSuite() {
  console.log('======================================================================');
  console.log('CHALLENGER M1-1: ADVERSARIAL STRESS, CONCURRENCY & SECURITY TEST SUITE');
  console.log('======================================================================\n');

  emailService.sendOTPEmail = async () => ({ messageId: 'adversarial-mock-otp' });

  // Reset jobs.json to pristine state
  fs.writeFileSync(JOBS_JSON_PATH, PRISTINE_JOBS, 'utf8');

  // Pre-seed test users
  const TEST_PASSWORD = 'AdversarialPassword123!';
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const baseUsers = JSON.parse(PRISTINE_USERS);

  const testUsers = [
    ...baseUsers.filter(u => !u.email.endsWith('@adv-test.com')),
    {
      id: 'adv-cust-alice',
      fullName: 'Alice AdvCustomer',
      email: 'alice@adv-test.com',
      password: passwordHash,
      role: 'customer',
      isVerified: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'adv-cust-bob',
      fullName: 'Bob AdvCustomer',
      email: 'bob@adv-test.com',
      password: passwordHash,
      role: 'customer',
      isVerified: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'adv-cust-unverified-charlie',
      fullName: 'Charlie Unverified',
      email: 'charlie@adv-test.com',
      password: passwordHash,
      role: 'customer',
      isVerified: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'adv-pro-dan',
      fullName: 'Dan AdvProfessional',
      email: 'dan@adv-test.com',
      password: passwordHash,
      role: 'professional',
      isVerified: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'adv-admin-eve',
      fullName: 'Eve AdvAdmin',
      email: 'eve@adv-test.com',
      password: passwordHash,
      role: 'admin',
      isVerified: true,
      createdAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(testUsers, null, 2), 'utf8');

  let { server, baseUrl } = await startServer();

  let aliceCookie = null;
  let bobCookie = null;
  let danCookie = null;
  let eveCookie = null;
  let charlieCookie = null;

  async function loginAllPersonas() {
    const aliceRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', { email: 'alice@adv-test.com', password: TEST_PASSWORD });
    assert.equal(aliceRes.status, 200, 'Alice login failed');
    aliceCookie = aliceRes.cookie;

    const bobRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', { email: 'bob@adv-test.com', password: TEST_PASSWORD });
    assert.equal(bobRes.status, 200, 'Bob login failed');
    bobCookie = bobRes.cookie;

    const danRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', { email: 'dan@adv-test.com', password: TEST_PASSWORD });
    assert.equal(danRes.status, 200, 'Dan login failed');
    danCookie = danRes.cookie;

    const eveRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', { email: 'eve@adv-test.com', password: TEST_PASSWORD });
    assert.equal(eveRes.status, 200, 'Eve login failed');
    eveCookie = eveRes.cookie;

    const charlieSessionRes = await httpRequest(baseUrl, 'POST', '/__test__/set-session', { userId: 'adv-cust-unverified-charlie' });
    charlieCookie = charlieSessionRes.cookie;
  }

  const results = [];
  async function test(category, id, name, fn) {
    try {
      await fn();
      results.push({ category, id, name, status: 'PASS', error: null });
      console.log(`  ✅ [PASS] ${id}: ${name}`);
    } catch (err) {
      results.push({ category, id, name, status: 'FAIL', error: err.message });
      console.log(`  ❌ [FAIL] ${id}: ${name}`);
      console.log(`     Error: ${err.message}`);
    }
  }

  try {
    console.log('--- Logging in test personas ---');
    await loginAllPersonas();
    console.log('  Sessions active for Alice, Bob, Dan, Eve, Charlie.\n');

    // =========================================================================
    // PART 1: RAPID SEQUENTIAL & CONCURRENT JOB CREATION
    // =========================================================================
    console.log('=== PART 1: RAPID SEQUENTIAL & CONCURRENT JOB CREATION ===');

    await test('CONCURRENCY', 'ADV-1.1', 'Rapid sequential job creation (50 iterations)', async () => {
      const initialCount = db.readJobs().length;
      const createdIds = [];

      for (let i = 0; i < 50; i++) {
        const payload = {
          title: `Rapid Sequential Job #${i} Maintenance`,
          description: `Description for sequential job iteration #${i} with sufficient length.`,
          category: 'cat-1',
          location: `Zone ${i}, New York, NY`,
          urgency: i % 2 === 0 ? 'high' : 'medium',
          budget: 100 + i * 5,
          preferredDate: '2026-10-01'
        };
        const res = await httpRequest(baseUrl, 'POST', '/api/jobs', payload, aliceCookie);
        assert.equal(res.status, 201, `Failed at iteration ${i}: ${JSON.stringify(res.data)}`);
        assert.ok(res.data.success);
        assert.ok(res.data.job && res.data.job.id);
        createdIds.push(res.data.job.id);
      }

      // Verify unique IDs
      const uniqueIds = new Set(createdIds);
      assert.equal(uniqueIds.size, 50, 'All 50 job IDs must be unique');

      // Verify file persistence
      const jobsOnDisk = db.readJobs();
      assert.equal(jobsOnDisk.length, initialCount + 50, 'All 50 jobs must be persisted to jobs.json');

      for (const id of createdIds) {
        const found = jobsOnDisk.find(j => j.id === id);
        assert.ok(found, `Job ${id} must exist in jobs.json`);
        assert.equal(found.customerId, 'adv-cust-alice');
        assert.equal(found.customerName, 'Alice AdvCustomer');
        assert.equal(found.status, 'open');
      }
    });

    await test('CONCURRENCY', 'ADV-1.2', 'High-load concurrent job creation (40 simultaneous requests)', async () => {
      const initialCount = db.readJobs().length;
      const requests = [];

      // 20 requests from Alice, 20 requests from Bob launched concurrently
      for (let i = 0; i < 40; i++) {
        const isAlice = i % 2 === 0;
        const cookie = isAlice ? aliceCookie : bobCookie;
        const customerPrefix = isAlice ? 'Alice' : 'Bob';
        const payload = {
          title: `Concurrent Job #${i} by ${customerPrefix}`,
          description: `Concurrency stress test payload for worker thread index ${i}.`,
          category: (i % 12) + 1 === 1 ? 'cat-1' : `cat-${(i % 12) + 1}`,
          location: `District ${i}, Manhattan`,
          urgency: 'urgent',
          budget: { min: 200 + i, max: 400 + i }
        };
        requests.push(httpRequest(baseUrl, 'POST', '/api/jobs', payload, cookie));
      }

      const responses = await Promise.all(requests);
      const createdIds = [];

      for (let i = 0; i < responses.length; i++) {
        const res = responses[i];
        assert.equal(res.status, 201, `Concurrent request ${i} failed with status ${res.status}: ${JSON.stringify(res.data)}`);
        assert.ok(res.data.success);
        assert.ok(res.data.job && res.data.job.id);
        createdIds.push(res.data.job.id);

        const isAlice = i % 2 === 0;
        const expectedCustomer = isAlice ? 'adv-cust-alice' : 'adv-cust-bob';
        assert.equal(res.data.job.customerId, expectedCustomer, `Job ${i} customerId mismatch`);
      }

      // Assert no lost updates
      const uniqueIds = new Set(createdIds);
      assert.equal(uniqueIds.size, 40, 'All 40 concurrent job IDs must be unique');

      const jobsOnDisk = db.readJobs();
      assert.equal(jobsOnDisk.length, initialCount + 40, 'jobs.json must contain exactly initial + 40 records (zero lost updates)');
    });

    await test('CONCURRENCY', 'ADV-1.3', 'Mixed concurrent read and write operations (60 operations in parallel)', async () => {
      const seedJobs = db.readJobs();
      assert.ok(seedJobs.length > 0, 'Seed jobs must exist');
      const targetJobId = seedJobs[0].id;

      const ops = [];
      // 20 POSTs
      for (let i = 0; i < 20; i++) {
        ops.push(httpRequest(baseUrl, 'POST', '/api/jobs', {
          title: `Interleaved Write Job #${i}`,
          description: `Concurrent write test interleave load item #${i}.`,
          category: 'cat-2',
          location: 'Queens, NY',
          urgency: 'low',
          budget: 150
        }, aliceCookie));
      }

      // 20 GET all open jobs
      for (let i = 0; i < 20; i++) {
        ops.push(httpRequest(baseUrl, 'GET', '/api/jobs'));
      }

      // 10 GET filtered by category
      for (let i = 0; i < 10; i++) {
        ops.push(httpRequest(baseUrl, 'GET', '/api/jobs?category=cat-1'));
      }

      // 10 GET single job
      for (let i = 0; i < 10; i++) {
        ops.push(httpRequest(baseUrl, 'GET', `/api/jobs/${targetJobId}`));
      }

      const results = await Promise.all(ops);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        assert.ok(r.status === 200 || r.status === 201, `Operation ${i} failed with status ${r.status}: ${JSON.stringify(r.data)}`);
        assert.ok(r.data && r.data.success === true, `Operation ${i} did not return success: true: ${JSON.stringify(r.data)}`);
      }
    });

    await test('INPUT_FUZZING', 'ADV-1.4', 'Extreme payload, Unicode, XSS, and boundary fuzzing on creation', async () => {
      // 1. Unicode and special character injection
      const xssTitle = 'Fix: <script>alert("xss")</script> & 🪠⚡ \' OR 1=1 --';
      const xssDesc = 'Description containing \n\r\t \u0000 escaped unicode and "quotes" with <div>html tags</div>.';
      const res1 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: xssTitle,
        description: xssDesc,
        category: 'cat-3',
        location: 'Brooklyn, NY',
        urgency: 'high',
        budget: 250
      }, aliceCookie);
      assert.equal(res1.status, 201);
      assert.equal(res1.data.job.title, xssTitle);
      assert.equal(res1.data.job.description, xssDesc);

      // Verify retrieval through GET
      const getRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${res1.data.job.id}`);
      assert.equal(getRes.status, 200);
      assert.equal(getRes.data.job.title, xssTitle);

      // 2. Large description payload (15KB text)
      const bigText = 'Long text description. '.repeat(650); // ~15.6KB
      const res2 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Large Payload Job Test',
        description: bigText,
        category: 'cat-4',
        location: 'Manhattan, NY',
        urgency: 'medium',
        budget: '$500'
      }, aliceCookie);
      assert.equal(res2.status, 201);
      assert.equal(res2.data.job.description.length, bigText.trim().length);

      // 3. Exact boundary length inputs: title=5 chars, desc=10 chars, location=2 chars
      const res3 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: '12345',
        description: '1234567890',
        category: 'cat-5',
        location: 'NY',
        urgency: 'low',
        budget: 100
      }, aliceCookie);
      assert.equal(res3.status, 201);
      assert.equal(res3.data.job.title, '12345');

      // 4. Budget variants
      // 4a. Object min === max
      const resBudget1 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Budget Equal Min Max',
        description: 'Testing budget object with min equal to max value.',
        category: 'cat-6',
        location: 'Queens, NY',
        urgency: 'low',
        budget: { min: 150, max: 150, currency: '$' }
      }, aliceCookie);
      assert.equal(resBudget1.status, 201);
      assert.equal(resBudget1.data.job.budget, '$150 - $150');

      // 4b. Object min only
      const resBudget2 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Budget Min Only Test',
        description: 'Testing budget object with min value specified only.',
        category: 'cat-7',
        location: 'Queens, NY',
        urgency: 'low',
        budget: { min: 200, currency: '$' }
      }, aliceCookie);
      assert.equal(resBudget2.status, 201);
      assert.equal(resBudget2.data.job.budget, '$200+');

      // 4c. Object max only
      const resBudget3 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Budget Max Only Test',
        description: 'Testing budget object with max value specified only.',
        category: 'cat-8',
        location: 'Queens, NY',
        urgency: 'low',
        budget: { max: 300, currency: '$' }
      }, aliceCookie);
      assert.equal(resBudget3.status, 201);
      assert.equal(resBudget3.data.job.budget, 'Up to $300');
    });

    await test('VALIDATION', 'ADV-1.5', 'Strict input rejection on invalid parameters', async () => {
      const basePayload = {
        title: 'Valid Base Title',
        description: 'Valid base description minimum 10 chars',
        category: 'cat-1',
        location: 'New York',
        urgency: 'medium',
        budget: 100
      };

      // Title too short (< 5 chars)
      const r1 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, title: 'Four' }, aliceCookie);
      assert.equal(r1.status, 400);

      // Description too short (< 10 chars)
      const r2 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, description: 'Nine char' }, aliceCookie);
      assert.equal(r2.status, 400);

      // Location too short (< 2 chars)
      const r3 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, location: 'X' }, aliceCookie);
      assert.equal(r3.status, 400);

      // Invalid category
      const r4 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, category: 'cat-999' }, aliceCookie);
      assert.equal(r4.status, 400);

      // Invalid urgency
      const r5 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, urgency: 'immediate-rush' }, aliceCookie);
      assert.equal(r5.status, 400);

      // Budget min > max
      const r6 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, budget: { min: 300, max: 100 } }, aliceCookie);
      assert.equal(r6.status, 400);

      // Non-numeric budget object
      const r7 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, budget: { min: 'not-a-number' } }, aliceCookie);
      assert.equal(r7.status, 400);

      // Budget zero or negative number
      const r8 = await httpRequest(baseUrl, 'POST', '/api/jobs', { ...basePayload, budget: -50 }, aliceCookie);
      assert.equal(r8.status, 400);
    });

    // =========================================================================
    // PART 2: PERSISTENCE INTEGRITY ACROSS SUDDEN PROCESS EXIT & RE-READING
    // =========================================================================
    console.log('\n=== PART 2: PERSISTENCE INTEGRITY & CRASH RESILIENCE ===');

    await test('PERSISTENCE', 'ADV-2.1', 'Persistence integrity across child process abrupt exit', async () => {
      // Execute a separate Node process that creates a job and exits abruptly
      const childCode = `
        const db = require('./server/db/database');
        const job = db.createJob({
          title: 'Abrupt Exit Persistence Job',
          description: 'Testing persistence across immediate process termination.',
          category: 'cat-9',
          location: 'Bronx, NY',
          urgency: 'high',
          budget: 180,
          customerId: 'adv-cust-alice',
          customerName: 'Alice AdvCustomer',
          customerEmail: 'alice@adv-test.com'
        });
        process.stdout.write(JSON.stringify(job));
        process.exit(0);
      `;

      const childRes = spawnSync('node', ['-e', childCode], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });

      assert.equal(childRes.status, 0, `Child process failed: ${childRes.stderr}`);
      const createdChildJob = JSON.parse(childRes.stdout);
      assert.ok(createdChildJob.id);

      // Re-read file directly in parent process
      const rawFile = fs.readFileSync(JOBS_JSON_PATH, 'utf8');
      const parsedJobs = JSON.parse(rawFile);
      const foundInParent = parsedJobs.find(j => j.id === createdChildJob.id);
      assert.ok(foundInParent, 'Job written by abruptly exited child must be readable and intact in parent');
      assert.equal(foundInParent.title, 'Abrupt Exit Persistence Job');
    });

    await test('PERSISTENCE', 'ADV-2.2', 'Cold restart: new server instance on fresh port serves persisted data', async () => {
      // Create a test job on Server 1
      const jobRes = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Cold Restart Verification Job',
        description: 'Verifying data persists across complete server shutdown and restart.',
        category: 'cat-10',
        location: 'Staten Island, NY',
        urgency: 'medium',
        budget: 175
      }, aliceCookie);
      assert.equal(jobRes.status, 201);
      const targetId = jobRes.data.job.id;

      // Close Server 1
      await new Promise(resolve => server.close(resolve));

      // Boot Server 2 on fresh port
      const server2 = await startServer();
      server = server2.server;
      baseUrl = server2.baseUrl;

      // Query Server 2
      const fetchRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${targetId}`);
      assert.equal(fetchRes.status, 200, 'Server 2 must serve job created on Server 1');
      assert.equal(fetchRes.data.job.id, targetId);
      assert.equal(fetchRes.data.job.title, 'Cold Restart Verification Job');

      // Re-login all personas on Server 2
      await loginAllPersonas();
    });

    await test('PERSISTENCE', 'ADV-2.3', 'Defensive resilience against malformed / corrupted jobs.json', async () => {
      const backupCurrentJobs = fs.readFileSync(JOBS_JSON_PATH, 'utf8');

      try {
        // 1. Corrupt with invalid JSON string
        fs.writeFileSync(JOBS_JSON_PATH, '<<< INVALID NOT JSON { [', 'utf8');
        const readCorrupted = db.readJobs();
        assert.ok(Array.isArray(readCorrupted), 'readJobs() must return array on corrupted file');
        assert.equal(readCorrupted.length, 0, 'readJobs() must return [] on syntax error');

        const apiGetCorrupted = await httpRequest(baseUrl, 'GET', '/api/jobs');
        assert.equal(apiGetCorrupted.status, 200, 'GET /api/jobs must return 200 instead of 500 crash on malformed file');
        assert.equal(apiGetCorrupted.data.count, 0);

        // 2. Corrupt with array containing null, primitives, and valid objects
        const mixedData = [
          null,
          42,
          'unexpected string',
          { id: 'valid-job-survivor', title: 'Survivor Job', status: 'open', category: 'cat-1' },
          undefined
        ];
        fs.writeFileSync(JOBS_JSON_PATH, JSON.stringify(mixedData), 'utf8');

        const readMixed = db.readJobs();
        assert.equal(readMixed.length, 1, 'readJobs() must filter out nulls and primitives');
        assert.equal(readMixed[0].id, 'valid-job-survivor');

        const apiGetMixed = await httpRequest(baseUrl, 'GET', '/api/jobs');
        assert.equal(apiGetMixed.status, 200);
        assert.equal(apiGetMixed.data.count, 1);
        assert.equal(apiGetMixed.data.jobs[0].id, 'valid-job-survivor');
      } finally {
        // Restore
        fs.writeFileSync(JOBS_JSON_PATH, backupCurrentJobs, 'utf8');
      }
    });

    // =========================================================================
    // PART 3: PERMISSION BYPASS & SECURITY ATTACK SCENARIOS
    // =========================================================================
    console.log('\n=== PART 3: PERMISSION BYPASS & SECURITY ATTACK SCENARIOS ===');

    // Create a job owned by Alice for cross-user attack tests
    const aliceOwnedJobRes = await httpRequest(baseUrl, 'POST', '/api/jobs', {
      title: 'Alice Private Bathroom Remodel',
      description: 'Complete tile tear-out and copper pipe replacement in master bathroom.',
      category: 'cat-2',
      location: 'Manhattan, Upper East Side',
      urgency: 'high',
      budget: '$2,500'
    }, aliceCookie);
    assert.equal(aliceOwnedJobRes.status, 201, `Failed creating Alice job: ${JSON.stringify(aliceOwnedJobRes.data)}`);
    const aliceJobId = aliceOwnedJobRes.data.job.id;

    await test('SECURITY', 'ADV-3.1', 'BOLA / IDOR: Bob cannot modify Alice job via PATCH', async () => {
      // Bob attempts to modify Alice's job
      const patchRes = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${aliceJobId}`, {
        title: 'Hacked by Bob - Title Overwritten',
        budget: '$100'
      }, bobCookie);

      assert.equal(patchRes.status, 403, `Expected 403 Forbidden, got ${patchRes.status}: ${JSON.stringify(patchRes.data)}`);
      assert.equal(patchRes.data.success, false);
      assert.match(patchRes.data.error, /permission/i);

      // Verify Alice's job is unchanged
      const verifyRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${aliceJobId}`);
      assert.equal(verifyRes.data.job.title, 'Alice Private Bathroom Remodel');
      assert.equal(verifyRes.data.job.budget, '$2,500');
    });

    await test('SECURITY', 'ADV-3.2', 'BOLA / IDOR: Bob cannot cancel/delete Alice job via DELETE', async () => {
      // Bob attempts to cancel Alice's job
      const deleteRes = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${aliceJobId}`, null, bobCookie);

      assert.equal(deleteRes.status, 403, `Expected 403 Forbidden, got ${deleteRes.status}: ${JSON.stringify(deleteRes.data)}`);
      assert.equal(deleteRes.data.success, false);
      assert.match(deleteRes.data.error, /permission/i);

      // Verify Alice's job status remains 'open'
      const verifyRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${aliceJobId}`);
      assert.equal(verifyRes.data.job.status, 'open', 'Job must remain open');
    });

    await test('SECURITY', 'ADV-3.3', 'Session spoofing / customerId impersonation rejected on POST', async () => {
      // Bob tries to post a job while injecting Alice's customerId and customerName in the request body
      const spoofPayload = {
        title: 'Spoofed Job Posting Attributed to Alice',
        description: 'Adversarial attempt to attribute job to another user account.',
        category: 'cat-1',
        location: 'Queens, NY',
        urgency: 'low',
        budget: 100,
        customerId: 'adv-cust-alice',
        userId: 'adv-cust-alice',
        customerName: 'Alice AdvCustomer',
        customerEmail: 'alice@adv-test.com'
      };

      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', spoofPayload, bobCookie);
      assert.equal(res.status, 201);

      // The server MUST enforce customerId from req.user/session, NOT from the spoofed body
      assert.equal(res.data.job.customerId, 'adv-cust-bob', 'Job must be attributed to Bob (session user), NOT Alice');
      assert.equal(res.data.job.userId, 'adv-cust-bob');
      assert.equal(res.data.job.customerName, 'Bob AdvCustomer');
      assert.equal(res.data.job.customerEmail, 'bob@adv-test.com');
    });

    await test('SECURITY', 'ADV-3.4', 'Ownership hijacking & immutable metadata protection on PATCH', async () => {
      // Alice (owner) tries to alter immutable fields: id, customerId, userId, createdAt, customerEmail
      const originalJob = (await httpRequest(baseUrl, 'GET', `/api/jobs/${aliceJobId}`)).data.job;

      const hijackPayload = {
        id: 'hijacked-new-uuid-99999',
        customerId: 'adv-cust-bob',
        userId: 'adv-cust-bob',
        customerName: 'Bob Impersonator',
        customerEmail: 'bob@adv-test.com',
        createdAt: '1970-01-01T00:00:00.000Z',
        title: 'Legitimate Title Update by Alice'
      };

      const patchRes = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${aliceJobId}`, hijackPayload, aliceCookie);
      assert.equal(patchRes.status, 200);

      const updatedJob = patchRes.data.job;
      assert.equal(updatedJob.id, aliceJobId, 'Job ID must be immutable');
      assert.equal(updatedJob.customerId, originalJob.customerId, 'customerId must be immutable');
      assert.equal(updatedJob.userId, originalJob.userId, 'userId must be immutable');
      assert.equal(updatedJob.customerName, originalJob.customerName, 'customerName must be immutable');
      assert.equal(updatedJob.customerEmail, originalJob.customerEmail, 'customerEmail must be immutable');
      assert.equal(updatedJob.createdAt, originalJob.createdAt, 'createdAt must be immutable');
      assert.equal(updatedJob.title, 'Legitimate Title Update by Alice', 'Permitted field was successfully updated');
    });

    await test('SECURITY', 'ADV-3.5', 'Role privilege escalation: Pro user blocked from posting jobs', async () => {
      // Dan is a verified professional, NOT a customer
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Professional Posting Job Attempt',
        description: 'Professionals must not be allowed to post jobs as customers.',
        category: 'cat-1',
        location: 'Manhattan, NY',
        urgency: 'low',
        budget: 200
      }, danCookie);

      assert.equal(res.status, 403, `Expected 403 Forbidden for pro role, got ${res.status}`);
      assert.equal(res.data.success, false);
      assert.match(res.data.error, /Only verified customers can post jobs/i);

      // Dan also cannot PATCH or DELETE Alice's job
      const patchRes = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${aliceJobId}`, { title: 'Dan Hacking Alice Job' }, danCookie);
      assert.equal(patchRes.status, 403);

      const deleteRes = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${aliceJobId}`, null, danCookie);
      assert.equal(deleteRes.status, 403);
    });

    await test('SECURITY', 'ADV-3.6', 'Unverified customer blocked from posting jobs', async () => {
      // Charlie has role 'customer' but isVerified is false
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Unverified Customer Posting Attempt',
        description: 'Unverified customer accounts must be blocked from posting jobs.',
        category: 'cat-2',
        location: 'Queens, NY',
        urgency: 'low',
        budget: 150
      }, charlieCookie);

      assert.equal(res.status, 403, `Expected 403 Forbidden for unverified customer, got ${res.status}`);
      assert.equal(res.data.success, false);
      assert.match(res.data.error, /Only verified customers can post jobs/i);
    });

    await test('SECURITY', 'ADV-3.7', 'Unauthenticated & forged session cookie rejection', async () => {
      // 1. Missing cookie
      const r1 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'No Session Job Posting',
        description: 'Testing unauthenticated access rejection.',
        category: 'cat-1',
        location: 'NYC',
        urgency: 'low',
        budget: 100
      }, null);
      assert.equal(r1.status, 401);

      // 2. Forged signature / invalid session cookie
      const r2 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Forged Session Job Posting',
        description: 'Testing forged session signature rejection.',
        category: 'cat-1',
        location: 'NYC',
        urgency: 'low',
        budget: 100
      }, 'connect.sid=s%3Aforged_invalid_signature_cookie_xyz');
      assert.equal(r2.status, 401);

      // 3. Header spoofing (sending x-user-id / x-role)
      const r3 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Header Spoofing Job Posting',
        description: 'Testing header spoofing rejection.',
        category: 'cat-1',
        location: 'NYC',
        urgency: 'low',
        budget: 100
      }, null, { 'x-user-id': 'adv-cust-alice', 'x-role': 'admin' });
      assert.equal(r3.status, 401);
    });

    await test('SECURITY', 'ADV-3.8', 'Admin privileges verified & non-admin role header tampering ignored', async () => {
      // 1. Eve (Admin) can PATCH Alice's job
      const adminPatchRes = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${aliceJobId}`, {
        title: 'Title Moderated by Admin Eve',
        urgency: 'urgent'
      }, eveCookie);
      assert.equal(adminPatchRes.status, 200, `Admin PATCH failed: ${JSON.stringify(adminPatchRes.data)}`);
      assert.equal(adminPatchRes.data.job.title, 'Title Moderated by Admin Eve');

      // 2. Bob cannot claim admin via headers or body
      const bobTamperRes = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${aliceJobId}`, {
        title: 'Bob Claiming Admin Spoof'
      }, bobCookie, { 'role': 'admin', 'x-admin': 'true' });
      assert.equal(bobTamperRes.status, 403, 'Bob must not be able to bypass ownership via admin headers');

      // 3. Eve (Admin) can DELETE Alice's job
      const adminDeleteRes = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${aliceJobId}`, null, eveCookie);
      assert.equal(adminDeleteRes.status, 200, 'Admin DELETE must succeed');
      assert.equal(adminDeleteRes.data.job.status, 'cancelled');
    });

    await test('SECURITY', 'ADV-3.9', 'Prototype pollution attack vectors neutralized', async () => {
      const protoPayload = {
        title: 'Prototype Pollution Test Job',
        description: 'Attempting to inject __proto__ and constructor prototype keys.',
        category: 'cat-1',
        location: 'NYC',
        urgency: 'low',
        budget: 100,
        __proto__: { polluted: 'YES_POLLUTED' },
        constructor: { prototype: { polluted: 'YES_POLLUTED' } }
      };

      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', protoPayload, aliceCookie);
      assert.equal(res.status, 201);

      // Verify global prototype was not polluted
      const checkObj = {};
      assert.equal(checkObj.polluted, undefined, 'Object.prototype must NOT be polluted');
      assert.equal(Object.prototype.polluted, undefined, 'Object.prototype must NOT be polluted');
    });

    await test('SECURITY', 'ADV-3.10', 'Soft delete lifecycle: excluded from default open list, present in status=all and single GET', async () => {
      // Alice creates a fresh job to test cancellation lifecycle
      const createRes = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Job To Be Cancelled By Alice',
        description: 'Verifying complete lifecycle of soft-cancelled job records.',
        category: 'cat-11',
        location: 'Brooklyn, NY',
        urgency: 'medium',
        budget: 300
      }, aliceCookie);
      assert.equal(createRes.status, 201);
      const cancelJobId = createRes.data.job.id;

      // Cancel the job
      const cancelRes = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${cancelJobId}`, null, aliceCookie);
      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.data.job.status, 'cancelled');

      // Default GET /api/jobs (status='open') MUST NOT include the cancelled job
      const listOpenRes = await httpRequest(baseUrl, 'GET', '/api/jobs');
      assert.equal(listOpenRes.status, 200);
      const foundInOpen = listOpenRes.data.jobs.find(j => j.id === cancelJobId);
      assert.equal(foundInOpen, undefined, 'Cancelled job must NOT appear in default open jobs list');

      // GET /api/jobs?status=cancelled MUST include the cancelled job
      const listCancelledRes = await httpRequest(baseUrl, 'GET', '/api/jobs?status=cancelled');
      assert.equal(listCancelledRes.status, 200);
      const foundInCancelled = listCancelledRes.data.jobs.find(j => j.id === cancelJobId);
      assert.ok(foundInCancelled, 'Cancelled job must appear when filtered by status=cancelled');

      // GET /api/jobs?status=all MUST include the cancelled job
      const listAllRes = await httpRequest(baseUrl, 'GET', '/api/jobs?status=all');
      assert.equal(listAllRes.status, 200);
      const foundInAll = listAllRes.data.jobs.find(j => j.id === cancelJobId);
      assert.ok(foundInAll, 'Cancelled job must appear when filtered by status=all');

      // GET /api/jobs/:id directly MUST return the job details with status='cancelled'
      const singleRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${cancelJobId}`);
      assert.equal(singleRes.status, 200);
      assert.equal(singleRes.data.job.status, 'cancelled');
    });

  } finally {
    if (server && server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
    restoreDb();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================================');
  console.log('ADVERSARIAL STRESS SUITE EXECUTION SUMMARY');
  console.log('======================================================================');
  const passedCount = results.filter(r => r.status === 'PASS').length;
  const failedCount = results.filter(r => r.status === 'FAIL').length;

  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  if (failedCount > 0) {
    console.log('\nFAILED TESTS:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  - [${r.id}] ${r.name}: ${r.error}`);
    }
    console.log('\n❌ VERDICT: REQUEST_CHANGES');
    process.exitCode = 1;
  } else {
    console.log('\n🎉 ALL 18 ADVERSARIAL STRESS & SECURITY TESTS PASSED!');
    console.log('VERDICT: APPROVE');
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal unhandled error in adversarial test runner:', err);
  restoreDb();
  process.exit(1);
});
