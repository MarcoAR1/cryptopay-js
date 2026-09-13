/**
 * CryptoPay Generic Merchant Backend Example
 *
 * Demonstrates:
 * 1. Server-side authoritative pricing (browser cannot modify amounts or currencies)
 * 2. Creating CryptoPay payment sessions using CryptoPayNodeClient
 * 3. Secure webhook processing with signature verification and replay prevention
 * 4. Zero exposure of merchant API keys or secrets to frontend
 */

const http = require('node:http');
const url = require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const { CryptoPayNodeClient, verifyWebhook, WebhookVerificationError } = require('../../dist/checkout.cjs');
const { MerchantStore } = require('./store');

function createMerchantApp(config = {}) {
  const apiKey = config.apiKey || process.env.CRYPTOPAY_API_KEY || 'cp_sec_test_demo_merchant_key_123456789';
  const baseUrl = config.baseUrl || process.env.CRYPTOPAY_BASE_URL || 'http://localhost:3000';
  const webhookSecret = config.webhookSecret || process.env.CRYPTOPAY_WEBHOOK_SECRET || 'whsec_test_demo_secret_987654321';
  const expectedTenantId = config.expectedTenantId || process.env.EXPECTED_TENANT_ID;

  const store = new MerchantStore();
  const client = new CryptoPayNodeClient({
    apiKey,
    baseUrl,
  });

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Helper: JSON response
    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };

    // Helper: Collect raw request buffer
    const collectRawBody = () => {
      return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    };

    try {
      // 1. GET /api/products — list catalog with authoritative prices
      if (pathname === '/api/products' && method === 'GET') {
        const products = Array.from(store.catalog.values());
        return sendJson(200, { products });
      }

      // 2. POST /api/checkout — start payment session for a product
      if (pathname === '/api/checkout' && method === 'POST') {
        const raw = await collectRawBody();
        let body = {};
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return sendJson(400, { error: 'Invalid JSON body' });
        }

        const { productId, customerEmail } = body;
        if (!productId) {
          return sendJson(400, { error: 'productId is required' });
        }

        // Price is strictly read from internal store, NEVER accepted from client
        let order;
        try {
          order = store.createOrder(productId, customerEmail);
        } catch (err) {
          return sendJson(404, { error: err.message });
        }

        // Call CryptoPay API with server-side SDK
        try {
          const payment = await client.createPayment({
            amount: order.amount,
            currency: order.currency,
            orderId: order.orderId,
            metadata: {
              productId: order.productId,
              productName: order.productName,
              customerEmail: order.customerEmail,
            },
          });

          store.attachPaymentId(order.orderId, payment.paymentId);

          return sendJson(201, {
            success: true,
            orderId: order.orderId,
            paymentId: payment.paymentId,
            amount: order.amount,
            currency: order.currency,
            checkoutUrl: payment.checkoutUrl || `${baseUrl}/checkout/${payment.paymentId}`,
          });
        } catch (apiErr) {
          return sendJson(502, {
            error: 'Failed to initiate CryptoPay payment session',
            details: apiErr.message,
          });
        }
      }

      // 3. GET /api/orders/:orderId — get order status
      if (pathname.startsWith('/api/orders/') && method === 'GET') {
        const orderId = pathname.slice('/api/orders/'.length);
        const order = store.getOrder(orderId);
        if (!order) {
          return sendJson(404, { error: 'Order not found' });
        }
        return sendJson(200, {
          orderId: order.orderId,
          productName: order.productName,
          amount: order.amount,
          currency: order.currency,
          status: order.status,
          delivered: order.delivered,
          fulfillmentCount: order.fulfillmentCount,
        });
      }

      // 4. POST /api/webhooks/cryptopay — inbound webhook receptor
      if (pathname === '/api/webhooks/cryptopay' && method === 'POST') {
        const rawBody = await collectRawBody();
        const signatureHeader = req.headers['x-cryptopay-signature'];

        if (!signatureHeader) {
          return sendJson(401, { error: 'Missing X-CryptoPay-Signature header' });
        }

        let event;
        try {
          // Strict verification on original raw bytes + HMAC + replay tolerance
          event = verifyWebhook({
            payload: rawBody,
            signatureHeader,
            secrets: webhookSecret,
            toleranceSeconds: 300,
            expectedTenantId,
          });
        } catch (verifErr) {
          const status = verifErr instanceof WebhookVerificationError && verifErr.code === 'TIMESTAMP_OUT_OF_RANGE' ? 400 : 401;
          return sendJson(status, { error: verifErr.message, code: verifErr.code });
        }

        // Idempotent fulfillment via inbox
        const result = store.processWebhookEvent(event);

        // Always acknowledge valid webhook with 200
        return sendJson(200, {
          received: true,
          status: result.status,
          orderId: result.order ? result.order.orderId : undefined,
        });
      }

      // 5. GET / — serve front-end HTML demo
      if (pathname === '/' && method === 'GET') {
        const htmlPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(htmlPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(fs.readFileSync(htmlPath));
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('CryptoPay Merchant Demo API running');
      }

      // 404 Fallback
      return sendJson(404, { error: 'Not found' });
    } catch (err) {
      console.error('Unhandled request error:', err);
      return sendJson(500, { error: 'Internal server error' });
    }
  });

  return { server, store, client };
}

// Start standalone if executed directly
if (require.main === module) {
  const port = process.env.PORT || 4000;
  const { server } = createMerchantApp();
  server.listen(port, () => {
    console.log(`CryptoPay Generic Merchant Example running on http://localhost:${port}`);
    console.log(`Endpoints:`);
    console.log(`  GET  /api/products`);
    console.log(`  POST /api/checkout`);
    console.log(`  GET  /api/orders/:orderId`);
    console.log(`  POST /api/webhooks/cryptopay`);
  });
}

module.exports = { createMerchantApp };
