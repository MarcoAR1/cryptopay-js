const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, '../dist/checkout.js'), 'utf8');

const paymentA = {
  paymentId: 'pay_modal_01',
  amount: '75.00',
  amountUnits: '75000000',
  currency: 'USDT',
  chainId: 11155111,
  tokenAddress: '0x1111111111111111111111111111111111111111',
  paymentAddress: '0x2222222222222222222222222222222222222222',
  qrCodeUrl: 'ethereum:test',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 600000).toISOString()
};

const flush = () => new Promise(r => setTimeout(r, 30));

function createModalDOM() {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <body>
        <button id="open-btn">Abrir Checkout</button>
      </body>
    </html>
  `, { runScripts: 'outside-only' });

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

test('CP-040: Opens accessible modal, locks body scroll and focuses close button', async () => {
  const dom = createModalDOM();
  dom.window.fetch = async () => ({ ok: true, json: async () => paymentA });

  const trigger = dom.window.document.querySelector('#open-btn');
  trigger.focus();
  assert.equal(dom.window.document.activeElement, trigger);

  const modal = dom.window.SDK.openModal({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_modal_01',
    checkoutToken: 'token_modal'
  });

  await flush();

  try {
    const overlay = dom.window.document.querySelector('.cpay-modal-overlay');
    assert.ok(overlay, 'Modal overlay must be attached to body');
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.equal(overlay.getAttribute('aria-modal'), 'true');

    // Body scroll must be locked
    assert.equal(dom.window.document.body.style.overflow, 'hidden');

    // Checkout widget mounted inside modal container
    assert.ok(overlay.querySelector('.cpay-widget'));
    assert.ok(overlay.textContent.includes('75.00 USDT'));

    // Close button focused
    const closeBtn = overlay.querySelector('.cpay-modal-close-btn');
    assert.ok(closeBtn);
    assert.equal(dom.window.document.activeElement, closeBtn);

    // Close modal
    modal.close();
    await flush();

    // Overlay removed and body scroll restored
    assert.equal(dom.window.document.querySelector('.cpay-modal-overlay'), null);
    assert.equal(dom.window.document.body.style.overflow, '');

    // Focus restored to initial trigger button
    assert.equal(dom.window.document.activeElement, trigger);
  } finally {
    modal.destroy();
    dom.window.close();
  }
});

test('CP-040: Escape key closes modal without sending cancellation to gateway', async () => {
  const dom = createModalDOM();
  let deleteOrCancelCalls = 0;

  dom.window.fetch = async (url, opts = {}) => {
    if (opts.method === 'DELETE' || (url && url.includes('cancel'))) {
      deleteOrCancelCalls++;
    }
    return { ok: true, json: async () => paymentA };
  };

  const modal = dom.window.SDK.openModal({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_modal_01',
    checkoutToken: 'token_modal'
  });

  await flush();

  try {
    assert.ok(dom.window.document.querySelector('.cpay-modal-overlay'));

    // Dispatch Escape key
    const escapeEvent = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    dom.window.document.dispatchEvent(escapeEvent);
    await flush();

    // Modal is closed
    assert.equal(dom.window.document.querySelector('.cpay-modal-overlay'), null);
    assert.equal(dom.window.document.body.style.overflow, '');

    // Closing does NOT cancel the on-chain or server payment
    assert.equal(deleteOrCancelCalls, 0, 'Closing modal must never cancel financial intent');
  } finally {
    modal.destroy();
    dom.window.close();
  }
});

test('CP-040: Backdrop click closes modal when closeOnOverlayClick is true', async () => {
  const dom = createModalDOM();
  dom.window.fetch = async () => ({ ok: true, json: async () => paymentA });

  let closedCount = 0;
  const modal = dom.window.SDK.openModal({
    baseUrl: 'https://gateway.cryptopay.example',
    paymentId: 'pay_modal_01',
    checkoutToken: 'token_modal',
    onClose: () => closedCount++
  });

  await flush();

  try {
    const overlay = dom.window.document.querySelector('.cpay-modal-overlay');
    assert.ok(overlay);

    // Clicking overlay backdrop closes
    overlay.click();
    await flush();

    assert.equal(dom.window.document.querySelector('.cpay-modal-overlay'), null);
    assert.equal(closedCount, 1);
  } finally {
    modal.destroy();
    dom.window.close();
  }
});
