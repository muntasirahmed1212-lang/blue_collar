/**
 * tests/fresh-empirical-probes.test.js
 * Fresh Empirical Probes for Milestone M1 Remediation Verification
 * BlueCollar Connect — Post Jobs API
 *
 * Investigator: challenger_m1_retest
 * Roles: Empirical Challenger / Critic / Specialist
 *
 * Direct Empirical Testing Targets:
 * 1. Duplicate query parameters on GET /api/jobs
 *    - ?sort=newest&sort=oldest
 *    - ?status=open&status=cancelled
 *    - ?category=cat-1&category=cat-2
 *    - ?urgency=high&urgency=low
 *    - ?location=New%20York&location=Brooklyn
 *    - ?limit=5&limit=10
 *    - Multi-duplicate combination query
 *    - Verify no TypeErrors/HTTP 500 crashes and valid response payload structure
 *
 * 2. Category '__proto__' in POST /api/jobs and PATCH /api/jobs/:id
 *    - POST category '__proto__' -> 400 Bad Request
 *    - POST category 'constructor' -> 201 Created (valid slug for cat-5)
 *    - POST category 'toString', 'valueOf', '__defineGetter__' -> 400 Bad Request
 *    - PATCH category '__proto__' -> 400 Bad Request
 *    - PATCH category 'toString' -> 400 Bad Request
 *    - PATCH category 'constructor' -> 200 OK (valid slug for cat-5)
 *    - Verify database integrity (no corrupted or blank category records)
 *
 * 3. Negative budgets in object ranges and strings
 *    - Objects: { min: -500, max: 100 }, { min: 50, max: -100 }, { min: -500, max: -100 }
 *    - Objects: { min: -500 }, { max: -100 }, { min: 500, max: 100 }, { min: 0, max: 0 }
 *    - Strings: "-500", "-$500", "$-500", "-500 - -100", "100 - -200", "-100 - 200", "$100 to -$200"
 *    - Strings: "--500", "Up to -500", "from -100", "-100+"
 *    - Numbers: -500, -0.5, 0
 *    - PATCH with negative object ranges and negative strings
 *    - Legitimate positive budgets: "150", "$150", "$100 - $300", { min: 100, max: 300 }, "Up to $500"
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');

const authRoutes = require('../server/routes/auth');
const jobRoutes = require('../server/routes/jobs');
const db = require('../server/db/database');

// Database backup and restore
const BACKUP_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';
const BACKUP_JOBS = fs.existsSync(JOBS_JSON_PATH) ? fs.readFileSync(JOBS_JSON_PATH, 'utf8') : '[]';

let restored = false;
function restoreDatabases() {
  if (restored) return;
  restored = true;
  try {
    fs.writeFileSync(USERS_JSON_PATH, BACKUP_USERS, 'utf8');
    fs.writeFileSync(JOBS_JSON_PATH, BACKUP_JOBS, 'utf8');
  } catch (e) {
    console.error('Error restoring test databases:', e.message);
  }
}

process.on('exit', restoreDatabases);
process.on('SIGINT', () => { restoreDatabases(); process.exit(1); });
process.on('SIGTERM', () => { restoreDatabases(); process.exit(1); });

function rawHttpRequest(baseUrl, reqPath, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { ...headers }
    };

    if (body !== null && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = rawData;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: rawData
        });
      });
    });

    req.on('error', reject);

    if (body !== null) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: 'fresh_empirical_probes_secret_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
  }));

  app.post('/__test__/login', (req, res) => {
    const { userId } = req.body || {};
    if (userId) {
      req.session.userId = userId;
      return res.json({ success: true, userId });
    }
    res.status(400).json({ success: false });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/jobs', jobRoutes);

  app.use((err, req, res, next) => {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error('Unhandled server error in probe app:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

async function runProbes() {
  console.log('======================================================================');
  console.log('FRESH EMPIRICAL PROBES — CHALLENGER M1 RETEST');
  console.log('Targeting: Duplicate Query Params, Prototype Keys, Negative Budgets');
  console.log('======================================================================\n');

  const { server, baseUrl } = await startServer();

  let totalProbes = 0;
  let passedProbes = 0;
  let failedProbes = 0;
  const failures = [];

  function record(id, desc, passed, detail = '') {
    totalProbes++;
    if (passed) {
      passedProbes++;
      console.log(`  ✅ [PASS] ${id}: ${desc}`);
    } else {
      failedProbes++;
      console.log(`  ❌ [FAIL] ${id}: ${desc} -> ${detail}`);
      failures.push({ id, desc, detail });
    }
  }

  try {
    // 0. Setup verified customer session
    const users = JSON.parse(BACKUP_USERS);
    let customer = users.find(u => u.role === 'customer' && u.isVerified);
    if (!customer) {
      customer = {
        id: 'c-test-probe-01',
        fullName: 'Probe Tester Customer',
        email: 'probe-customer@test.com',
        role: 'customer',
        isVerified: true
      };
      users.push(customer);
      fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(users, null, 2), 'utf8');
    }

    const loginRes = await rawHttpRequest(baseUrl, '/__test__/login', 'POST', {}, { userId: customer.id });
    const rawCookies = loginRes.headers['set-cookie'];
    const authCookie = Array.isArray(rawCookies) ? rawCookies[0].split(';')[0] : (rawCookies ? rawCookies.split(';')[0] : '');
    const authHeaders = {
      'Cookie': authCookie,
      'Content-Type': 'application/json'
    };

    // Helper base job
    const baseJob = {
      title: 'Emergency Electrical Wiring Repair',
      description: 'Circuit breaker trips repeatedly whenever multiple kitchen appliances run simultaneously.',
      category: 'cat-1',
      location: '100 Broadway, New York, NY',
      urgency: 'urgent',
      budget: '$250 - $450'
    };

    // ──────────────────────────────────────────────────────────────────────────
    // PROBE GROUP 1: Duplicate Query Parameters on GET /api/jobs
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBE GROUP 1: Duplicate Query Parameters on GET /api/jobs ---');

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?sort=newest&sort=oldest');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.1', 'Duplicate ?sort=newest&sort=oldest returns 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?status=open&status=cancelled');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.2', 'Duplicate ?status=open&status=cancelled returns 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?category=cat-1&category=cat-2');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.3', 'Duplicate ?category=cat-1&category=cat-2 returns 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?urgency=high&urgency=low');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.4', 'Duplicate ?urgency=high&urgency=low returns 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?location=New%20York&location=Brooklyn');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.5', 'Duplicate ?location=New%20York&location=Brooklyn returns 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?limit=5&limit=10');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.6', 'Duplicate ?limit=5&limit=10 returns 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      const combinedPath = '/api/jobs?sort=newest&sort=oldest&status=open&status=all&category=cat-1&category=electrician&urgency=urgent&urgency=low&limit=2&limit=5&location=New&location=York';
      const res = await rawHttpRequest(baseUrl, combinedPath);
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.7', 'Massively combined duplicate query params return 200 without TypeError', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      // Triple and empty duplicate params
      const res = await rawHttpRequest(baseUrl, '/api/jobs?sort=&sort=newest&sort=oldest');
      const ok = res.status === 200 && res.data && res.data.success === true && Array.isArray(res.data.jobs);
      record('PROBE-1.8', 'Duplicate params with empty first item (?sort=&sort=newest) falls back cleanly', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PROBE GROUP 2: Category '__proto__' in POST /api/jobs and PATCH /api/jobs/:id
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBE GROUP 2: Category Prototype Attack Surface & Slug Validation ---');

    {
      // 2.1 POST with category '__proto__'
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        category: '__proto__'
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record('PROBE-2.1', 'POST /api/jobs with category "__proto__" strictly returns 400 (never 201 or 500)', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      // 2.2 Verify no corrupt jobs were persisted from prototype attack
      const jobsOnDisk = db.readJobs();
      const corruptedJob = jobsOnDisk.find(j => j.category === '' || j.category === '__proto__' || j.categorySlug === '' || j.categoryName === '');
      record('PROBE-2.2', 'Database verification: zero corrupted jobs with empty or prototype category exist', !corruptedJob, `Found corrupted job: ${JSON.stringify(corruptedJob)}`);
    }

    {
      // 2.3 POST with other prototype properties
      const prototypeKeys = ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__defineGetter__', '__defineSetter__'];
      let allProtoBlocked = true;
      let failureDetail = '';
      for (const pk of prototypeKeys) {
        const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
          ...baseJob,
          category: pk
        });
        if (res.status !== 400) {
          allProtoBlocked = false;
          failureDetail = `Key ${pk} gave HTTP ${res.status}`;
          break;
        }
      }
      record('PROBE-2.3', 'POST /api/jobs with prototype built-ins (toString, valueOf, etc.) all return 400', allProtoBlocked, failureDetail);
    }

    {
      // 2.4 POST with legitimate slug 'constructor' (must map to cat-5)
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        title: 'Need Professional General Contractor',
        category: 'constructor'
      });
      const ok = res.status === 201 && res.data && res.data.success === true &&
                 res.data.job && res.data.job.category === 'cat-5' &&
                 res.data.job.categorySlug === 'constructor' &&
                 res.data.job.categoryName === 'Constructor';
      record('PROBE-2.4', 'POST /api/jobs with category "constructor" correctly resolves to cat-5 Constructor with 201', ok, `Status: ${res.status}, job: ${JSON.stringify(res.data ? res.data.job : null)}`);
    }

    // Create a seed job for PATCH probes
    let patchSeedJobId = null;
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        title: 'Seed Job for Prototype and Budget PATCH Probes',
        category: 'cat-2'
      });
      if (res.status === 201 && res.data && res.data.job) {
        patchSeedJobId = res.data.job.id;
      }
    }

    {
      // 2.5 PATCH category with '__proto__'
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        category: '__proto__'
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record('PROBE-2.5', 'PATCH /api/jobs/:id with category "__proto__" strictly returns 400', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      // 2.6 Verify job category remains intact after rejected PATCH
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`);
      const ok = res.status === 200 && res.data && res.data.job && res.data.job.category === 'cat-2';
      record('PROBE-2.6', 'Target job retains pristine category "cat-2" after rejected prototype PATCH', ok, `Category: ${res.data ? res.data.job.category : 'N/A'}`);
    }

    {
      // 2.7 PATCH category with 'toString'
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        category: 'toString'
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record('PROBE-2.7', 'PATCH /api/jobs/:id with category "toString" strictly returns 400', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    {
      // 2.8 PATCH category with 'constructor' (must update to cat-5)
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        category: 'constructor'
      });
      const ok = res.status === 200 && res.data && res.data.job &&
                 res.data.job.category === 'cat-5' &&
                 res.data.job.categorySlug === 'constructor' &&
                 res.data.job.categoryName === 'Constructor';
      record('PROBE-2.8', 'PATCH /api/jobs/:id with category "constructor" updates cleanly to cat-5 Constructor', ok, `Status: ${res.status}, job: ${JSON.stringify(res.data ? res.data.job : null)}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PROBE GROUP 3: Negative Budgets in Object Ranges and Strings
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PROBE GROUP 3: Negative Budgets in Object Ranges and Strings ---');

    // 3.1 Object range tests with negative bounds
    const negativeBudgetObjects = [
      { label: '{ min: -500, max: 100 }', obj: { min: -500, max: 100 } },
      { label: '{ min: 50, max: -100 }', obj: { min: 50, max: -100 } },
      { label: '{ min: -500, max: -100 }', obj: { min: -500, max: -100 } },
      { label: '{ min: -500 }', obj: { min: -500 } },
      { label: '{ max: -100 }', obj: { max: -100 } },
      { label: '{ min: 500, max: 100 } (inverted)', obj: { min: 500, max: 100 } },
      { label: '{ min: 0, max: 0 } (all zero)', obj: { min: 0, max: 0 } },
      { label: '{ min: -0.01, max: 100 }', obj: { min: -0.01, max: 100 } },
      { label: '{ min: "-500", max: "100" } (string min inside object)', obj: { min: '-500', max: '100' } }
    ];

    for (const testCase of negativeBudgetObjects) {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        budget: testCase.obj
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record(`PROBE-3.1-${testCase.label}`, `POST /api/jobs with budget object ${testCase.label} returns 400`, ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // 3.2 Negative budget strings
    const negativeBudgetStrings = [
      '-500',
      '-$500',
      '$-500',
      '-500 - -100',
      '100 - -200',
      '-100 - 200',
      '$100 to -$200',
      '--500',
      'Up to -500',
      'from -100',
      '-100+',
      'min -50',
      'max -250',
      'under -$100'
    ];

    for (const str of negativeBudgetStrings) {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        budget: str
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record(`PROBE-3.2-"${str}"`, `POST /api/jobs with negative budget string "${str}" returns 400`, ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // 3.3 Primitive negative numbers
    const negativeNumbers = [-500, -0.01, -1, 0];
    for (const num of negativeNumbers) {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        budget: num
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record(`PROBE-3.3-${num}`, `POST /api/jobs with numeric budget (${num}) returns 400`, ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // 3.4 PATCH with negative budgets
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        budget: { min: -50, max: 100 }
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record('PROBE-3.4-obj', 'PATCH /api/jobs/:id with negative object budget { min: -50, max: 100 } returns 400', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        budget: '-100'
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record('PROBE-3.4-str', 'PATCH /api/jobs/:id with negative budget string "-100" returns 400', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        budget: { min: 300, max: 100 }
      });
      const ok = res.status === 400 && res.data && res.data.success === false;
      record('PROBE-3.4-inv', 'PATCH /api/jobs/:id with inverted budget { min: 300, max: 100 } returns 400', ok, `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // 3.5 Legitimate positive budgets (verify no regressions / false positives)
    const validBudgets = [
      { label: 'String number "150"', val: '150' },
      { label: 'Currency string "$150"', val: '$150' },
      { label: 'Range string "$100 - $300"', val: '$100 - $300' },
      { label: 'Unadorned range "100 - 300"', val: '100 - 300' },
      { label: 'Object range { min: 100, max: 300 }', val: { min: 100, max: 300 } },
      { label: 'Object min only { min: 150 }', val: { min: 150 } },
      { label: 'Object max only { max: 500 }', val: { max: 500 } },
      { label: 'Phrase "Up to $500"', val: 'Up to $500' },
      { label: 'Phrase "from $200"', val: 'from $200' },
      { label: 'Plus suffix "$250+"', val: '$250+' },
      { label: 'Primitive number 350', val: 350 }
    ];

    for (const vb of validBudgets) {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {
        ...baseJob,
        title: `Valid Job for ${vb.label}`,
        budget: vb.val
      });
      const ok = res.status === 201 && res.data && res.data.success === true && res.data.job && res.data.job.budget;
      record(`PROBE-3.5-${vb.label}`, `POST /api/jobs with valid budget (${vb.label}) returns 201`, ok, `Status: ${res.status}, budget: ${res.data && res.data.job ? res.data.job.budget : 'N/A'}`);
    }

    // 3.6 Valid budget update on PATCH
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${patchSeedJobId}`, 'PATCH', authHeaders, {
        budget: '$300 - $600'
      });
      const ok = res.status === 200 && res.data && res.data.job && res.data.job.budget === '$300 - $600';
      record('PROBE-3.6-patch-valid', 'PATCH /api/jobs/:id with valid budget "$300 - $600" returns 200 and updates record', ok, `Status: ${res.status}, budget: ${res.data && res.data.job ? res.data.job.budget : 'N/A'}`);
    }

  } catch (err) {
    console.error('Fatal probe execution error:', err);
    record('FATAL', 'Probe runner crashed', false, err.stack || err.message);
  } finally {
    server.close();
    restoreDatabases();
  }

  console.log('\n======================================================================');
  console.log('FRESH EMPIRICAL PROBES SUMMARY');
  console.log('======================================================================');
  console.log(`TOTAL PROBES RUN : ${totalProbes}`);
  console.log(`PASSED           : ${passedProbes}`);
  console.log(`FAILED           : ${failedProbes}`);

  if (failedProbes > 0) {
    console.log('\nFailed Probes:');
    for (const f of failures) {
      console.log(`  - ${f.id}: ${f.desc} (${f.detail})`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL FRESH EMPIRICAL PROBES PASSED 100%!');
    process.exit(0);
  }
}

runProbes();
