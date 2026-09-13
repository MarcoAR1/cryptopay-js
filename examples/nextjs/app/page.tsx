'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useCryptoPaySession, CryptoPayStatusBadge } from 'cryptopay-js/react';

// Dynamically import CryptoPayWidget to guarantee zero SSR hydration mismatches
const CryptoPayWidget = dynamic(
  () => import('cryptopay-js/react').then((mod) => mod.CryptoPayWidget),
  { ssr: false }
);

export default function NextCheckoutPage() {
  const [session, setSession] = useState<{
    paymentId: string;
    checkoutToken: string;
    baseUrl: string;
    amount: string;
    currency: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<'es' | 'en' | 'pt' | 'de'>('es');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [useHeadless, setUseHeadless] = useState(false);

  // 1. Create payment session via Next.js Route Handler (/api/checkout)
  const handleCreateCheckout = async (productId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, customerEmail: 'buyer@example.com' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create checkout session');

      setSession({
        paymentId: data.paymentId,
        checkoutToken: data.checkoutToken,
        baseUrl: data.baseUrl || 'http://localhost:3000',
        amount: data.amount,
        currency: data.currency
      });
    } catch (err: any) {
      alert(`Checkout error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>▲ Next.js App Router + CryptoPay</h1>
        <p style={{ color: '#64748b' }}>
          Production-grade Next.js integration pattern with Server-Side Route Handlers and SSR-safe Client Components.
        </p>
      </header>

      {!session ? (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '2rem', color: '#fff' }}>
          <h2>Storefront Product Catalog</h2>
          <p style={{ color: '#94a3b8', margin: '0.5rem 0 1.5rem' }}>
            Prices are authoritative on the server. The client only sends the product ID.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: 8 }}>
              <h3>Pro Monthly Pass</h3>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.5rem 0' }}>15.00 USDT</p>
              <button
                onClick={() => handleCreateCheckout('plan_pro_monthly')}
                disabled={loading}
                style={{ width: '100%', padding: '0.75rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
              >
                {loading ? 'Creating...' : 'Pay with CryptoPay'}
              </button>
            </div>

            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: 8 }}>
              <h3>Enterprise Annual Pass</h3>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.5rem 0' }}>150.00 USDT</p>
              <button
                onClick={() => handleCreateCheckout('plan_enterprise_annual')}
                disabled={loading}
                style={{ width: '100%', padding: '0.75rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
              >
                {loading ? 'Creating...' : 'Pay with CryptoPay'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '2rem', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2>Active Checkout Session</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                Order Total: <strong>{session.amount} {session.currency}</strong> (ID: {session.paymentId})
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as any)}
                style={{ padding: '0.4rem', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: 4 }}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
                <option value="de">Deutsch</option>
              </select>

              <button
                onClick={() => setUseHeadless(!useHeadless)}
                style={{ padding: '0.4rem 0.8rem', background: '#334155', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                {useHeadless ? 'Switch to Ready-to-Use' : 'Switch to Headless'}
              </button>

              <button
                onClick={() => setSession(null)}
                style={{ padding: '0.4rem 0.8rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>

          {!useHeadless ? (
            <div style={{ maxWidth: 460, margin: '0 auto' }}>
              <CryptoPayWidget
                baseUrl={session.baseUrl}
                paymentId={session.paymentId}
                checkoutToken={session.checkoutToken}
                locale={locale}
                theme={theme}
                onSuccess={(data) => alert(`Payment Confirmed! TX: ${data.txHash}`)}
                onError={(err) => console.error('Widget error:', err)}
              />
            </div>
          ) : (
            <HeadlessCheckoutView
              baseUrl={session.baseUrl}
              paymentId={session.paymentId}
              checkoutToken={session.checkoutToken}
              locale={locale}
            />
          )}
        </div>
      )}
    </main>
  );
}

function HeadlessCheckoutView({
  baseUrl,
  paymentId,
  checkoutToken,
  locale
}: {
  baseUrl: string;
  paymentId: string;
  checkoutToken: string;
  locale: any;
}) {
  const { state, data, error, payWithWallet } = useCryptoPaySession({
    baseUrl,
    paymentId,
    checkoutToken,
    onConfirmed: () => alert('Headless confirmed!')
  });

  return (
    <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: 8 }}>
      <h3>Custom Branded Headless Experience</h3>
      <div style={{ margin: '1rem 0' }}>
        <span>Status: </span>
        <CryptoPayStatusBadge state={state} locale={locale} />
      </div>

      {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}

      <button
        onClick={() => payWithWallet()}
        disabled={state !== 'AWAITING_PAYMENT'}
        style={{ padding: '0.75rem 1.5rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
      >
        Pay with Connected Wallet
      </button>
    </div>
  );
}
