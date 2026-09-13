# CryptoPay Generic Merchant Backend Integration (Example)

A reference implementation demonstrating how any standard Node.js merchant backend can securely integrate CryptoPay without depending on any PaseoLibre code or external framework constraints.

---

## Key Architectural Principles

1. **Authoritative Server Pricing**:
   - The browser client only submits a `productId` and optional buyer details.
   - The merchant server looks up the product price in its internal catalog and initiates the CryptoPay payment session via `CryptoPayNodeClient`.
   - Any client-submitted amount or currency values are strictly ignored, eliminating client-side price tampering vulnerabilities.

2. **Secure Webhook Verification**:
   - Uses `verifyWebhook` from `cryptopay-js` to validate the `X-CryptoPay-Signature` HMAC over the raw request bytes.
   - Enforces a replay tolerance window (default 300 seconds).
   - Validates multi-tenant isolation (`expectedTenantId`).

3. **Idempotent Webhook Inbox (Replay Protection)**:
   - Webhook retries or network replays are deduplicated via `inbox.has(eventId)`.
   - A duplicated event returns HTTP `200 { received: true, status: 'DUPLICATE' }` without delivering the product a second time (`fulfillmentCount` remains 1).

4. **Zero Client Secret Exposure**:
   - The merchant API key (`CRYPTOPAY_API_KEY`) and webhook secret (`CRYPTOPAY_WEBHOOK_SECRET`) reside exclusively on the server.
   - The client browser never receives or handles merchant credentials.

---

## Directory Structure

```
examples/merchant-backend/
├── .env.example          # Environment template
├── package.json          # Standard package manifest
├── store.js              # In-memory product catalog, orders & idempotent inbox
├── server.js             # HTTP server with checkout and webhook endpoints
├── test.js               # Automated integration test suite
├── public/
│   └── index.html        # Interactive storefront demo UI
└── README.md             # This documentation
```

---

## Quickstart

### 1. Environment Setup

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your gateway credentials:
```env
PORT=4000
CRYPTOPAY_API_KEY=cp_sec_test_demo_merchant_key_123456789
CRYPTOPAY_BASE_URL=http://localhost:3000
CRYPTOPAY_WEBHOOK_SECRET=whsec_test_demo_secret_987654321
EXPECTED_TENANT_ID=tenant_demo_store
```

### 2. Run Server

```bash
node server.js
```

Visit `http://localhost:4000` to interact with the demo storefront.

### 3. Run Automated Integration Tests

```bash
node test.js
```

---

## API Endpoints

### `GET /api/products`
Returns the server-side product catalog with authoritative prices.

### `POST /api/checkout`
Initiates a payment session.
- **Request Body**: `{ "productId": "prod_coffee_beans", "customerEmail": "user@example.com" }`
- **Response**: `{ "success": true, "orderId": "...", "paymentId": "...", "amount": "15.00", "currency": "USDT", "checkoutUrl": "..." }`

### `GET /api/orders/:orderId`
Polls order status (`PENDING`, `PAID`, `EXPIRED`) and fulfillment status.

### `POST /api/webhooks/cryptopay`
Inbound webhook handler verifying signature against raw request body and fulfilling the order via the idempotent inbox.
