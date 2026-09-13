const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, '../dist/checkout.js'), 'utf8');

const paymentA = {
  paymentId: 'pay_merchant_alpha',
  amount: '49.99',
  amountUnits: '49990000',
  currency: 'USDT',
  chainId: 11155111,
  tokenAddress: '0x1111111111111111111111111111111111111111',
  paymentAddress: '0x2222222222222222222222222222222222222222',
  qrCodeUrl: 'ethereum:0x1111111111111111111111111111111111111111@11155111/transfer?address=0x2222222222222222222222222222222222222222&uint256=49990000',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 600000).toISOString()
};

const paymentB = {
  paymentId: 'pay_merchant_beta',
  amount: '120.00',
  amountUnits: '120000000',
  currency: 'USDT',
  chainId: 1,
  tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  paymentAddress: '0x3333333333333333333333333333333333333333',
  qrCodeUrl: 'ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7@1/transfer?address=0x3333333333333333333333333333333333333333&uint256=120000000',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 600000).toISOString()
};

const flush = () => new Promise(r => setTimeout(r, 25));

function createTestDOM(html = '<div id="app"><div id="checkout"></div></div>') {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'outside-only' });
  dom.window.TextEncoder = TextEncoder;
  dom.window.TextDecoder = TextDecoder;
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    putImageData() {},
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  });
  dom.window.eval(bundle + ';window.SDK = CryptoPay;');
  return dom;
}

test('CP-038: Renders in clean HTML with CSS isolation and style tokens without external CSS dependencies', async () => {
  const dom = createTestDOM('<div id="foreign-store" style="font-family: Comic Sans; color: red;"><div id="checkout"></div></div>');

  dom.window.fetch = async (url, opts) => {
    assert.equal(opts.headers.Authorization, 'Bearer token_alpha');
    return { ok: true, json: async () => paymentA };
  };

  const widget = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha',
    theme: 'dark',
    customStyles: {
      '--cpay-accent': '#00ffaa'
    }
  });

  try {
    widget.mount('#checkout');
    await flush();

    const checkoutEl = dom.window.document.querySelector('#checkout');
    assert.ok(checkoutEl.classList.contains('cpay-root'), 'Must have scoped cpay-root class');
    assert.equal(checkoutEl.style.getPropertyValue('--cpay-accent'), '#00ffaa', 'Applies custom style token');

    // Scoped widget wrapper exists
    const widgetBox = checkoutEl.querySelector('.cpay-widget');
    assert.ok(widgetBox, 'Contains scoped .cpay-widget');

    // Shows amount and currency formatted from server
    assert.ok(checkoutEl.textContent.includes('49.99'));
    assert.ok(checkoutEl.textContent.includes('USDT'));

    // Zero Paseo-specific logic or leaks (pure gateway checkout)
    assert.equal(checkoutEl.textContent.includes('reserva'), false);
    assert.equal(checkoutEl.textContent.includes('seña'), false);
  } finally {
    widget.destroy();
    dom.window.close();
  }
});

test('CP-038: Multi-instance isolation — multiple widgets can mount simultaneously without state leakage', async () => {
  const dom = createTestDOM(`
    <div id="checkout-alpha"></div>
    <div id="checkout-beta"></div>
  `);

  dom.window.fetch = async (url) => {
    if (url.includes('pay_merchant_alpha')) {
      return { ok: true, json: async () => paymentA };
    }
    if (url.includes('pay_merchant_beta')) {
      return { ok: true, json: async () => paymentB };
    }
    throw new Error('Unknown paymentId');
  };

  const widgetA = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha',
    theme: 'dark'
  });

  const widgetB = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_beta',
    checkoutToken: 'token_beta',
    theme: 'light'
  });

  try {
    widgetA.mount('#checkout-alpha');
    widgetB.mount('#checkout-beta');
    await flush();

    const elA = dom.window.document.querySelector('#checkout-alpha');
    const elB = dom.window.document.querySelector('#checkout-beta');

    // Independent theme classes
    assert.ok(elA.classList.contains('cpay-root'));
    assert.ok(!elA.classList.contains('cpay-light'));
    assert.ok(elB.classList.contains('cpay-root'));
    assert.ok(elB.classList.contains('cpay-light'));

    // Independent amounts and data
    assert.ok(elA.textContent.includes('49.99 USDT'));
    assert.ok(elB.textContent.includes('120.00 USDT'));

    // Unmounting widgetA does not touch widgetB
    widgetA.unmount();
    assert.equal(elA.textContent, '');
    assert.ok(elB.textContent.includes('120.00 USDT'));
  } finally {
    widgetA.destroy();
    widgetB.destroy();
    dom.window.close();
  }
});

test('CP-038: Method and View switching between Web3 wallet and QR direct transfer', async () => {
  const dom = createTestDOM();

  dom.window.fetch = async () => ({ ok: true, json: async () => paymentA });

  const widget = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha',
    locale: 'es'
  });

  try {
    widget.mount('#checkout');
    await flush();

    const checkoutEl = dom.window.document.querySelector('#checkout');

    // Default view: methods
    assert.equal(widget.getView(), 'methods');
    const qrToggleBtn = Array.from(checkoutEl.querySelectorAll('button')).find(b =>
      b.textContent.includes('QR')
    );
    assert.ok(qrToggleBtn, 'Direct transfer / QR button must be available');

    // Switch to QR view
    qrToggleBtn.click();
    assert.equal(widget.getView(), 'qr');
    assert.ok(checkoutEl.querySelector('.cpay-qr-view'), 'QR view is rendered');
    assert.ok(checkoutEl.textContent.includes('0x2222222222222222222222222222222222222222'), 'Shows deposit address');

    // Back button returns to methods
    const backBtn = checkoutEl.querySelector('.cpay-back-btn');
    assert.ok(backBtn);
    backBtn.click();
    assert.equal(widget.getView(), 'methods');
    assert.ok(checkoutEl.querySelector('.cpay-methods'));
  } finally {
    widget.destroy();
    dom.window.close();
  }
});

test('CP-038: Lifecycle — repeated mount/unmount and destroy prevent leaks', async () => {
  const dom = createTestDOM();

  let fetches = 0;
  dom.window.fetch = async () => {
    fetches++;
    return { ok: true, json: async () => paymentA };
  };

  const widget = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha'
  });

  try {
    // Mount 1
    widget.mount('#checkout');
    await flush();
    assert.ok(dom.window.document.querySelector('#checkout').textContent.includes('49.99'));

    // Unmount 1
    widget.unmount();
    assert.equal(dom.window.document.querySelector('#checkout').textContent, '');

    // Mount 2 on same element
    widget.mount('#checkout');
    await flush();
    assert.ok(dom.window.document.querySelector('#checkout').textContent.includes('49.99'));

    // Destroy
    widget.destroy();
    assert.equal(dom.window.document.querySelector('#checkout').textContent, '');

    // Attempting to mount after destroy must throw
    assert.throws(() => {
      widget.mount('#checkout');
    }, /destroyed/);
  } finally {
    dom.window.close();
  }
});

test('CP-039: Security invariant — Never uses contractAddress as fallback for deposit destination', async () => {
  const dom = createTestDOM();

  // Adversarial or corrupted response where paymentAddress is identical to tokenAddress
  const corruptedPayment = {
    ...paymentA,
    paymentAddress: paymentA.tokenAddress // contract address!
  };

  dom.window.fetch = async () => ({ ok: true, json: async () => corruptedPayment });

  const widget = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha',
    defaultView: 'qr'
  });

  try {
    widget.mount('#checkout');
    await flush();

    const text = dom.window.document.querySelector('#checkout').textContent;
    assert.ok(text.includes('Invalid deposit destination'), 'Must reject contract address destination');
    assert.equal(dom.window.document.querySelector('.cpay-qr-view'), null, 'Never render QR for contract address');
  } finally {
    widget.destroy();
    dom.window.close();
  }
});

test('CP-039: Network naming, exchange notices and QR canvas rendering', async () => {
  const dom = createTestDOM();

  dom.window.fetch = async () => ({ ok: true, json: async () => paymentA });

  const widget = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha',
    defaultView: 'qr',
    locale: 'es'
  });

  try {
    widget.mount('#checkout');
    await flush();

    const checkoutEl = dom.window.document.querySelector('#checkout');

    // 1. Network badge with human readable name
    assert.ok(checkoutEl.textContent.includes('Sepolia Testnet'));

    // 2. Exchange warning notice present
    assert.ok(checkoutEl.textContent.includes('Exchanges'));
    assert.ok(checkoutEl.querySelector('.cpay-notice'));

    // 3. QR canvas rendered
    assert.ok(checkoutEl.querySelector('.cpay-qr-container canvas'));

    // 4. Utility function getNetworkName works
    assert.equal(dom.window.SDK.getNetworkName(1), 'Ethereum Mainnet');
    assert.equal(dom.window.SDK.getNetworkName(11155111), 'Sepolia Testnet');
    assert.equal(dom.window.SDK.getNetworkName(137), 'Polygon');
    assert.equal(dom.window.SDK.getNetworkName(8453), 'Base');
  } finally {
    widget.destroy();
    dom.window.close();
  }
});

test('CP-028 Criterion 2: UI never offers CONTRACT actions to a DIRECT payment by error', async () => {
  const dom = createTestDOM();

  const directPayment = {
    ...paymentA,
    paymentMethod: 'DIRECT',
  };

  dom.window.fetch = async () => ({ ok: true, json: async () => directPayment });

  // Explicitly configure defaultView: 'methods' to test that DIRECT payment strictly overrides it!
  const widget = dom.window.SDK.createCheckout({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_merchant_alpha',
    checkoutToken: 'token_alpha',
    defaultView: 'methods',
    locale: 'en'
  });

  try {
    widget.mount('#checkout');
    await flush();

    const checkoutEl = dom.window.document.querySelector('#checkout');

    // 1. Must render QR and address view directly
    assert.ok(checkoutEl.querySelector('.cpay-qr-view'), 'Must render .cpay-qr-view for DIRECT payment');
    assert.ok(checkoutEl.querySelector('.cpay-address-box'), 'Must render deposit address box');

    // 2. Must NOT render any CONTRACT actions (no wallet connect or method buttons)
    assert.equal(checkoutEl.querySelector('.cpay-methods'), null, 'Must NOT render .cpay-methods container');
    assert.equal(checkoutEl.querySelector('.cpay-method-btn'), null, 'Must NOT render any .cpay-method-btn');
    assert.equal(checkoutEl.querySelector('.cpay-method-gasless'), null, 'Must NOT render gasless contract button');

    // 3. Must NOT render "Back to Wallets" button since there are no wallet contract actions
    assert.equal(checkoutEl.querySelector('.cpay-back-btn'), null, 'Must NOT render .cpay-back-btn for DIRECT payment');
  } finally {
    widget.destroy();
    dom.window.close();
  }
});


