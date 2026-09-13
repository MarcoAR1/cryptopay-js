/**
 * Automated Verification for CryptoPay Generic Merchant Example
 *
 * Verifies Acceptance Criteria of CP-032:
 * 1. Independent: Does not import any Paseo modules or require external reservations.
 * 2. Client Price Tamper Immunity: Ignores client-provided amount; enforces authoritative server catalog price.
 * 3. End-to-End Payment Flow: Generates order and calls mock CryptoPay gateway.
 * 4. Webhook Verification & Exactly-Once Fulfillment:
 *    - Valid webhook marks order PAID and delivers product (fulfillmentCount = 1).
 *    - Replay webhook acknowledges duplicate but NEVER delivers product twice (fulfillmentCount = 1).
 *    - Tampered webhook is rejected with 401.
 * 5. Asset Inspection: Ensures zero API keys or secrets in client assets.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createMerchantApp } = require('./server');

const TEST_API_KEY = 'cp_sec_test_merchant_key_abc123';
const TEST_WEBHOOK_SECRET = 'whsec_test_secret_xyz789';
const TEST_TENANT_ID = 'tenant_merchant_test';

// Helper: Start mock CryptoPay Gateway
async function createMockGateway() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : {};
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: parsedBody });

      if (req.url === '/v1/payments' && req.method === 'POST') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            paymentId: `pay_mock_${Date.now()}`,
            amount: parsedBody.amount,
            amountUnits: '15000000',
            currency: parsedBody.currency,
            orderId: parsedBody.orderId,
            status: 'PENDING',
            checkoutUrl: `http://localhost/checkout/mock`,
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    server,
    baseUrl: `http://localhost:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Helper: HTTP request utility
function makeRequest(baseUrl, options, postData) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(options.path, baseUrl);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text: data, json });
        });
      }
    );
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function signWebhook(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

test('CP-032 Criteria 1: Zero Paseo dependencies in merchant example', () => {
  const codeFiles = ['package.json', 'server.js', 'store.js', 'README.md'];
  for (const file of codeFiles) {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.doesNotMatch(content, /@paseo/i, `File ${file} must not reference Paseo modules`);
    assert.doesNotMatch(content, /paseo-libre/i, `File ${file} must not reference paseo-libre`);
  }
});

test('CP-032 Criteria 5: Zero API keys or secrets in client assets', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /cp_sec_/i, 'Client HTML must never contain merchant private API key');
  assert.doesNotMatch(html, /whsec_/i, 'Client HTML must never contain webhook secret');
});

test('CP-032 Criteria 2, 3, 4: End-to-end checkout, price tamper resistance, and idempotent webhook replay defense', async () => {
  const mockGateway = await createMockGateway();

  const { server, store } = createMerchantApp({
    apiKey: TEST_API_KEY,
    baseUrl: mockGateway.baseUrl,
    webhookSecret: TEST_WEBHOOK_SECRET,
    expectedTenantId: TEST_TENANT_ID,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const merchantPort = server.address().port;
  const merchantUrl = `http://localhost:${merchantPort}`;

  try {
    // 1. Get products
    const prodRes = await makeRequest(merchantUrl, { path: '/api/products', method: 'GET' });
    assert.equal(prodRes.status, 200);
    assert.ok(prodRes.json.products.length >= 3);
    const coffeeProduct = prodRes.json.products.find((p) => p.id === 'prod_coffee_beans');
    assert.equal(coffeeProduct.amount, '15.00');

    // 2. Client initiates checkout attempting to tamper price to 0.01 USDT
    const checkoutRes = await makeRequest(
      merchantUrl,
      {
        path: '/api/checkout',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({
        productId: 'prod_coffee_beans',
        amount: '0.01', // Malicious attempt to override price
        currency: 'ETH', // Malicious attempt to override currency
        customerEmail: 'alice@example.com',
      })
    );

    assert.equal(checkoutRes.status, 201);
    assert.equal(checkoutRes.json.amount, '15.00', 'Server MUST enforce catalog price 15.00 and reject client override');
    assert.equal(checkoutRes.json.currency, 'USDT', 'Server MUST enforce catalog currency USDT');
    const orderId = checkoutRes.json.orderId;
    const paymentId = checkoutRes.json.paymentId;

    // Verify mock gateway received correct parameters
    assert.equal(mockGateway.requests.length, 1);
    assert.equal(mockGateway.requests[0].body.amount, '15.00');
    assert.equal(mockGateway.requests[0].body.orderId, orderId);
    assert.equal(mockGateway.requests[0].headers['x-api-key'], TEST_API_KEY);

    // 3. Verify order is initially PENDING
    const initialOrderRes = await makeRequest(merchantUrl, { path: `/api/orders/${orderId}` });
    assert.equal(initialOrderRes.json.status, 'PENDING');
    assert.equal(initialOrderRes.json.delivered, false);
    assert.equal(initialOrderRes.json.fulfillmentCount, 0);

    // 4. Valid Webhook arrives
    const webhookEvent = {
      eventId: 'evt_merchant_test_001',
      event: 'PAYMENT_CONFIRMED',
      transactionId: 'tx_demo_blockchain_999',
      orderId,
      paymentId,
      tenantId: TEST_TENANT_ID,
      amount: '15.00',
      currency: 'USDT',
      timestamp: new Date().toISOString(),
    };
    const rawWebhookPayload = JSON.stringify(webhookEvent);
    const validSignature = signWebhook(rawWebhookPayload, TEST_WEBHOOK_SECRET);

    const webhookRes1 = await makeRequest(
      merchantUrl,
      {
        path: '/api/webhooks/cryptopay',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CryptoPay-Signature': `sha256=${validSignature}`,
        },
      },
      rawWebhookPayload
    );

    assert.equal(webhookRes1.status, 200);
    assert.equal(webhookRes1.json.status, 'PROCESSED');

    // Check order is now PAID and fulfilled ONCE
    const paidOrderRes1 = await makeRequest(merchantUrl, { path: `/api/orders/${orderId}` });
    assert.equal(paidOrderRes1.json.status, 'PAID');
    assert.equal(paidOrderRes1.json.delivered, true);
    assert.equal(paidOrderRes1.json.fulfillmentCount, 1);

    // 5. REPLAY ATTACK: Exactly same webhook event sent again
    const webhookResReplay = await makeRequest(
      merchantUrl,
      {
        path: '/api/webhooks/cryptopay',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CryptoPay-Signature': `sha256=${validSignature}`,
        },
      },
      rawWebhookPayload
    );

    assert.equal(webhookResReplay.status, 200);
    assert.equal(webhookResReplay.json.status, 'DUPLICATE', 'Replay must be identified as DUPLICATE');

    // CRITICAL ACCEPTANCE CRITERIA: Fulfillment count MUST NOT increase!
    const paidOrderRes2 = await makeRequest(merchantUrl, { path: `/api/orders/${orderId}` });
    assert.equal(paidOrderRes2.json.fulfillmentCount, 1, 'Product must NOT be delivered twice on replay');

    // 6. TAMPERED WEBHOOK: Payload modified without valid signature
    const tamperedPayload = JSON.stringify({
      ...webhookEvent,
      eventId: 'evt_merchant_test_002',
      amount: '9999.00',
    });
    const tamperedRes = await makeRequest(
      merchantUrl,
      {
        path: '/api/webhooks/cryptopay',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CryptoPay-Signature': `sha256=${validSignature}`, // signature for original payload
        },
      },
      tamperedPayload
    );

    assert.equal(tamperedRes.status, 401, 'Tampered webhook must be rejected with 401');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mockGateway.close();
  }
});
