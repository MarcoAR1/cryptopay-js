# CryptoPay Next.js Integration Guide

This directory documents how to integrate CryptoPay within modern Next.js applications (App Router and Pages Router) following zero-trust architectural guidelines.

---

## Key Concepts

### 1. SSR Hydration Safety (`next/dynamic`)
The CryptoPay widget interacts with browser APIs (EVM `window.ethereum`, canvas QR rendering, `localStorage`). In Next.js App Router, load `<CryptoPayWidget />` dynamically with SSR disabled:

```tsx
'use client';

import dynamic from 'next/dynamic';

const CryptoPayWidget = dynamic(
  () => import('cryptopay-js/react').then((mod) => mod.CryptoPayWidget),
  { ssr: false }
);
```

---

### 2. Authoritative Server Pricing (`app/api/checkout/route.ts`)
Never let the browser calculate or submit payment amounts.
- **Client**: Submits `{ productId: "plan_pro" }`
- **Next.js Server**: Looks up official price in database / catalog and requests session from CryptoPay Gateway using `CRYPTOPAY_API_KEY`.
- **Response**: Returns ephemeral `paymentId` and `checkoutToken` to the client.

---

### 3. Webhook Handling with Raw Body (`app/api/webhooks/route.ts`)
HMAC signatures must be verified against the exact, unparsed request bytes:

```typescript
import { verifyWebhook } from 'cryptopay-js';

export async function POST(req: Request) {
  const signature = req.headers.get('x-cryptopay-signature');
  const rawBody = await req.text(); // Critical: unparsed text

  const result = verifyWebhook({
    rawBody,
    signatureHeader: signature!,
    secret: process.env.CRYPTOPAY_WEBHOOK_SECRET!,
    expectedTenantId: process.env.EXPECTED_TENANT_ID!
  });

  if (!result.isValid) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Idempotent order fulfillment
  return Response.json({ received: true });
}
```
