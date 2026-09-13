import { NextResponse } from 'next/server';

// Server-side authoritative product catalog
const PRODUCT_CATALOG: Record<string, { name: string; amount: string; currency: string }> = {
  plan_pro_monthly: { name: 'Pro Monthly Pass', amount: '15.00', currency: 'USDT' },
  plan_enterprise_annual: { name: 'Enterprise Annual Pass', amount: '150.00', currency: 'USDT' }
};

export async function POST(req: Request) {
  try {
    const { productId, customerEmail } = await req.json();

    const product = PRODUCT_CATALOG[productId];
    if (!product) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    const gatewayUrl = process.env.CRYPTOPAY_BASE_URL || 'http://localhost:3000';
    const apiKey = process.env.CRYPTOPAY_API_KEY || 'cp_sec_demo_test_key_12345';

    // In a real integration, the merchant backend calls the CryptoPay Gateway:
    // const res = await fetch(`${gatewayUrl}/api/v1/payments`, { ... });
    // For this reference example, we generate a valid session payload:
    const paymentId = `pay_next_${Math.random().toString(36).substring(7)}`;
    const checkoutToken = `tok_next_${Math.random().toString(36).substring(7)}`;

    return NextResponse.json({
      success: true,
      paymentId,
      checkoutToken,
      baseUrl: gatewayUrl,
      amount: product.amount,
      currency: product.currency,
      checkoutUrl: `${gatewayUrl}/checkout/${paymentId}?token=${checkoutToken}`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
