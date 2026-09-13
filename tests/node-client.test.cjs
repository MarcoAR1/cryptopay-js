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

test('CryptoPayNodeClient: financial operations (refunds, quotes, balances, withdrawals, config) enforce idempotency and live contract', async () => {
  let lastRequest = null;
  const requests = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : null;
      lastRequest = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsedBody,
      };
      requests.push(lastRequest);

      // Routing
      if (req.url === '/v1/merchant/payments/pay_abc/refund' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            id: 'ref_123',
            tenantId: 'tenant_alpha',
            paymentId: 'pay_abc',
            idempotencyKey: req.headers['idempotency-key'],
            amountUnits: parsedBody.amountUnits,
            currency: 'USDT',
            recipientAddress: '0x1111111111111111111111111111111111111111',
            feeUnits: '0',
            status: 'RESERVED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );
      }

      if (req.url === '/v1/merchant/payments/pay_abc/refund-quote' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            canRefund: true,
            currency: 'USDT',
            grossUnits: '50000000',
            totalRefundedUnits: '0',
            remainingRefundableUnits: '50000000',
            availableTreasuryUnits: '100000000',
            immediateSolvency: true,
            requiresDirectRecipient: false,
          })
        );
      }

      if (req.url === '/v1/merchant/refunds/ref_123' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            id: 'ref_123',
            tenantId: 'tenant_alpha',
            paymentId: 'pay_abc',
            idempotencyKey: 'idemp_refund_01',
            amountUnits: '25000000',
            currency: 'USDT',
            recipientAddress: '0x1111111111111111111111111111111111111111',
            feeUnits: '0',
            status: 'EXECUTED',
            txHash: '0xdeadbeef1234567890deadbeef1234567890deadbeef1234567890deadbeef1234',
            executedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );
      }

      if (req.url === '/v1/merchant/payments/pay_abc/refunds' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify([
            {
              id: 'ref_123',
              tenantId: 'tenant_alpha',
              paymentId: 'pay_abc',
              idempotencyKey: 'idemp_refund_01',
              amountUnits: '25000000',
              currency: 'USDT',
              recipientAddress: '0x1111111111111111111111111111111111111111',
              feeUnits: '0',
              status: 'RESERVED',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ])
        );
      }

      if (req.url === '/v1/merchant/balances' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify([
            {
              id: 'treasury_usdt',
              tenantId: 'tenant_alpha',
              chainId: 11155111,
              asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
              currency: 'USDT',
              settledBalanceUnits: '100000000',
              reservedBalanceUnits: '25000000',
              availableBalanceUnits: '75000000',
              updatedAt: new Date().toISOString(),
            },
          ])
        );
      }

      if (req.url === '/v1/merchant/withdrawals' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            id: 'with_789',
            tenantId: 'tenant_alpha',
            chainId: parsedBody.chainId,
            asset: parsedBody.asset,
            currency: parsedBody.currency,
            amountUnits: parsedBody.amountUnits,
            estimatedFeeUnits: '500000',
            destinationAddress: parsedBody.destinationAddress,
            idempotencyKey: req.headers['idempotency-key'],
            status: 'RESERVED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );
      }

      if (req.url === '/v1/merchant/withdrawals/with_789' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            id: 'with_789',
            tenantId: 'tenant_alpha',
            chainId: 11155111,
            asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            currency: 'USDT',
            amountUnits: '10000000',
            estimatedFeeUnits: '500000',
            destinationAddress: '0x9999999999999999999999999999999999999999',
            idempotencyKey: 'with_idemp_1',
            status: 'CONFIRMED',
            txHash: '0xwithdrawal_hash_1111',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );
      }

      if (req.url === '/v1/merchant/withdrawals' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify([
            {
              id: 'with_789',
              tenantId: 'tenant_alpha',
              chainId: 11155111,
              asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
              currency: 'USDT',
              amountUnits: '10000000',
              estimatedFeeUnits: '500000',
              destinationAddress: '0x9999999999999999999999999999999999999999',
              idempotencyKey: 'with_idemp_1',
              status: 'CONFIRMED',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ])
        );
      }

      if (req.url.startsWith('/v1/merchant/export/reconciliation') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            csv: 'Order ID,Payment ID,Gross Units\r\n"ORD-1","pay_abc","50000000"',
            filename: 'reconciliation-export.csv',
            totalRows: 1,
            generatedAt: new Date().toISOString(),
          })
        );
      }

      if (req.url === '/v1/merchant/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            tenantId: 'tenant_alpha',
            name: 'Alpha Store',
            email: 'alpha@store.io',
            webhookUrl: 'https://alpha.store.io/webhooks',
            commissionRate: 0.01,
            enabledPaymentMethods: ['CONTRACT', 'DIRECT'],
          })
        );
      }

      if (req.url === '/v1/merchant/config' && req.method === 'PUT') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            tenantId: 'tenant_alpha',
            name: 'Alpha Store',
            email: 'alpha@store.io',
            webhookUrl: parsedBody.webhookUrl,
            linkedWalletAddress: parsedBody.linkedWalletAddress,
            // Invariant: commissionRate MUST remain platform value 0.01
            commissionRate: 0.01,
            enabledPaymentMethods: ['CONTRACT'],
          })
        );
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route not found' }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const { CryptoPayNodeClient } = require('../dist/checkout.cjs');
    const client = new CryptoPayNodeClient({
      apiKey: 'cp_sec_merchant_key_alpha',
      baseUrl,
    });

    // 1. requestRefund requires idempotencyKey
    await assert.rejects(
      () => client.requestRefund('pay_abc', { amountUnits: '25000000', idempotencyKey: '' }),
      /idempotencyKey is required/
    );

    // 2. Successful refund request with idempotencyKey
    const refund = await client.requestRefund('pay_abc', {
      amountUnits: '25000000',
      idempotencyKey: 'idemp_refund_01',
      reason: 'Returned item',
    });
    assert.equal(refund.id, 'ref_123');
    assert.equal(refund.status, 'RESERVED');
    assert.equal(lastRequest.headers['idempotency-key'], 'idemp_refund_01');
    assert.equal(lastRequest.body.amountUnits, '25000000');

    // 3. getRefundQuote
    const quote = await client.getRefundQuote('pay_abc');
    assert.equal(quote.canRefund, true);
    assert.equal(quote.remainingRefundableUnits, '50000000');
    assert.equal(quote.immediateSolvency, true);

    // 4. getRefund (returns confirmed/executed status)
    const singleRefund = await client.getRefund('ref_123');
    assert.equal(singleRefund.id, 'ref_123');
    assert.equal(singleRefund.status, 'EXECUTED');
    assert.ok(singleRefund.txHash, 'Confirmed refund includes txHash');

    // 5. listRefunds
    const refundsList = await client.listRefunds('pay_abc');
    assert.equal(refundsList.length, 1);
    assert.equal(refundsList[0].id, 'ref_123');

    // 6. getBalances
    const balances = await client.getBalances();
    assert.equal(balances.length, 1);
    assert.equal(balances[0].availableBalanceUnits, '75000000');
    assert.equal(balances[0].reservedBalanceUnits, '25000000');

    // 7. requestWithdrawal
    const withdrawal = await client.requestWithdrawal({
      chainId: 11155111,
      asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      currency: 'USDT',
      amountUnits: '10000000',
      destinationAddress: '0x9999999999999999999999999999999999999999',
      idempotencyKey: 'with_idemp_1',
    });
    assert.equal(withdrawal.id, 'with_789');
    assert.equal(withdrawal.status, 'RESERVED');
    assert.equal(lastRequest.headers['idempotency-key'], 'with_idemp_1');

    // 8. getWithdrawal & listWithdrawals
    const singleWith = await client.getWithdrawal('with_789');
    assert.equal(singleWith.id, 'with_789');
    assert.equal(singleWith.status, 'CONFIRMED');
    assert.ok(singleWith.txHash);

    const withList = await client.listWithdrawals();
    assert.equal(withList.length, 1);

    // 9. exportReconciliation
    const exportResult = await client.exportReconciliation({ from: '2026-01-01', to: '2026-12-31' });
    assert.ok(exportResult.csv.includes('ORD-1'));
    assert.equal(exportResult.totalRows, 1);
    assert.ok(lastRequest.url.includes('from=2026-01-01'));

    // 10. getMerchantConfig & updateMerchantConfig governance
    const config = await client.getMerchantConfig();
    assert.equal(config.commissionRate, 0.01);

    const updatedConfig = await client.updateMerchantConfig({
      webhookUrl: 'https://new-alpha.store.io/webhooks',
      linkedWalletAddress: '0x5555555555555555555555555555555555555555',
    });
    assert.equal(updatedConfig.webhookUrl, 'https://new-alpha.store.io/webhooks');
    assert.equal(updatedConfig.commissionRate, 0.01);
  } finally {
    server.close();
  }
});

test('CryptoPayNodeClient: propagates 403 cross-tenant access rejection as AuthenticationError', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Tenant is not authorized to access this resource' }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const { CryptoPayNodeClient, AuthenticationError, ForbiddenError } = require('../dist/checkout.cjs');
    const client = new CryptoPayNodeClient({
      apiKey: 'cp_sec_tenant_b_key',
      baseUrl,
    });

    await assert.rejects(
      () => client.getRefund('ref_tenant_a_id'),
      (err) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        assert.ok(err.message.includes('not authorized'));
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('CryptoPayNodeClient: verifies duplicate refund idempotency and operation lifecycle discrimination', async () => {
  let callCount = 0;
  const existingRefund = {
    id: 'ref_idempotent_123',
    tenantId: 'tenant_test',
    paymentId: 'pay_xyz',
    idempotencyKey: 'idemp_dup_key',
    amountUnits: '10000000',
    currency: 'USDT',
    recipientAddress: '0x1111111111111111111111111111111111111111',
    feeUnits: '0',
    status: 'RESERVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      callCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(existingRefund));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const { CryptoPayNodeClient } = require('../dist/checkout.cjs');
    const client = new CryptoPayNodeClient({
      apiKey: 'cp_sec_test_key',
      baseUrl,
    });

    // First refund call
    const refund1 = await client.requestRefund('pay_xyz', {
      amountUnits: '10000000',
      idempotencyKey: 'idemp_dup_key',
    });
    assert.equal(refund1.id, 'ref_idempotent_123');
    assert.equal(refund1.status, 'RESERVED');

    // Replay call with exact same idempotency key (duplicate click)
    const refund2 = await client.requestRefund('pay_xyz', {
      amountUnits: '10000000',
      idempotencyKey: 'idemp_dup_key',
    });
    assert.equal(refund2.id, refund1.id);
    assert.equal(callCount, 2);

    // Lifecycle discrimination verification:
    // A 'RESERVED' operation is in-flight (REQUESTED phase), NOT yet confirmed on-chain
    const isRequestedPhase = ['PENDING_AUTHORIZATION', 'RESERVED', 'AWAITING_FUNDS'].includes(refund1.status);
    const isConfirmedPhase = refund1.status === 'EXECUTED';
    assert.equal(isRequestedPhase, true, 'RESERVED status must discriminate as requested/in-flight');
    assert.equal(isConfirmedPhase, false, 'RESERVED status is not yet confirmed on-chain');
    assert.equal(refund1.txHash, undefined, 'Requested operation does not yet have a broadcast txHash');
  } finally {
    server.close();
  }
});
