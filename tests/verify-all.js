/**
 * tests/verify-all.js
 * 
 * Master E2E & Zero-Regression Verification Test Runner
 * Milestone M4: Full E2E & Zero Regression Verification
 * 
 * Executes all 11 test suites across the project sequentially, capturing outputs,
 * validating exit codes, ensuring database isolation, and rendering a unified summary table.
 * 
 * Usage:
 *   node tests/verify-all.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');

// Pristine database snapshots for reset between test suites
const PRISTINE_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';
const PRISTINE_JOBS = fs.existsSync(JOBS_JSON_PATH) ? fs.readFileSync(JOBS_JSON_PATH, 'utf8') : '[]';

function restorePristineDb() {
  try {
    fs.writeFileSync(USERS_JSON_PATH, PRISTINE_USERS, 'utf8');
    fs.writeFileSync(JOBS_JSON_PATH, PRISTINE_JOBS, 'utf8');
  } catch (err) {
    console.error('Failed to restore pristine DB snapshot:', err.message);
  }
}

// 11 Test Suites Specification
const SUITES = [
  {
    id: 1,
    name: 'Tier 1-4 Post Jobs E2E Suite',
    file: 'tests/verify-jobs.js',
    expectedTests: 34,
    parse: (stdout) => {
      const match = stdout.match(/TOTAL:\s*(\d+)\s+tests\s*\|\s*PASSED:\s*(\d+)\s*\|\s*FAILED:\s*(\d+)/i);
      if (match) {
        return { total: parseInt(match[1], 10), passed: parseInt(match[2], 10), failed: parseInt(match[3], 10) };
      }
      return null;
    }
  },
  {
    id: 2,
    name: 'Auth, OTP & Regression Suite',
    file: 'tests/verify-all-ac.js',
    expectedTests: 6,
    parse: (stdout) => {
      const passMatches = stdout.match(/\[PASS\]\s+AC\d+:/gi) || [];
      const failMatches = stdout.match(/\[FAIL\]\s+AC\d+:/gi) || [];
      if (passMatches.length > 0 || failMatches.length > 0) {
        return { total: passMatches.length + failMatches.length, passed: passMatches.length, failed: failMatches.length };
      }
      return null;
    }
  },
  {
    id: 3,
    name: 'M2 Component Verification',
    file: 'tests/verify-m2.js',
    expectedTests: 7,
    parse: (stdout) => {
      const match = stdout.match(/SUMMARY:\s*(\d+)\s*\/\s*(\d+)\s*tests passed/i);
      if (match) {
        const passed = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        return { total, passed, failed: total - passed };
      }
      return null;
    }
  },
  {
    id: 4,
    name: 'M3 Component Verification',
    file: 'tests/verify-m3.js',
    expectedTests: 8,
    parse: (stdout) => {
      const match = stdout.match(/SUMMARY:\s*(\d+)\s*\/\s*(\d+)\s*tests passed/i);
      if (match) {
        const passed = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        return { total, passed, failed: total - passed };
      }
      return null;
    }
  },
  {
    id: 5,
    name: 'M1 Adversarial Fuzzing Suite',
    file: 'tests/adversarial-fuzzing-m1.test.js',
    expectedTests: 125,
    parse: (stdout) => {
      const matchTotal = stdout.match(/TOTAL TESTS RUN\s*:\s*(\d+)/i);
      const matchPass = stdout.match(/PASSED\s*:\s*(\d+)/i);
      const matchFail = stdout.match(/FAILED\s*:\s*(\d+)/i);
      if (matchTotal && matchPass && matchFail) {
        return {
          total: parseInt(matchTotal[1], 10),
          passed: parseInt(matchPass[1], 10),
          failed: parseInt(matchFail[1], 10)
        };
      }
      return null;
    }
  },
  {
    id: 6,
    name: 'M1 Adversarial Stress Suite',
    file: 'tests/adversarial-stress-m1.test.js',
    expectedTests: 18,
    parse: (stdout) => {
      const match = stdout.match(/TOTAL TESTS:\s*(\d+)\s*\|\s*PASSED:\s*(\d+)\s*\|\s*FAILED:\s*(\d+)/i);
      if (match) {
        return { total: parseInt(match[1], 10), passed: parseInt(match[2], 10), failed: parseInt(match[3], 10) };
      }
      return null;
    }
  },
  {
    id: 7,
    name: 'M2 Button Wiring Suite',
    file: 'tests/adversarial-m2-buttons.test.js',
    expectedTests: 25,
    parse: (stdout) => {
      const matchTotal = stdout.match(/TOTAL TESTS:\s*(\d+)/i);
      const matchPass = stdout.match(/PASSED:\s*(\d+)/i);
      const matchFail = stdout.match(/FAILED:\s*(\d+)/i);
      if (matchTotal && matchPass && matchFail) {
        return {
          total: parseInt(matchTotal[1], 10),
          passed: parseInt(matchPass[1], 10),
          failed: parseInt(matchFail[1], 10)
        };
      }
      return null;
    }
  },
  {
    id: 8,
    name: 'M2 CDP Browser Suite',
    file: 'tests/adversarial-m2-cdp.test.js',
    expectedTests: 33,
    parse: (stdout) => {
      const match = stdout.match(/CHALLENGER EXECUTION SUMMARY:\s*(\d+)\s*PASSED\s*\|\s*(\d+)\s*FAILED/i);
      if (match) {
        const passed = parseInt(match[1], 10);
        const failed = parseInt(match[2], 10);
        return { total: passed + failed, passed, failed };
      }
      return null;
    }
  },
  {
    id: 9,
    name: 'M3 Homepage & Nav Suite',
    file: 'tests/adversarial-m3-preview-nav.test.js',
    expectedTests: 13,
    parse: (stdout) => {
      const match = stdout.match(/EXECUTION SUMMARY:\s*(\d+)\s*\/\s*(\d+)\s*passed\s*\((\d+)\s*failed\)/i);
      if (match) {
        return {
          passed: parseInt(match[1], 10),
          total: parseInt(match[2], 10),
          failed: parseInt(match[3], 10)
        };
      }
      return null;
    }
  },
  {
    id: 10,
    name: 'M3 Adversarial Review Suite',
    file: 'tests/adversarial-m3-review.js',
    expectedTests: 11,
    parse: (stdout) => {
      const match = stdout.match(/AUDIT SUMMARY:\s*(\d+)\s*\/\s*(\d+)\s*tests passed/i);
      if (match) {
        const passed = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        return { total, passed, failed: total - passed };
      }
      return null;
    }
  },
  {
    id: 11,
    name: 'M3 Jobs Page Interaction Suite',
    file: 'tests/challenger-m3-jobs-page.test.js',
    expectedTests: 40,
    parse: (stdout) => {
      const match = stdout.match(/CHALLENGER EXECUTION SUMMARY:\s*(\d+)\s*PASSED\s*\|\s*(\d+)\s*FAILED/i);
      if (match) {
        const passed = parseInt(match[1], 10);
        const failed = parseInt(match[2], 10);
        return { total: passed + failed, passed, failed };
      }
      return null;
    }
  }
];

function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const suiteFilePath = path.join(PROJECT_ROOT, suite.file);

    console.log(`\n▶ [${suite.id}/${SUITES.length}] RUNNING: ${suite.name} (${suite.file})...`);

    const child = spawn(process.execPath, [suiteFilePath], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      console.error(`  ❌ Spawn error: ${err.message}`);
      resolve({
        ...suite,
        duration,
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
        passed: 0,
        failed: suite.expectedTests,
        total: suite.expectedTests,
        status: 'FAIL'
      });
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      let parsed = null;
      try {
        parsed = suite.parse(stdout);
      } catch (e) {
        // ignore parse errors
      }

      let total = suite.expectedTests;
      let passed = 0;
      let failed = 0;

      if (parsed) {
        total = parsed.total;
        passed = parsed.passed;
        failed = parsed.failed;
      } else if (code === 0) {
        passed = suite.expectedTests;
        failed = 0;
        total = suite.expectedTests;
      } else {
        passed = 0;
        failed = suite.expectedTests;
        total = suite.expectedTests;
      }

      const status = (code === 0 && failed === 0) ? 'PASS' : 'FAIL';
      const icon = status === 'PASS' ? '✅' : '❌';

      console.log(`  ${icon} FINISHED: ${passed}/${total} passed (${failed} failed) in ${(duration / 1000).toFixed(2)}s`);

      // Ensure database is reset between test suites
      restorePristineDb();

      resolve({
        ...suite,
        duration,
        exitCode: code,
        stdout,
        stderr,
        passed,
        failed,
        total,
        status
      });
    });
  });
}

async function main() {
  console.log('================================================================================');
  console.log('       BLUECOLLAR CONNECT — MASTER E2E & REGRESSION TEST HARNESS (M4)');
  console.log('================================================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Suites to execute: ${SUITES.length}`);
  console.log(`Working directory: ${PROJECT_ROOT}`);
  console.log('================================================================================\n');

  const overallStart = Date.now();
  const results = [];

  for (const suite of SUITES) {
    const res = await runSuite(suite);
    results.push(res);
    // Settle delay between suites for clean process/port/file-handle teardown
    await new Promise(r => setTimeout(r, 500));
  }

  const overallDuration = ((Date.now() - overallStart) / 1000).toFixed(2);

  // Print Unified Summary Table
  console.log('\n');
  console.log('================================================================================');
  console.log('                     UNIFIED TEST EXECUTION SUMMARY TABLE                       ');
  console.log('================================================================================');

  const colId = '#'.padEnd(3);
  const colName = 'Suite Name'.padEnd(34);
  const colTests = 'Tests'.padStart(6);
  const colPassed = 'Passed'.padStart(7);
  const colFailed = 'Failed'.padStart(7);
  const colTime = 'Duration'.padStart(10);
  const colStatus = 'Status'.padStart(8);

  console.log(`${colId} | ${colName} | ${colTests} | ${colPassed} | ${colFailed} | ${colTime} | ${colStatus}`);
  console.log('-'.repeat(80));

  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;

  for (const r of results) {
    grandTotal += r.total;
    grandPassed += r.passed;
    grandFailed += r.failed;

    const rowId = String(r.id).padEnd(3);
    const rowName = r.name.padEnd(34);
    const rowTests = String(r.total).padStart(6);
    const rowPassed = String(r.passed).padStart(7);
    const rowFailed = String(r.failed).padStart(7);
    const rowTime = `${(r.duration / 1000).toFixed(2)}s`.padStart(10);
    const rowStatus = (r.status === 'PASS' ? 'PASS ✅' : 'FAIL ❌').padStart(8);

    console.log(`${rowId} | ${rowName} | ${rowTests} | ${rowPassed} | ${rowFailed} | ${rowTime} | ${rowStatus}`);
  }

  console.log('='.repeat(80));
  const rowGrandName = 'GRAND TOTAL'.padEnd(34);
  const rowGrandTests = String(grandTotal).padStart(6);
  const rowGrandPassed = String(grandPassed).padStart(7);
  const rowGrandFailed = String(grandFailed).padStart(7);
  const rowGrandTime = `${overallDuration}s`.padStart(10);
  const grandStatus = grandFailed === 0 ? 'ALL PASS ✅' : 'FAILURES ❌';

  console.log(`${' '.padEnd(3)} | ${rowGrandName} | ${rowGrandTests} | ${rowGrandPassed} | ${rowGrandFailed} | ${rowGrandTime} | ${grandStatus}`);
  console.log('================================================================================\n');

  if (grandFailed > 0) {
    console.error('❌ TEST FAILURES DETECTED:');
    for (const r of results.filter(res => res.status === 'FAIL')) {
      console.error(`\n--- [FAILED SUITE ${r.id}] ${r.name} (${r.file}) ---`);
      console.error(`Exit Code: ${r.exitCode}`);
      if (r.stderr) console.error(`STDERR:\n${r.stderr.slice(-1000)}`);
      if (r.stdout) console.error(`STDOUT (tail):\n${r.stdout.slice(-1000)}`);
    }
    console.error('\nVerification Verdict: REJECTED');
    process.exit(1);
  } else {
    console.log(`🎉 ALL ${grandTotal} TESTS PASSED ACROSS ALL ${SUITES.length} TEST SUITES!`);
    console.log('Zero regressions detected. 100% pass rate achieved.');
    console.log('Verification Verdict: APPROVED');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Harness Failure:', err);
  restorePristineDb();
  process.exit(1);
});
