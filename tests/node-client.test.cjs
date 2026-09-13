const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('CryptoPayNodeClient: executes successful createPayment and sends Idempotency-Key and X-Request-Id', async () => {
  let receivedHeaders = null;
  let receivedBody = null;

  const server = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-request-id': 'req_server_01' });
      res.end(
        JSON.stringify({
          paymentId: 'pay_node_123',
          amount: '50',
          amountUnits: '50000000',
          currency: 'USDT',
          chainId: 11155111,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          paymentAddress: '0x2222222222222222222222222222222222222222',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          createdAt: new Date().toISOString(),
        })
      );
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const { CryptoPayNodeClient } = require('../dist/checkout.cjs');
    const client = new CryptoPayNodeClient({
      apiKey: 'cp_sec_test_12345678abcdefghij',
      baseUrl,
    });

    const payment = await client.createPayment({
      amount: '50',
      currency: 'USDT',
      orderId: 'order_node_01',
    });

    assert.equal(payment.paymentId, 'pay_node_123');
    assert.ok(receivedHeaders['x-api-key'], 'X-API-Key must be sent');
    assert.ok(receivedHeaders['idempotency-key'], 'Idempotency-Key must be sent on POST');
    assert.ok(receivedHeaders['x-request-id'], 'X-Request-Id must be sent');
    assert.equal(receivedBody.orderId, 'order_node_01');
  } finally {
    server.close();
  }
});

test('CryptoPayNodeClient: parses 401, 409 and 429 Retry-After into typed errors', async () => {
  let responseStatus = 401;
  let retryAfterHeader = '45';

  const server = http.createServer((req, res) => {
    if (responseStatus === 429) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': retryAfterHeader });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
    } else if (responseStatus === 409) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Order already processed' }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid API key provided' }));
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const {
      CryptoPayNodeClient,
      AuthenticationError,
      ConflictError,
      RateLimitError,
    } = require('../dist/checkout.cjs');

    const client = new CryptoPayNodeClient({
      apiKey: 'cp_sec_test_secret_key_12345',
      baseUrl,
    });

    // Test 401
    responseStatus = 401;
    await assert.rejects(
      () => client.getPayment('pay_any'),
      (err) => {
        assert.ok(err instanceof AuthenticationError);
        assert.equal(err.statusCode, 401);
        return true;
      }
    );

    // Test 409
    responseStatus = 409;
    await assert.rejects(
      () => client.createPayment({ amount: '10', currency: 'USDT' }),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // Test 429
    responseStatus = 429;
    await assert.rejects(
      () => client.getPayment('pay_any'),
      (err) => {
        assert.ok(err instanceof RateLimitError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.retryAfterSeconds, 45);
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('CryptoPayNodeClient: secret redaction in errors prevents leaking API key in logs or serialization', async () => {
  const { CryptoPayNodeError, AuthenticationError } = require('../dist/checkout.cjs');

  const rawSecret = 'cp_sec_12345678abcdefghijklmnop';
  const err = new AuthenticationError(`Request failed with secret: ${rawSecret}`, 'req_test');

  assert.ok(!err.message.includes('12345678abcdefghijklmnop'), 'Message must redact API key');
  assert.ok(err.message.includes('[REDACTED]'), 'Must replace secret suffix with [REDACTED]');

  const serialized = JSON.stringify(err);
  assert.ok(!serialized.includes('12345678abcdefghijklmnop'), 'JSON stringify must never leak secret');
});

test('CryptoPayNodeClient: distinguishes ambiguous timeout on POST requests', async () => {
  const server = http.createServer((req, res) => {
    // Hang connection to trigger client timeout
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const { CryptoPayNodeClient, AmbiguousTimeoutError } = require('../dist/checkout.cjs');
    const client = new CryptoPayNodeClient({
      apiKey: 'cp_sec_test_key_123',
      baseUrl,
      timeoutMs: 100, // Fast timeout for test
    });

    await assert.rejects(
      () => client.createPayment({ amount: '20', currency: 'USDT' }),
      (err) => {
        assert.ok(err instanceof AmbiguousTimeoutError);
        assert.ok(err.idempotencyKey, 'Must retain idempotencyKey in ambiguous timeout');
        return true;
      }
    );
  } finally {
    server.close();
  }
});
