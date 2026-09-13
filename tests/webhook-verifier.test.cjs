const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  verifyWebhook,
  parseSignatureHeader,
  createWebhookMiddleware,
  WebhookVerificationError,
} = require('../dist/checkout.cjs');

const SECRET_V1 = 'whsec_old_secret_1234567890abcdef';
const SECRET_V2 = 'whsec_new_rotated_secret_987654321';

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

test('parseSignatureHeader: parses multiple formats correctly', () => {
  const hex = 'a'.repeat(64);

  // raw hex
  assert.equal(parseSignatureHeader(hex).signatureHex, hex);

  // sha256=hex
  assert.equal(parseSignatureHeader(`sha256=${hex}`).signatureHex, hex);

  // v1=hex
  assert.equal(parseSignatureHeader(`v1=${hex}`).signatureHex, hex);

  // t=1700000000,v1=hex
  const res = parseSignatureHeader(`t=1700000000,v1=${hex}`);
  assert.equal(res.signatureHex, hex);
  assert.equal(res.headerTimestamp, 1700000000);

  // malformed
  assert.throws(() => parseSignatureHeader(''), WebhookVerificationError);
  assert.throws(() => parseSignatureHeader('invalid-hex'), WebhookVerificationError);
});

test('verifyWebhook: verifies valid payload with single secret', () => {
  const event = {
    eventId: 'evt_123',
    event: 'PAYMENT_CONFIRMED',
    transactionId: 'tx_999',
    tenantId: 'tenant_abc',
    amount: '100.00',
    currency: 'USDT',
    timestamp: new Date().toISOString(),
  };
  const rawPayload = JSON.stringify(event);
  const signature = sign(rawPayload, SECRET_V1);

  const verified = verifyWebhook({
    payload: Buffer.from(rawPayload),
    signatureHeader: `sha256=${signature}`,
    secrets: SECRET_V1,
  });

  assert.equal(verified.eventId, 'evt_123');
  assert.equal(verified.event, 'PAYMENT_CONFIRMED');
  assert.equal(verified.amount, '100.00');
});

test('verifyWebhook: supports secret rotation (old and new secret in secrets array)', () => {
  const event = {
    eventId: 'evt_rotation',
    event: 'PAYMENT_CONFIRMED',
    tenantId: 'tenant_abc',
    timestamp: new Date().toISOString(),
  };
  const rawPayload = JSON.stringify(event);

  // Signed with old secret
  const sigOld = sign(rawPayload, SECRET_V1);
  const verifiedOld = verifyWebhook({
    payload: rawPayload,
    signatureHeader: `v1=${sigOld}`,
    secrets: [SECRET_V1, SECRET_V2],
  });
  assert.equal(verifiedOld.eventId, 'evt_rotation');

  // Signed with new secret
  const sigNew = sign(rawPayload, SECRET_V2);
  const verifiedNew = verifyWebhook({
    payload: rawPayload,
    signatureHeader: `v1=${sigNew}`,
    secrets: [SECRET_V1, SECRET_V2],
  });
  assert.equal(verifiedNew.eventId, 'evt_rotation');
});

test('verifyWebhook: rejects tampered body or invalid signature', () => {
  const rawPayload = JSON.stringify({ eventId: 'evt_original', amount: '10' });
  const sig = sign(rawPayload, SECRET_V1);

  // Tampered payload
  const tamperedPayload = JSON.stringify({ eventId: 'evt_original', amount: '100' });
  assert.throws(
    () =>
      verifyWebhook({
        payload: tamperedPayload,
        signatureHeader: sig,
        secrets: SECRET_V1,
      }),
    (err) => {
      assert.ok(err instanceof WebhookVerificationError);
      assert.equal(err.code, 'INVALID_SIGNATURE');
      return true;
    }
  );

  // Wrong secret
  assert.throws(
    () =>
      verifyWebhook({
        payload: rawPayload,
        signatureHeader: sig,
        secrets: 'wrong_secret',
      }),
    (err) => {
      assert.ok(err instanceof WebhookVerificationError);
      assert.equal(err.code, 'INVALID_SIGNATURE');
      return true;
    }
  );
});

test('verifyWebhook: enforces replay window timestamp tolerance', () => {
  const oldTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago
  const oldEvent = {
    eventId: 'evt_replay',
    event: 'PAYMENT_CONFIRMED',
    timestamp: oldTimestamp,
  };
  const rawPayload = JSON.stringify(oldEvent);
  const sig = sign(rawPayload, SECRET_V1);

  // Should fail with default 300s window
  assert.throws(
    () =>
      verifyWebhook({
        payload: rawPayload,
        signatureHeader: sig,
        secrets: SECRET_V1,
        toleranceSeconds: 300,
      }),
    (err) => {
      assert.ok(err instanceof WebhookVerificationError);
      assert.equal(err.code, 'TIMESTAMP_OUT_OF_RANGE');
      return true;
    }
  );

  // Should pass if tolerance is disabled (0)
  const okDisabled = verifyWebhook({
    payload: rawPayload,
    signatureHeader: sig,
    secrets: SECRET_V1,
    toleranceSeconds: 0,
  });
  assert.equal(okDisabled.eventId, 'evt_replay');
});

test('verifyWebhook: enforces tenantId isolation when expectedTenantId is specified', () => {
  const event = {
    eventId: 'evt_tenant',
    tenantId: 'tenant_mallory',
    amount: '500',
    timestamp: new Date().toISOString(),
  };
  const rawPayload = JSON.stringify(event);
  const sig = sign(rawPayload, SECRET_V1);

  // Matching tenant passes
  const matched = verifyWebhook({
    payload: rawPayload,
    signatureHeader: sig,
    secrets: SECRET_V1,
    expectedTenantId: 'tenant_mallory',
  });
  assert.equal(matched.tenantId, 'tenant_mallory');

  // Mismatched tenant fails
  assert.throws(
    () =>
      verifyWebhook({
        payload: rawPayload,
        signatureHeader: sig,
        secrets: SECRET_V1,
        expectedTenantId: 'tenant_alice',
      }),
    (err) => {
      assert.ok(err instanceof WebhookVerificationError);
      assert.equal(err.code, 'TENANT_MISMATCH');
      return true;
    }
  );
});

test('createWebhookMiddleware: integrates as Express middleware', async () => {
  const middleware = createWebhookMiddleware({
    secrets: [SECRET_V1],
  });

  const event = { eventId: 'evt_mw', event: 'CONFIRMED', timestamp: new Date().toISOString() };
  const rawBody = Buffer.from(JSON.stringify(event));
  const sig = sign(rawBody, SECRET_V1);

  // 1. Success case
  let nextCalled = false;
  const mockReqSuccess = {
    headers: { 'x-cryptopay-signature': `sha256=${sig}` },
    body: rawBody,
  };
  const mockResSuccess = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };
  await middleware(mockReqSuccess, mockResSuccess, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled);
  assert.equal(mockReqSuccess.cryptopayEvent.eventId, 'evt_mw');

  // 2. Missing signature case -> 401
  const mockReqMissing = {
    headers: {},
    body: rawBody,
  };
  let statusMissing = null;
  const mockResMissing = {
    status(code) {
      statusMissing = code;
      return this;
    },
    json() {},
  };
  await middleware(mockReqMissing, mockResMissing, () => {});
  assert.equal(statusMissing, 401);

  // 3. Bad signature -> 401
  const mockReqBad = {
    headers: { 'x-cryptopay-signature': '0'.repeat(64) },
    body: rawBody,
  };
  let statusBad = null;
  const mockResBad = {
    status(code) {
      statusBad = code;
      return this;
    },
    json() {},
  };
  await middleware(mockReqBad, mockResBad, () => {});
  assert.equal(statusBad, 401);
});
