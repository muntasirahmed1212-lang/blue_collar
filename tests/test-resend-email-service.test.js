const assert = require('assert');
const emailService = require('../server/services/emailService');

async function runTests() {
  console.log('======================================================================');
  console.log('  RESEND EMAIL SERVICE VERIFICATION TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // 1. Export structure
  test('emailService exports sendOTPEmail function and resend client', () => {
    assert.strictEqual(typeof emailService.sendOTPEmail, 'function');
    assert.ok(emailService.resend, 'resend client should be exported');
    assert.strictEqual(typeof emailService.resend.emails.send, 'function');
  });

  // 2. Successful OTP verification email dispatch formatting
  await testAsync('sendOTPEmail constructs valid Resend payload for verification', async () => {
    const originalSend = emailService.resend.emails.send;
    let capturedPayload = null;

    emailService.resend.emails.send = async (payload) => {
      capturedPayload = payload;
      return { data: { id: 'msg_test_123' }, error: null };
    };

    try {
      const result = await emailService.sendOTPEmail('user@example.com', {
        userName: 'Test User',
        otpCode: '482910',
        purpose: 'verification',
        expiryMinutes: 5
      });

      assert.deepStrictEqual(result, { id: 'msg_test_123' });
      assert.ok(capturedPayload, 'Payload should have been passed to resend.emails.send');
      assert.deepStrictEqual(capturedPayload.to, ['user@example.com']);
      assert.ok(capturedPayload.subject.includes('482910 is your BlueCollar Connect verification code'));
      assert.ok(capturedPayload.html.includes('482910'));
      assert.ok(capturedPayload.text.includes('482910'));
      assert.ok(capturedPayload.from.includes('BlueCollar Connect'));
    } finally {
      emailService.resend.emails.send = originalSend;
    }
  });

  // 3. Password reset subject formatting
  await testAsync('sendOTPEmail constructs proper subject for password-reset', async () => {
    const originalSend = emailService.resend.emails.send;
    let capturedSubject = null;

    emailService.resend.emails.send = async (payload) => {
      capturedSubject = payload.subject;
      return { data: { id: 'msg_pw_456' }, error: null };
    };

    try {
      await emailService.sendOTPEmail('user@example.com', {
        userName: 'Reset User',
        otpCode: '112233',
        purpose: 'password-reset',
        expiryMinutes: 10
      });

      assert.ok(capturedSubject.includes('112233 is your BlueCollar Connect password reset code'));
    } finally {
      emailService.resend.emails.send = originalSend;
    }
  });

  // 4. Retry on transient error (e.g., 429 Rate Limit)
  await testAsync('sendOTPEmail retries once on transient HTTP error (429)', async () => {
    const originalSend = emailService.resend.emails.send;
    let callCount = 0;

    emailService.resend.emails.send = async () => {
      callCount++;
      if (callCount === 1) {
        return { data: null, error: { message: 'Too many requests', statusCode: 429, name: 'rate_limit_exceeded' } };
      }
      return { data: { id: 'msg_retried_ok' }, error: null };
    };

    try {
      const result = await emailService.sendOTPEmail('retry@example.com', {
        userName: 'Retry User',
        otpCode: '999888',
        purpose: 'verification',
        expiryMinutes: 5
      });

      assert.strictEqual(callCount, 2, 'Should have retried exactly once');
      assert.deepStrictEqual(result, { id: 'msg_retried_ok' });
    } finally {
      emailService.resend.emails.send = originalSend;
    }
  });

  // 5. Permanent error propagates without hanging
  await testAsync('sendOTPEmail throws on permanent error (e.g. 400 Invalid from address)', async () => {
    const originalSend = emailService.resend.emails.send;

    emailService.resend.emails.send = async () => {
      return { data: null, error: { message: 'The domain does not exist', statusCode: 400, name: 'invalid_from_address' } };
    };

    try {
      let threw = false;
      try {
        await emailService.sendOTPEmail('invalid@example.com', {
          userName: 'Fail User',
          otpCode: '000000',
          purpose: 'verification',
          expiryMinutes: 5
        });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('The domain does not exist'));
      }
      assert.strictEqual(threw, true, 'Permanent error should throw immediately');
    } finally {
      emailService.resend.emails.send = originalSend;
    }
  });

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('======================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
