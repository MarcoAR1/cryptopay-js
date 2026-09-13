const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');

// Mark environment for React act()
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Setup DOM environment for React
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
dom.window.TextEncoder = TextEncoder;
dom.window.TextDecoder = TextDecoder;

// Load React bundle
const {
  useCryptoPaySession,
  CryptoPayWidget,
  CryptoPayQRCode,
  CryptoPayStatusBadge,
  CryptoPayWalletButton,
  CryptoPayProvider,
  useCryptoPayContext
} = require('../dist/react.cjs');

test('CP-041 React Suite - Components & Hooks export verification', () => {
  assert.equal(typeof useCryptoPaySession, 'function', 'useCryptoPaySession must be exported');
  assert.equal(typeof CryptoPayWidget, 'function', 'CryptoPayWidget must be exported');
  assert.equal(typeof CryptoPayQRCode, 'function', 'CryptoPayQRCode must be exported');
  assert.equal(typeof CryptoPayStatusBadge, 'function', 'CryptoPayStatusBadge must be exported');
  assert.equal(typeof CryptoPayWalletButton, 'function', 'CryptoPayWalletButton must be exported');
  assert.equal(typeof CryptoPayProvider, 'function', 'CryptoPayProvider must be exported');
  assert.equal(typeof useCryptoPayContext, 'function', 'useCryptoPayContext must be exported');
});

test('CP-041 React Suite - CryptoPayStatusBadge renders correct state labels', async () => {
  const container = document.createElement('div');
  const root = ReactDOM.createRoot(container);

  await act(async () => {
    root.render(React.createElement(CryptoPayStatusBadge, { state: 'AWAITING_PAYMENT' }));
  });
  assert.ok(container.textContent.includes('Awaiting Payment'));

  await act(async () => {
    root.render(React.createElement(CryptoPayStatusBadge, { state: 'CONFIRMED' }));
  });
  assert.ok(container.textContent.includes('Payment Confirmed'));

  await act(async () => {
    root.render(React.createElement(CryptoPayStatusBadge, { state: 'CANCELLED' }));
  });
  assert.ok(container.textContent.includes('Session Cancelled'));

  await act(async () => {
    root.unmount();
  });
});

test('CP-041 React Suite - CryptoPayQRCode enforces contract address destination guard', async () => {
  const container = document.createElement('div');
  const root = ReactDOM.createRoot(container);

  const tokenContract = '0x1111111111111111111111111111111111111111';

  // Dangerous case: paymentAddress matches tokenAddress
  await act(async () => {
    root.render(
      React.createElement(CryptoPayQRCode, {
        paymentAddress: tokenContract,
        tokenAddress: tokenContract,
        chainId: 11155111
      })
    );
  });

  assert.ok(container.querySelector('.cpay-error-box'), 'Must render error box when addresses match');
  assert.ok(container.textContent.includes('Invalid deposit destination'), 'Must warn about token contract destination');
  assert.equal(container.querySelector('canvas'), null, 'Must NOT render QR canvas if addresses match');

  // Safe case: valid user/treasury deposit address
  const safeAddress = '0x2222222222222222222222222222222222222222';
  await act(async () => {
    root.render(
      React.createElement(CryptoPayQRCode, {
        paymentAddress: safeAddress,
        tokenAddress: tokenContract,
        chainId: 11155111
      })
    );
  });

  assert.equal(container.querySelector('.cpay-error-box'), null);
  assert.ok(container.querySelector('canvas'), 'Must render canvas for valid destination');
  assert.ok(container.textContent.includes(safeAddress));
  assert.ok(container.textContent.includes('Sepolia Testnet'));

  await act(async () => {
    root.unmount();
  });
});

test('CP-041 React Suite - CryptoPayWidget handles mount, unmount and StrictMode cleanup cleanly', async () => {
  let originalFetch = global.window.fetch;
  global.window.fetch = async (url) => {
    if (url.includes('/api/checkout/pay_test/public')) {
      return {
        ok: true,
        json: async () => ({
          paymentId: 'pay_test',
          amount: '49.99',
          amountUnits: '49990000',
          currency: 'USDT',
          status: 'PENDING',
          paymentAddress: '0x2222222222222222222222222222222222222222',
          tokenAddress: '0x1111111111111111111111111111111111111111',
          chainId: 11155111,
          expiresAt: new Date(Date.now() + 900000).toISOString()
        })
      };
    }
    return { ok: false, status: 404 };
  };

  const container = document.createElement('div');
  const root = ReactDOM.createRoot(container);

  // Mount inside StrictMode (triggers mount -> unmount -> remount)
  await act(async () => {
    root.render(
      React.createElement(React.StrictMode, null,
        React.createElement(CryptoPayWidget, {
          baseUrl: 'http://localhost:3000',
          paymentId: 'pay_test',
          checkoutToken: 'tok_test',
          theme: 'dark'
        })
      )
    );
  });

  // Verify container receives cpay-root class synchronously
  assert.ok(container.querySelector('.cpay-root'), 'Container must have cpay-root attached');

  // Allow async fetch and DOM render to complete
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  assert.ok(container.querySelector('.cpay-widget'), 'Widget must render inner DOM structure');

  // Unmount cleanly
  await act(async () => {
    root.unmount();
  });

  assert.equal(container.innerHTML, '', 'Container should be cleanly unmounted');
  global.window.fetch = originalFetch;
});

test('CP-041 React Suite - useCryptoPaySession hook drives custom UI without full widget', async () => {
  let fetchCallCount = 0;
  let originalFetch = global.window.fetch;
  global.window.fetch = async (url) => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({
        paymentId: 'pay_custom',
        amount: '100.00',
        amountUnits: '100000000',
        currency: 'USDT',
        status: 'PENDING',
        paymentAddress: '0x3333333333333333333333333333333333333333',
        tokenAddress: '0x4444444444444444444444444444444444444444',
        chainId: 137,
        expiresAt: new Date(Date.now() + 900000).toISOString()
      })
    };
  };

  function CustomCheckoutComponent() {
    const { state, data, payWithWallet } = useCryptoPaySession({
      baseUrl: 'http://localhost:3000',
      paymentId: 'pay_custom',
      checkoutToken: 'tok_custom',
      autoStart: true
    });

    return React.createElement(
      'div',
      { className: 'custom-checkout-root' },
      React.createElement(CryptoPayStatusBadge, { state }),
      data ? React.createElement('div', { className: 'custom-amount' }, `${data.amount} ${data.currency}`) : null,
      data ? React.createElement(CryptoPayQRCode, {
        paymentAddress: data.paymentAddress,
        tokenAddress: data.tokenAddress,
        chainId: data.chainId
      }) : null,
      React.createElement(CryptoPayWalletButton, {
        onPay: async () => { await payWithWallet(); },
        label: 'Custom Web3 Pay'
      })
    );
  }

  const container = document.createElement('div');
  const root = ReactDOM.createRoot(container);

  await act(async () => {
    root.render(React.createElement(CustomCheckoutComponent));
  });

  assert.ok(container.querySelector('.custom-checkout-root'), 'Custom checkout mounted');
  assert.ok(container.querySelector('.cpay-status-badge'), 'Status badge present');
  assert.ok(container.querySelector('.cpay-wallet-btn'), 'Custom wallet button present');

  await act(async () => {
    root.unmount();
  });

  global.window.fetch = originalFetch;
});
