const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Direct CommonJS import in pure Node.js (ZERO DOM / zero browser mock globals)
assert.equal(typeof window, 'undefined', 'window must be undefined in pure Node.js test environment');
assert.equal(typeof document, 'undefined', 'document must be undefined in pure Node.js test environment');

const {
  createCheckout,
  CryptoPayCheckout,
  CryptoPayNodeClient,
  verifyWebhook,
  createWebhookMiddleware,
  IncompatibleVersionError,
  HeadlessPaymentSession,
  WalletPaymentManager,
} = require('../dist/checkout.cjs');

test('CP-059 Criterion 1: Node.js does not import or require DOM; headless does not require widget/React; widget forbids API keys', () => {
  // 1. Node.js exports function cleanly without DOM
  assert.equal(typeof verifyWebhook, 'function');
  assert.equal(typeof createWebhookMiddleware, 'function');
  assert.equal(typeof CryptoPayNodeClient, 'function');
  assert.equal(typeof createCheckout, 'function');

  // 2. Mounting without DOM throws explicit descriptive error rather than undefined crash
  const checkout = createCheckout({
    baseUrl: 'http://localhost:3000',
    paymentId: 'pay_test_no_dom',
    checkoutToken: 'tok_test_no_dom'
  });
  assert.throws(
    () => checkout.mount('#nonexistent'),
    /DOM document is not available/,
    'Mounting in pure Node without DOM must throw clear environment error'
  );

  // 3. Widget constructor forbids passing merchant API keys or secrets
  assert.throws(
    () => new CryptoPayCheckout({
      baseUrl: 'http://localhost:3000',
      paymentId: 'pay_test',
      checkoutToken: 'tok_test',
      apiKey: 'cp_sec_leak_attempt'
    }),
    IncompatibleVersionError,
    'Passing apiKey to widget must throw IncompatibleVersionError'
  );

  assert.throws(
    () => new CryptoPayCheckout({
      baseUrl: 'http://localhost:3000',
      paymentId: 'pay_test',
      checkoutToken: 'tok_test',
      secretKey: 'whsec_leak_attempt'
    }),
    IncompatibleVersionError,
    'Passing secretKey to widget must throw IncompatibleVersionError'
  );

  // 4. Widget constructor forbids client-side amount tampering without token
  assert.throws(
    () => new CryptoPayCheckout({
      baseUrl: 'http://localhost:3000',
      paymentId: 'pay_test',
      amount: 100
    }),
    IncompatibleVersionError,
    'Passing client-side amount must throw IncompatibleVersionError'
  );
});

test('CP-059 Criterion 2: Incompatible versions and deprecated APIs fail explicitly before broadcasting or transferring funds', async () => {
  // 1. Legacy v1 static methods throw IncompatibleVersionError
  assert.throws(
    () => CryptoPayCheckout.init({ apiKey: 'old_key', amount: 10 }),
    (err) => {
      return err instanceof IncompatibleVersionError && err.code === 'INCOMPATIBLE_VERSION';
    },
    'CryptoPayCheckout.init() must throw IncompatibleVersionError'
  );

  assert.throws(
    () => CryptoPayCheckout.open({ apiKey: 'old_key', amount: 10 }),
    (err) => {
      return err instanceof IncompatibleVersionError && err.code === 'INCOMPATIBLE_VERSION';
    },
    'CryptoPayCheckout.open() must throw IncompatibleVersionError'
  );

  // 2. Headless session rejects incompatible legacy gateway protocol version
  const session = new HeadlessPaymentSession({
    baseUrl: 'http://localhost:3000',
    paymentId: 'pay_legacy_v1',
    checkoutToken: 'tok_legacy_v1',
    autoStart: false
  });

  // Test validateResponse rejects legacy version 1.0
  assert.throws(
    () => {
      session['validateResponse']({
        paymentId: 'pay_legacy_v1',
        amount: '10.00',
        amountUnits: '10000000',
        currency: 'USDT',
        paymentAddress: '0x1234567890123456789012345678901234567890',
        chainId: 11155111,
        status: 'PENDING',
        version: '1.0' // Incompatible legacy protocol
      });
    },
    (err) => {
      return err instanceof IncompatibleVersionError && err.receivedVersion === '1.0';
    },
    'validateResponse must reject protocol version 1.0 before processing funds'
  );

  // 3. WalletPaymentManager rejects legacy protocolVersion before preparing or executing payment
  const manager = new WalletPaymentManager();
  assert.throws(
    () => {
      manager.preparePayment({
        paymentId: 'pay_legacy_wallet',
        tokenAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
        recipientAddress: '0x1234567890123456789012345678901234567890',
        amountUnits: '10000000',
        chainId: 11155111,
        protocolVersion: 1 // Incompatible protocol
      });
    },
    (err) => {
      return err instanceof IncompatibleVersionError && err.code === 'INCOMPATIBLE_VERSION';
    },
    'WalletPaymentManager must reject legacy protocolVersion 1 before preparing payment'
  );
});
