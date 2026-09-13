import { NextResponse } from 'next/server';
import { verifyWebhook } from 'cryptopay-js';

// In-memory idempotency deduplication set
const processedEvents = new Set<string>();

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-cryptopay-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing X-CryptoPay-Signature header' }, { status: 401 });
    }

    // Critical: extract raw request text to compute HMAC accurately
    const rawBody = await req.text();
    const webhookSecret = process.env.CRYPTOPAY_WEBHOOK_SECRET || 'whsec_demo_test_secret_123';

    const result = verifyWebhook({
      rawBody,
      signatureHeader: signature,
      secret: webhookSecret,
      expectedTenantId: process.env.EXPECTED_TENANT_ID || 'tenant_demo_store'
    });

    if (!result.isValid) {
      return NextResponse.json({ error: `Webhook verification failed: ${result.error}` }, { status: 403 });
    }

    const event = result.event;
    if (!event) {
      return NextResponse.json({ error: 'Missing event payload' }, { status: 400 });
    }

    // Idempotent fulfillment check
    if (processedEvents.has(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    processedEvents.add(event.id);

    // Business fulfillment logic
    if (event.type === 'PAYMENT_CONFIRMED') {
      console.log(`[Next.js Webhook] Fulfilling order for payment ${event.data.paymentId}`);
      // fulfillOrder(event.data.paymentId);
    }

    return NextResponse.json({ received: true, status: 'PROCESSED' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
