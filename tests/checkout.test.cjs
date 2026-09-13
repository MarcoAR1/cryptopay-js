const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const bundle = fs.readFileSync(path.join(__dirname, '../dist/checkout.js'), 'utf8');
const payment = { paymentId: 'payment', amount: '12.34', amountUnits: '12340000', currency: 'USDT', chainId: 11155111, tokenAddress: '0x' + '1'.repeat(40), paymentAddress: '0x' + '2'.repeat(40), qrCodeUrl: 'ethereum:example', status: 'PENDING', expiresAt: new Date(Date.now() + 600000).toISOString() };
const flush = () => new Promise(r => setTimeout(r, 20));
function browser() {
  const dom = new JSDOM('<div id="checkout"></div>', { runScripts: 'outside-only' });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, putImageData() {}, createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }) });
  dom.window.eval(bundle + ';window.SDK = CryptoPay;');
  return dom;
}
test('renders a server amount and calls success only after a confirmed response', async () => {
  const dom = browser(); let successes = 0;
  dom.window.fetch = async (_url, opts) => { assert.equal(opts.headers.Authorization, 'Bearer limited'); return { ok: true, json: async () => ({ ...payment, status: 'CONFIRMED' }) }; };
  const widget = dom.window.SDK.createCheckout({ baseUrl: 'http://localhost:3001', paymentId: 'payment', checkoutToken: 'limited', onSuccess: () => successes++ });
  try {
    widget.mount('#checkout'); await flush();
    assert.ok(dom.window.document.body.textContent.includes('12.34 USDT'));
    assert.equal(successes, 1);
    widget.unmount(); assert.equal(dom.window.document.querySelector('#checkout').textContent, '');
  } finally { widget.unmount(); dom.window.close(); }
});
test('unmount cancels a pending wallet preparation before opening the wallet', async () => {
  const dom = browser(); let resolveRead, reads = 0, walletCalls = 0;
  dom.window.ethereum = { isMetaMask: true, request: async ({method}) => { walletCalls++; if(method === 'eth_chainId') return '0xaa36a7'; if(method === 'eth_requestAccounts') return ['0x' + 'a'.repeat(40)]; return '0xhash'; } };
  dom.window.fetch = async () => { reads++; return { ok: true, json: () => reads === 1 ? Promise.resolve(payment) : new Promise(r => resolveRead = r) }; };
  const widget = dom.window.SDK.createCheckout({ baseUrl: 'http://localhost:3001', paymentId: 'payment', checkoutToken: 'limited' });
  try {
    widget.mount('#checkout'); await flush();
    dom.window.document.querySelector('button').click(); await flush();
    widget.unmount(); resolveRead(payment); await flush();
    assert.equal(walletCalls, 0);
  } finally { widget.unmount(); dom.window.close(); }
});
