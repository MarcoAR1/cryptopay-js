const test = require('node:test');
const assert = require('node:assert/strict');

test('Session Lifecycle: onPaymentConfirmed only fires on gateway confirmation, never on broadcast', async () => {
  const sdk = require('../dist/checkout.cjs');

  let confirmedEventFired = false;
  let statesReceived = [];

  const session = new sdk.HeadlessPaymentSession({
    baseUrl: 'https://gateway.example.com',
    paymentId: 'pay_lifecycle_001',
    checkoutToken: 'tok_test_abc',
    callbacks: {
      onPaymentConfirmed: () => {
        confirmedEventFired = true;
      },
      onStateChange: (st) => {
        statesReceived.push(st);
      },
    },
  });

  // Local transaction is broadcasted to the blockchain
  session.markTransactionBroadcasted('0xtxhash123456');

  // Invariant: local broadcast transitions state to CONFIRMING, NEVER to CONFIRMED
  assert.equal(session.getState(), 'CONFIRMING');
  assert.equal(confirmedEventFired, false, 'onPaymentConfirmed must NOT fire on local broadcast');

  // Mock server response
  const originalFetch = global.fetch;
  try {
    // 1. Gateway still reports PENDING (mining in progress)
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        paymentId: 'pay_lifecycle_001',
        amount: '100',
        amountUnits: '100000000',
        currency: 'USDT',
        chainId: 11155111,
        paymentAddress: '0x2222222222222222222222222222222222222222',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      }),
    });

    await session.fetchStatus();
    assert.equal(session.getState(), 'CONFIRMING', 'Remains CONFIRMING while pending with local tx');
    assert.equal(confirmedEventFired, false);

    // 2. Gateway reports CONFIRMED after on-chain validation
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        paymentId: 'pay_lifecycle_001',
        amount: '100',
        amountUnits: '100000000',
        currency: 'USDT',
        chainId: 11155111,
        paymentAddress: '0x2222222222222222222222222222222222222222',
        status: 'CONFIRMED',
        txHash: '0xtxhash123456',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      }),
    });

    await session.fetchStatus();
    assert.equal(session.getState(), 'CONFIRMED');
    assert.equal(confirmedEventFired, true, 'onPaymentConfirmed must fire only when gateway confirms');
  } finally {
    global.fetch = originalFetch;
    session.destroy();
  }
});

test('Session Lifecycle: Closing or unmounting UI preserves snapshot and does not cancel in-flight payment', async () => {
  const sdk = require('../dist/checkout.cjs');

  // Mock sessionStorage in Node
  const storageMap = new Map();
  global.window = {
    sessionStorage: {
      getItem: (k) => storageMap.get(k) || null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
    },
  };

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      paymentId: 'pay_unmount_001',
      amount: '100',
      amountUnits: '100000000',
      currency: 'USDT',
      chainId: 11155111,
      paymentAddress: '0x2222222222222222222222222222222222222222',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    }),
  });

  try {
    const session = new sdk.HeadlessPaymentSession({
      baseUrl: 'https://gateway.example.com',
      paymentId: 'pay_unmount_001',
      checkoutToken: 'tok_test_xyz',
      storageKey: 'test_session_unmount',
    });

    await session.fetchStatus();
    assert.equal(session.getState(), 'AWAITING_PAYMENT');

    session.markTransactionBroadcasted('0xabc123broadcasted');
    assert.equal(session.getState(), 'CONFIRMING');

    // Unmount the UI (simulating user navigating away or modal closing)
    session.unmount();

    // Invariant: Snapshot must remain intact in sessionStorage for recovery
    const saved = JSON.parse(global.window.sessionStorage.getItem('test_session_unmount'));
    assert.ok(saved, 'Snapshot must be preserved');
    assert.equal(saved.paymentId, 'pay_unmount_001');
    assert.equal(saved.state, 'CONFIRMING');
    assert.equal(saved.localTxHash, '0xabc123broadcasted');

    // Recover session without creating a new payment
    const recovered = sdk.HeadlessPaymentSession.recover('test_session_unmount', {
      callbacks: {},
    });
    assert.ok(recovered, 'Session must recover from snapshot');
    assert.equal(recovered.getState(), 'CONFIRMING');
    assert.equal(recovered.getLocalTxHash(), '0xabc123broadcasted');
    assert.equal(recovered.getData()?.txHash, '0xabc123broadcasted');

    recovered.destroy();
    session.destroy();
  } finally {
    global.fetch = originalFetch;
    delete global.window;
  }
});

test('Session Lifecycle: Cancel is strictly forbidden once a transaction is broadcasted on-chain', async () => {
  const sdk = require('../dist/checkout.cjs');

  const session = new sdk.HeadlessPaymentSession({
    baseUrl: 'https://gateway.example.com',
    paymentId: 'pay_nobroadcast_cancel',
    checkoutToken: 'tok_test_nobroadcast',
  });

  session.markTransactionBroadcasted('0xonchain_hash');

  await assert.rejects(
    async () => {
      await session.cancel('User closed browser');
    },
    (err) => {
      assert.ok(err instanceof sdk.CryptoPayCoreError);
      assert.equal(err.code, 'CANNOT_CANCEL_BROADCASTED');
      return true;
    }
  );

  assert.equal(session.getState(), 'CONFIRMING');
  session.destroy();
});

test('Session Lifecycle: Visibility tracking adapts polling frequency between foreground and background', async () => {
  const sdk = require('../dist/checkout.cjs');

  let visibilityListener = null;
  global.document = {
    visibilityState: 'visible',
    addEventListener: (event, handler) => {
      if (event === 'visibilitychange') visibilityListener = handler;
    },
    removeEventListener: (event, handler) => {
      if (event === 'visibilitychange' && visibilityListener === handler) visibilityListener = null;
    },
  };

  const originalFetch = global.fetch;
  let fetchCallCount = 0;
  global.fetch = async () => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({
        paymentId: 'pay_vis_001',
        amount: '100',
        amountUnits: '100000000',
        currency: 'USDT',
        chainId: 11155111,
        paymentAddress: '0x2222222222222222222222222222222222222222',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      }),
    };
  };

  try {
    const session = new sdk.HeadlessPaymentSession({
      baseUrl: 'https://gateway.example.com',
      paymentId: 'pay_vis_001',
      checkoutToken: 'tok_test_vis',
      pollIntervalMs: 100,
      maxBackoffMs: 500,
      enableVisibilityTracking: true,
    });

    assert.ok(visibilityListener, 'Visibility listener must be registered');

    // Simulate switching to background
    global.document.visibilityState = 'hidden';
    visibilityListener();

    // Simulate switching back to foreground -> triggers immediate fetch
    const callsBefore = fetchCallCount;
    global.document.visibilityState = 'visible';
    visibilityListener();

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(fetchCallCount > callsBefore, 'Returning to visible must trigger immediate fetch');

    session.unmount();
    assert.equal(visibilityListener, null, 'Unmount must detach visibility listener');
    session.destroy();
  } finally {
    global.fetch = originalFetch;
    delete global.document;
  }
});

test('Session Lifecycle: Expiration and Review statuses emit appropriate callbacks and stop polling', async () => {
  const sdk = require('../dist/checkout.cjs');

  let expiredFired = false;
  let reviewFired = false;

  const originalFetch = global.fetch;
  try {
    // 1. Expired payment
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        paymentId: 'pay_exp_001',
        amount: '100',
        amountUnits: '100000000',
        currency: 'USDT',
        chainId: 11155111,
        paymentAddress: '0x2222222222222222222222222222222222222222',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      }),
    });

    const expiredSession = new sdk.HeadlessPaymentSession({
      baseUrl: 'https://gateway.example.com',
      paymentId: 'pay_exp_001',
      checkoutToken: 'tok_test_exp',
      callbacks: {
        onExpired: () => {
          expiredFired = true;
        },
      },
    });

    await expiredSession.fetchStatus();
    assert.equal(expiredSession.getState(), 'EXPIRED');
    assert.equal(expiredFired, true);
    expiredSession.destroy();

    // 2. Needs review payment (underpaid, ambiguous deposit)
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        paymentId: 'pay_rev_001',
        amount: '100',
        amountUnits: '100000000',
        currency: 'USDT',
        chainId: 11155111,
        paymentAddress: '0x2222222222222222222222222222222222222222',
        status: 'REVIEW',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      }),
    });

    const reviewSession = new sdk.HeadlessPaymentSession({
      baseUrl: 'https://gateway.example.com',
      paymentId: 'pay_rev_001',
      checkoutToken: 'tok_test_rev',
      callbacks: {
        onNeedsReview: () => {
          reviewFired = true;
        },
      },
    });

    await reviewSession.fetchStatus();
    assert.equal(reviewSession.getState(), 'REVIEW');
    assert.equal(reviewFired, true);
    reviewSession.destroy();
  } finally {
    global.fetch = originalFetch;
  }
});
