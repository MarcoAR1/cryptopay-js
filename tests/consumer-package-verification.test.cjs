const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const rootDir = path.resolve(__dirname, '..');

test('CP-044 Criterion 1: Examples contain zero private Paseo references or source path imports', (t) => {
  const examplesDir = path.join(rootDir, 'examples');
  assert.ok(fs.existsSync(examplesDir), 'examples directory must exist');

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.next') {
          scanDir(fullPath);
        }
      } else if (/\.(js|jsx|ts|tsx|html|json)$/i.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for relative imports to src
        assert.doesNotMatch(
          content,
          /from\s+['"][^'"]*\/src\//,
          `File ${path.relative(rootDir, fullPath)} contains illegal relative import to internal src/`
        );
        assert.doesNotMatch(
          content,
          /require\s*\(\s*['"][^'"]*\/src\//,
          `File ${path.relative(rootDir, fullPath)} contains illegal relative require to internal src/`
        );

        // Check for private PaseoLibre references or secrets (in application and configuration files)
        if (!file.includes('test')) {
          assert.doesNotMatch(
            content,
            /paseo-libre/,
            `File ${path.relative(rootDir, fullPath)} contains private paseo-libre reference`
          );
        }
      }
    }
  }

  scanDir(examplesDir);
});

test('CP-044 Criterion 2 & Verification: Pack tarball, install in isolated consumer, and verify CJS/ESM/types/assets', async (t) => {
  // 1. Pack the package into a tarball
  const packOutput = execSync('npm pack', { cwd: rootDir, encoding: 'utf8' }).trim();
  const tarballName = packOutput.split('\n').pop().trim();
  const tarballPath = path.join(rootDir, tarballName);

  assert.ok(fs.existsSync(tarballPath), `Packed tarball ${tarballName} must exist`);

  // 2. Create an isolated consumer sandbox in a temp location
  const tempConsumerDir = path.join(rootDir, 'node_modules', '.tmp-consumer-test');
  if (fs.existsSync(tempConsumerDir)) {
    fs.rmSync(tempConsumerDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempConsumerDir, { recursive: true });

  try {
    // Unpack tarball in consumer directory
    execSync(`tar -xzf "${tarballPath}" -C "${tempConsumerDir}"`, { encoding: 'utf8' });
    const pkgDir = path.join(tempConsumerDir, 'package');
    assert.ok(fs.existsSync(pkgDir), 'Extracted package directory must exist');

    // Verify package does not leak src/ or internal build configs
    assert.ok(!fs.existsSync(path.join(pkgDir, 'src')), 'Tarball must NOT contain internal src/ directory');
    assert.ok(!fs.existsSync(path.join(pkgDir, 'tsconfig.json')), 'Tarball must NOT contain tsconfig.json');

    // 3. Test CommonJS import of core package
    const cjsCore = require(path.join(pkgDir, 'dist', 'checkout.cjs'));
    assert.equal(typeof cjsCore.createCheckout, 'function', 'cjsCore must export createCheckout');
    assert.equal(typeof cjsCore.openModal, 'function', 'cjsCore must export openModal');
    assert.equal(typeof cjsCore.verifyWebhook, 'function', 'cjsCore must export verifyWebhook');
    assert.equal(typeof cjsCore.createWebhookMiddleware, 'function', 'cjsCore must export createWebhookMiddleware');

    // 4. Test CommonJS import of react package
    const cjsReact = require(path.join(pkgDir, 'dist', 'react.cjs'));
    assert.equal(typeof cjsReact.CryptoPayWidget, 'function', 'cjsReact must export CryptoPayWidget');
    assert.equal(typeof cjsReact.useCryptoPaySession, 'function', 'cjsReact must export useCryptoPaySession');
    assert.equal(typeof cjsReact.CryptoPayQRCode, 'function', 'cjsReact must export CryptoPayQRCode');
    assert.equal(typeof cjsReact.CryptoPayStatusBadge, 'function', 'cjsReact must export CryptoPayStatusBadge');
    assert.equal(typeof cjsReact.CryptoPayWalletButton, 'function', 'cjsReact must export CryptoPayWalletButton');

    // 5. Test ESM import of core package
    const esmCore = await import(pathToFileURL(path.join(pkgDir, 'dist', 'checkout.mjs')).href);
    assert.equal(typeof esmCore.createCheckout, 'function', 'esmCore must export createCheckout');
    assert.equal(typeof esmCore.openModal, 'function', 'esmCore must export openModal');
    assert.equal(typeof esmCore.verifyWebhook, 'function', 'esmCore must export verifyWebhook');

    // 6. Test ESM import of react package
    const esmReact = await import(pathToFileURL(path.join(pkgDir, 'dist', 'react.mjs')).href);
    assert.equal(typeof esmReact.CryptoPayWidget, 'function', 'esmReact must export CryptoPayWidget');
    assert.equal(typeof esmReact.useCryptoPaySession, 'function', 'esmReact must export useCryptoPaySession');
    assert.equal(typeof esmReact.CryptoPayQRCode, 'function', 'esmReact must export CryptoPayQRCode');

    // 7. Verify all TypeScript declaration files are included
    const expectedDtsFiles = [
      'dist/index.d.ts',
      'dist/checkout.d.ts',
      'dist/react/index.d.ts',
      'dist/core/types.d.ts',
      'dist/core/session.d.ts',
      'dist/node/types.d.ts',
      'dist/node/webhook.d.ts',
      'dist/i18n/index.d.ts',
      'dist/i18n/es.d.ts',
      'dist/i18n/en.d.ts',
      'dist/i18n/pt.d.ts',
      'dist/i18n/de.d.ts'
    ];
    for (const dts of expectedDtsFiles) {
      const fullDts = path.join(pkgDir, dts);
      assert.ok(fs.existsSync(fullDts), `TypeScript declaration file ${dts} must exist in tarball`);
      assert.ok(fs.statSync(fullDts).size > 0, `TypeScript declaration file ${dts} must not be empty`);
    }

    // 8. Verify embedded styles are injected and self-contained
    const checkoutJs = fs.readFileSync(path.join(pkgDir, 'dist', 'checkout.js'), 'utf8');
    assert.ok(
      checkoutJs.includes('.cryptopay-checkout') || checkoutJs.includes('cpay-'),
      'Standalone bundle must contain embedded checkout styles'
    );

    // 9. Verify IIFE standalone bundle executes and registers window.CryptoPay
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="target"></div></body></html>', {
      runScripts: 'dangerously'
    });
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = checkoutJs;
    dom.window.document.body.appendChild(scriptEl);

    assert.ok(dom.window.CryptoPay, 'window.CryptoPay must be defined by standalone bundle');
    assert.equal(typeof dom.window.CryptoPay.createCheckout, 'function', 'window.CryptoPay.createCheckout must be a function');
    assert.equal(typeof dom.window.CryptoPay.openModal, 'function', 'window.CryptoPay.openModal must be a function');

    // Test creating and mounting checkout in 4 languages
    for (const loc of ['es', 'en', 'pt', 'de']) {
      const chk = dom.window.CryptoPay.createCheckout({
        baseUrl: 'http://localhost:3000',
        paymentId: 'pay_test_' + loc,
        checkoutToken: 'tok_test_' + loc,
        locale: loc
      });
      const targetEl = dom.window.document.getElementById('target');
      chk.mount(targetEl);
      assert.ok(
        targetEl.classList.contains('cpay-root'),
        `Widget root must have class cpay-root for locale ${loc}`
      );
      chk.unmount();
      assert.ok(
        !targetEl.classList.contains('cpay-root'),
        `Widget root must remove class cpay-root on unmount for locale ${loc}`
      );
    }
  } finally {
    // Cleanup generated tarball and consumer sandbox
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
    if (fs.existsSync(tempConsumerDir)) {
      fs.rmSync(tempConsumerDir, { recursive: true, force: true });
    }
  }
});
