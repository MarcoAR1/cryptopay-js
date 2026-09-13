const test = require('node:test');
const assert = require('node:assert/strict');

test('SSR Safety: Headless core can be imported in a pure Node environment without window or DOM', async () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');

  // Load compiled CJS bundle
  const sdk = require('../dist/checkout.cjs');
  assert.ok(sdk.HeadlessPaymentSession, 'HeadlessPaymentSession must be exported');

  // Instantiating without window must succeed without attempting DOM access or network calls
  const session = new sdk.HeadlessPaymentSession({
    baseUrl: 'https://gateway.example.com',
    paymentId: 'pay_ssr_001',
    checkoutToken: 'tok_test_123',
  });

  assert.equal(session.getState(), 'INITIALIZING');
  assert.equal(session.getData(), null);
  session.destroy();
});

test('Observable State Machine: subscribe, emit transitions, and unsubscribe', async () => {
  const sdk = require('../dist/checkout.cjs');

  const session = new sdk.HeadlessPaymentSession({
    baseUrl: 'https://gateway.example.com',
    paymentId: 'pay_obs_001',
    checkoutToken: 'tok_test_123',
    pollIntervalMs: 50,
  });

  const states = [];
  const unsubscribe = session.subscribe((state) => {
    states.push(state);
  });

  assert.deepEqual(states, ['INITIALIZING']);

  // Mock global fetch for session
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (url) => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          paymentId: 'pay_obs_001',
          amount: '100',
          amountUnits: '100000000',
          currency: 'USDT',
          chainId: 11155111,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          paymentAddress: '0x2222222222222222222222222222222222222222',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        }),
      };
    } else {
      return {
        ok: true,
        json: async () => ({
          paymentId: 'pay_obs_001',
          amount: '100',
          amountUnits: '100000000',
          currency: 'USDT',
          chainId: 11155111,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          paymentAddress: '0x2222222222222222222222222222222222222222',
          status: 'CONFIRMED',
          txHash: '0xconfirmed_tx',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        }),
      };
    }
  };

  try {
    await session.fetchStatus();
    assert.equal(session.getState(), 'AWAITING_PAYMENT');
    assert.deepEqual(states, ['INITIALIZING', 'AWAITING_PAYMENT']);

    await session.fetchStatus();
    assert.equal(session.getState(), 'CONFIRMED');
    assert.deepEqual(states, ['INITIALIZING', 'AWAITING_PAYMENT', 'CONFIRMED']);

    // Unsubscribe and verify no more state notifications
    unsubscribe();
    session.destroy();
    assert.deepEqual(states, ['INITIALIZING', 'AWAITING_PAYMENT', 'CONFIRMED']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Security & Validation: Rejects spoofed paymentId in gateway response and denies payment creation', async () => {
  const sdk = require('../dist/checkout.cjs');

  const session = new sdk.HeadlessPaymentSession({
    baseUrl: 'https://gateway.example.com',
    paymentId: 'pay_legit_001',
    checkoutToken: 'tok_test_123',
  });

  // Verify public session has NO ability to create arbitrary payments or accept a merchant API key
  assert.equal(typeof session.createPayment, 'undefined');
  assert.equal(typeof session.setAmount, 'undefined');

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      paymentId: 'pay_spoofed_999', // Spoofed paymentId
      amount: '100',
      amountUnits: '100000000',
      currency: 'USDT',
      chainId: 11155111,
      paymentAddress: '0x123',
      status: 'PENDING',
      expiresAt: new Date().toISOString(),
    }),
  });

  try {
    await assert.rejects(
      async () => session.fetchStatus(),
      (err) => {
        assert.ok(err instanceof sdk.CryptoPayCoreError);
        assert.equal(err.code, 'INVALID_RESPONSE');
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
    session.destroy();
  }
});
