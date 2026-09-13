const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const {
  getTranslations,
  formatAmountDisplay,
  formatAmountWire,
  SUPPORTED_LOCALES,
  es,
  en,
  pt,
  de,
  CryptoPayCheckout,
  CryptoPayModal,
} = require('../dist/checkout.cjs');

test('CP-042: Supported locales include es, en, pt, de without French confusion', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['es', 'en', 'pt', 'de']);
  assert.equal(getTranslations('es').locale, 'es');
  assert.equal(getTranslations('en').locale, 'en');
  assert.equal(getTranslations('pt').locale, 'pt');
  assert.equal(getTranslations('de').locale, 'de');

  // Fallback to en for unknown or missing locale
  assert.equal(getTranslations('fr').locale, 'en');
  assert.equal(getTranslations(undefined).locale, 'en');
  assert.equal(getTranslations('').locale, 'en');
  // Normalization of BCP47 tags like es-AR, pt-BR, de-DE
  assert.equal(getTranslations('es-AR').locale, 'es');
  assert.equal(getTranslations('pt-BR').locale, 'pt');
  assert.equal(getTranslations('de-DE').locale, 'de');
});

test('CP-042: Full catalog key parity across all 4 locales (no missing keys)', () => {
  const catalogs = { es, en, pt, de };

  function extractKeys(obj, prefix = '') {
    let keys = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        keys = keys.concat(extractKeys(value, fullPath));
      } else {
        keys.push(fullPath);
      }
    }
    return keys.sort();
  }

  const enKeys = extractKeys(en);

  for (const [localeName, catalog] of Object.entries(catalogs)) {
    const locKeys = extractKeys(catalog);
    assert.deepEqual(
      locKeys,
      enKeys,
      `Catalog ${localeName} must have identical key structure to en`
    );

    // Verify non-empty strings
    for (const key of locKeys) {
      const parts = key.split('.');
      let val = catalog;
      for (const p of parts) {
        val = val[p];
      }
      assert.ok(val, `Key ${key} in ${localeName} must have non-empty content`);
    }
  }
});

test('CP-042: German catalog contains validated high-precision terminology', () => {
  assert.equal(de.depositAddress, 'Einzahlungsadresse:');
  assert.equal(de.statusBadges.confirmed, 'Zahlung bestätigt');
  assert.equal(de.payWithWallet, 'Mit Wallet bezahlen');
  assert.equal(de.aria.closeModal, 'Zahlungsfenster schließen');
  assert.ok(de.directDepositNotice.includes('Börsen'));
  assert.ok(de.errors.depositDestination.includes('Ungültiges Einzahlungsziel'));
});

test('CP-042: Financial Invariant — Wire amounts NEVER depend on locale decimal separator', () => {
  // Test numeric inputs
  assert.equal(formatAmountWire(100), '100');
  assert.equal(formatAmountWire(12.34), '12.34');
  assert.equal(formatAmountWire(1234.5678), '1234.5678');
  assert.equal(formatAmountWire(0.000001), '0.000001');

  // Test string inputs with period
  assert.equal(formatAmountWire('100'), '100');
  assert.equal(formatAmountWire('12.34'), '12.34');
  assert.equal(formatAmountWire('1234.560000'), '1234.560000');

  // Test string inputs with comma normalized to standard period wire
  assert.equal(formatAmountWire('12,34'), '12.34');
  assert.equal(formatAmountWire('1000,50'), '1000.50');

  // Wire amounts must never contain a comma
  for (const testVal of [1000.5, '1000,5', 0.05, '0,05']) {
    const wire = formatAmountWire(testVal);
    assert.equal(wire.includes(','), false, `Wire value ${wire} must not contain comma separator`);
    assert.ok(/^-?\d+(\.\d+)?$/.test(wire), `Wire value ${wire} must be standard dot-separated float`);
  }

  // Throws on invalid numeric strings or non-finite values
  assert.throws(() => formatAmountWire('not-a-number'), /Invalid numeric amount/);
  assert.throws(() => formatAmountWire(NaN), /Invalid numeric amount/);
  assert.throws(() => formatAmountWire(Infinity), /Invalid numeric amount/);
});

test('CP-042: Display amount formatting respects locale conventions', () => {
  const amount = 1234.56;

  const esDisplay = formatAmountDisplay(amount, 'es');
  const deDisplay = formatAmountDisplay(amount, 'de');
  const enDisplay = formatAmountDisplay(amount, 'en');
  const ptDisplay = formatAmountDisplay(amount, 'pt');

  // es and de use comma as decimal separator
  assert.ok(esDisplay.includes(',56') || esDisplay.includes(',560'), `es display ${esDisplay} should format decimal with comma`);
  assert.ok(deDisplay.includes(',56') || deDisplay.includes(',560'), `de display ${deDisplay} should format decimal with comma`);

  // en uses dot as decimal separator
  assert.ok(enDisplay.includes('.56') || enDisplay.includes('.560'), `en display ${enDisplay} should format decimal with dot`);

  // pt uses comma as decimal separator
  assert.ok(ptDisplay.includes(',56') || ptDisplay.includes(',560'), `pt display ${ptDisplay} should format decimal with comma`);
});

test('CP-042: Accessibility and Mobile UX attributes on Widget and Modal', async () => {
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only' });
  global.document = dom.window.document;
  global.window = dom.window;

  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    putImageData() {},
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  });

  const payment = {
    paymentId: 'pay_test_042',
    amount: '1234.56',
    amountUnits: '1234560000',
    currency: 'USDT',
    chainId: 11155111,
    tokenAddress: '0x' + '1'.repeat(40),
    paymentAddress: '0x' + '2'.repeat(40),
    qrCodeUrl: 'ethereum:example',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 600000).toISOString()
  };

  global.fetch = async () => ({
    ok: true,
    json: async () => payment
  });
  dom.window.fetch = global.fetch;

  // 1. Mount checkout with German locale
  const checkout = new CryptoPayCheckout({
    baseUrl: 'https://gateway.example',
    paymentId: 'pay_test_042',
    checkoutToken: 'tok_042',
    locale: 'de',
    defaultView: 'qr'
  });

  const rootEl = dom.window.document.querySelector('#root');
  checkout.mount(rootEl);
  await new Promise(r => setTimeout(r, 60));

  const widget = rootEl.querySelector('.cpay-widget');
  assert.ok(widget, 'Widget container must be rendered');
  assert.equal(widget.getAttribute('role'), 'region');
  assert.equal(widget.getAttribute('aria-label'), de.checkoutTitle);

  // Status badge with polite live region
  const statusP = rootEl.querySelector('.cpay-status');
  assert.ok(statusP);
  assert.equal(statusP.getAttribute('aria-live'), 'polite');

  // Copy button has aria-label and accessible title
  const copyBtn = rootEl.querySelector('.cpay-copy-btn');
  assert.ok(copyBtn);
  assert.equal(copyBtn.getAttribute('aria-label'), de.aria.copyAddress);

  checkout.destroy();

  // 2. Open accessible Modal with Spanish locale
  const modal = new CryptoPayModal({
    baseUrl: 'https://gateway.example',
    paymentId: 'pay_test_042',
    checkoutToken: 'tok_042',
    locale: 'es'
  });

  modal.open();
  const overlay = dom.window.document.querySelector('.cpay-modal-overlay');
  assert.ok(overlay, 'Modal overlay must be attached to document');
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.equal(overlay.getAttribute('aria-modal'), 'true');
  assert.equal(overlay.getAttribute('aria-label'), es.aria.dialog);

  const closeBtn = overlay.querySelector('.cpay-modal-close-btn');
  assert.ok(closeBtn);
  assert.equal(closeBtn.getAttribute('aria-label'), es.aria.closeModal);

  modal.close();
  assert.equal(dom.window.document.querySelector('.cpay-modal-overlay'), null);
});
