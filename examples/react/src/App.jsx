import React, { useState } from 'react';
import {
  CryptoPayWidget,
  useCryptoPaySession,
  CryptoPayQRCode,
  CryptoPayStatusBadge,
  CryptoPayWalletButton
} from 'cryptopay-js/react';

// Demo configuration constants
const DEMO_CONFIG = {
  baseUrl: 'http://localhost:3000',
  paymentId: 'pay_react_demo_session_123',
  checkoutToken: 'tok_react_demo_abc987',
  tokenAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', // Sepolia Mock USDT
  paymentAddress: '0x1234567890123456789012345678901234567890',
  chainId: 11155111
};

export default function App() {
  const [activeTab, setActiveTab] = useState('widget'); // 'widget' | 'headless' | 'modular'
  const [locale, setLocale] = useState('es');
  const [theme, setTheme] = useState('dark');
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>⚛️ CryptoPay React Integration</h1>
        <p style={{ color: '#64748b' }}>
          Examples demonstrating Ready-to-Use Widget, Headless Hook (<code>useCryptoPaySession</code>), and Modular Subcomponents.
        </p>
      </header>

      {/* Global Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#1e293b', padding: '1rem', borderRadius: 8, marginBottom: '1.5rem', color: '#fff' }}>
        <div>
          <label style={{ marginRight: 8 }}>Language:</label>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} style={{ padding: 4 }}>
            <option value="es">Español (ES)</option>
            <option value="en">English (EN)</option>
            <option value="pt">Português (PT)</option>
            <option value="de">Deutsch (DE)</option>
          </select>
        </div>

        <div>
          <label style={{ marginRight: 8 }}>Theme:</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{ padding: 4 }}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('widget')}
            style={{ padding: '6px 12px', background: activeTab === 'widget' ? '#6366f1' : '#334155', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Ready-to-Use Widget
          </button>
          <button
            onClick={() => setActiveTab('headless')}
            style={{ padding: '6px 12px', background: activeTab === 'headless' ? '#6366f1' : '#334155', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Headless Hook
          </button>
          <button
            onClick={() => setActiveTab('modular')}
            style={{ padding: '6px 12px', background: activeTab === 'modular' ? '#6366f1' : '#334155', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Modular Components
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
        {/* Main Demo Tab Content */}
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '1.5rem', color: '#fff' }}>
          {activeTab === 'widget' && (
            <div>
              <h2>1. Embedded CryptoPayWidget Component</h2>
              <p style style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Complete turnkey drop-in widget with automatic stylesheet injection and full lifecycle management.
              </p>
              <div style={{ maxWidth: 460, margin: '0 auto' }}>
                <CryptoPayWidget
                  baseUrl={DEMO_CONFIG.baseUrl}
                  paymentId={DEMO_CONFIG.paymentId}
                  checkoutToken={DEMO_CONFIG.checkoutToken}
                  locale={locale}
                  theme={theme}
                  onSuccess={(data) => addLog(`Payment successful! TX: ${data.txHash}`)}
                  onError={(err) => addLog(`Widget error: ${err.message}`)}
                  onStatusChange={(st) => addLog(`Status changed: ${st}`)}
                  onCancel={() => addLog('Checkout canceled by user')}
                />
              </div>
            </div>
          )}

          {activeTab === 'headless' && (
            <HeadlessDemo locale={locale} addLog={addLog} />
          )}

          {activeTab === 'modular' && (
            <ModularDemo locale={locale} addLog={addLog} />
          )}
        </div>

        {/* Live Event Log */}
        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          <h3 style={{ color: '#fff', marginBottom: '0.5rem', fontFamily: 'system-ui' }}>Activity Monitor</h3>
          {logs.length === 0 ? (
            <p style={{ color: '#64748b' }}>Awaiting events...</p>
          ) : (
            logs.map((l, i) => <div key={i} style={{ marginBottom: 4 }}>{l}</div>)
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Headless Checkout Demonstration (Custom Merchant UI)
// ---------------------------------------------------------------------------
function HeadlessDemo({ locale, addLog }) {
  const {
    state,
    data,
    error,
    refresh,
    cancel,
    payWithWallet
  } = useCryptoPaySession({
    baseUrl: DEMO_CONFIG.baseUrl,
    paymentId: DEMO_CONFIG.paymentId,
    checkoutToken: DEMO_CONFIG.checkoutToken,
    autoStart: true,
    onConfirmed: (d) => addLog(`Headless: Confirmed! ${d.paymentId}`),
    onError: (e) => addLog(`Headless error: ${e.message}`),
    onStateChange: (s) => addLog(`Headless state: ${s}`)
  });

  const handleWalletPay = async () => {
    try {
      addLog('Initiating wallet payment via useCryptoPaySession...');
      const txHash = await payWithWallet();
      addLog(`Wallet payment broadcasted! Hash: ${txHash}`);
    } catch (err) {
      addLog(`Wallet pay error: ${err.message}`);
    }
  };

  return (
    <div>
      <h2>2. Custom Headless Checkout (useCryptoPaySession)</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Complete visual control over layout and styling while delegating polling, status transitions, and wallet signatures to the SDK hook.
      </p>

      <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Current Session Status:</span>
          <CryptoPayStatusBadge state={state} locale={locale} />
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', padding: '0.75rem', borderRadius: 6, color: '#fca5a5' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <CryptoPayWalletButton
            onPay={handleWalletPay}
            disabled={state !== 'AWAITING_PAYMENT' && state !== 'WALLET_PREPARING'}
            locale={locale}
          />
          <button
            onClick={() => refresh().then(() => addLog('Manual refresh completed'))}
            style={{ padding: '0.5rem 1rem', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => cancel().then(() => addLog('Session canceled'))}
            style={{ padding: '0.5rem 1rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            🛑 Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Modular Subcomponents Demonstration
// ---------------------------------------------------------------------------
function ModularDemo({ locale, addLog }) {
  return (
    <div>
      <h2>3. Standalone Modular Subcomponents</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Combine individual subcomponents into your own existing checkout layouts.
      </p>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: 8 }}>
          <h4 style={{ marginBottom: '0.5rem' }}>CryptoPayQRCode:</h4>
          <CryptoPayQRCode
            paymentAddress={DEMO_CONFIG.paymentAddress}
            tokenAddress={DEMO_CONFIG.tokenAddress}
            chainId={DEMO_CONFIG.chainId}
            locale={locale}
            onAddressCopied={() => addLog('Deposit address copied to clipboard!')}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4>Status Badges:</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <CryptoPayStatusBadge state="INITIALIZING" locale={locale} />
            <CryptoPayStatusBadge state="AWAITING_PAYMENT" locale={locale} />
            <CryptoPayStatusBadge state="CONFIRMING" locale={locale} />
            <CryptoPayStatusBadge state="CONFIRMED" locale={locale} />
            <CryptoPayStatusBadge state="FAILED" locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}
