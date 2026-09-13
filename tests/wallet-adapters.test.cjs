const test = require('node:test');
const assert = require('node:assert/strict');
const {
  InjectedWalletAdapter,
  WalletPaymentManager,
  WalletNotInstalledError,
  WalletPermissionRejectedError,
  ChainSwitchRejectedError,
  NetworkMismatchError,
  PaymentPreparationInvalidatedError,
  getMobileDeepLinks,
  getWalletSupportMatrix,
} = require('../dist/checkout.cjs');

function createMockProvider(options = {}) {
  let activeAccount = options.initialAccount || '0x1111111111111111111111111111111111111111';
  let activeChainIdHex = options.initialChainIdHex || '0xaa36a7'; // Sepolia: 11155111
  const listeners = new Map();

  return {
    get activeAccount() {
      return activeAccount;
    },
    get activeChainIdHex() {
      return activeChainIdHex;
    },
    triggerAccountsChanged(newAccounts) {
      activeAccount = newAccounts[0] || null;
      const handlers = listeners.get('accountsChanged') || [];
      handlers.forEach((h) => h(newAccounts));
    },
    triggerChainChanged(newChainHex) {
      activeChainIdHex = newChainHex;
      const handlers = listeners.get('chainChanged') || [];
      handlers.forEach((h) => h(newChainHex));
    },
    triggerDisconnect() {
      const handlers = listeners.get('disconnect') || [];
      handlers.forEach((h) => h());
    },
    request: async ({ method, params }) => {
      if (options.shouldRejectPermission && method === 'eth_requestAccounts') {
        const err = new Error('User rejected request');
        err.code = 4001;
        throw err;
      }
      if (options.shouldRejectChainSwitch && method === 'wallet_switchEthereumChain') {
        const err = new Error('User rejected switch');
        err.code = 4001;
        throw err;
      }
      if (method === 'eth_requestAccounts') {
        return [activeAccount];
      }
      if (method === 'eth_chainId') {
        return activeChainIdHex;
      }
      if (method === 'wallet_switchEthereumChain') {
        activeChainIdHex = params[0].chainId;
        return null;
      }
      if (method === 'eth_sendTransaction') {
        return '0x' + '9'.repeat(64);
      }
      throw new Error(`Unsupported method: ${method}`);
    },
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    removeListener: (event, handler) => {
      const handlers = listeners.get(event) || [];
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    },
  };
}

test('InjectedWalletAdapter: Connects explicitly and normalizes account and chainId', async () => {
  const mockProvider = createMockProvider();
  const adapter = new InjectedWalletAdapter({
    id: 'mock-wallet',
    name: 'Mock Wallet',
    provider: mockProvider,
  });

  assert.equal(adapter.isAvailable(), true);
  const state = await adapter.connect();
  assert.equal(state.address, '0x1111111111111111111111111111111111111111');
  assert.equal(state.chainId, 11155111);
});

test('InjectedWalletAdapter: Wallet not installed or permission rejected produces recoverable error', async () => {
  // 1. Not installed
  const emptyAdapter = new InjectedWalletAdapter({
    id: 'missing',
    name: 'Missing Wallet',
    provider: undefined,
  });
  await assert.rejects(
    () => emptyAdapter.connect(),
    (err) => {
      assert.ok(err instanceof WalletNotInstalledError);
      assert.equal(err.code, 'WALLET_NOT_INSTALLED');
      return true;
    }
  );

  // 2. Permission rejected by user
  const rejectingProvider = createMockProvider({ shouldRejectPermission: true });
  const rejectingAdapter = new InjectedWalletAdapter({
    id: 'rejecting',
    provider: rejectingProvider,
  });
  await assert.rejects(
    () => rejectingAdapter.connect(),
    (err) => {
      assert.ok(err instanceof WalletPermissionRejectedError);
      assert.equal(err.code, 'WALLET_PERMISSION_REJECTED');
      return true;
    }
  );

  // 3. Chain switch rejected by user
  const chainRejectingProvider = createMockProvider({ shouldRejectChainSwitch: true, initialChainIdHex: '0x1' });
  const chainRejectingAdapter = new InjectedWalletAdapter({
    provider: chainRejectingProvider,
  });
  await chainRejectingAdapter.connect();
  await assert.rejects(
    () => chainRejectingAdapter.switchChain(11155111),
    (err) => {
      assert.ok(err instanceof ChainSwitchRejectedError);
      assert.equal(err.code, 'CHAIN_SWITCH_REJECTED');
      return true;
    }
  );
});

test('WalletPaymentManager: Account change invalidates prepared payment immediately', async () => {
  const mockProvider = createMockProvider();
  const adapter = new InjectedWalletAdapter({ provider: mockProvider });
  const manager = new WalletPaymentManager();

  await manager.selectAndConnect(adapter);

  let invalidationReason = null;
  manager.onPreparationInvalidated((reason) => {
    invalidationReason = reason;
  });

  // Prepare payment
  const prepared = manager.preparePayment({
    paymentId: 'pay_123',
    tokenAddress: '0x' + '2'.repeat(40),
    recipientAddress: '0x' + '3'.repeat(40),
    amountUnits: '5000000',
    chainId: 11155111,
  });
  assert.ok(prepared);
  assert.ok(manager.prepared);

  // User changes account in wallet
  mockProvider.triggerAccountsChanged(['0x' + '4'.repeat(40)]);

  assert.equal(manager.prepared, null, 'Prepared payment must be cleared upon account change');
  assert.match(invalidationReason, /Account switched/i);

  // Attempting to execute payment now MUST fail
  await assert.rejects(
    () => manager.executePayment(),
    (err) => {
      assert.ok(err instanceof PaymentPreparationInvalidatedError);
      assert.equal(err.code, 'PREPARATION_INVALIDATED');
      return true;
    }
  );
});

test('WalletPaymentManager: Network/chain change invalidates prepared payment immediately', async () => {
  const mockProvider = createMockProvider();
  const adapter = new InjectedWalletAdapter({ provider: mockProvider });
  const manager = new WalletPaymentManager();

  await manager.selectAndConnect(adapter);

  let invalidationReason = null;
  manager.onPreparationInvalidated((reason) => {
    invalidationReason = reason;
  });

  // Prepare payment on Sepolia (11155111)
  manager.preparePayment({
    paymentId: 'pay_network_test',
    tokenAddress: '0x' + '2'.repeat(40),
    recipientAddress: '0x' + '3'.repeat(40),
    amountUnits: '10000000',
    chainId: 11155111,
  });
  assert.ok(manager.prepared);

  // Network shifts to Mainnet (0x1)
  mockProvider.triggerChainChanged('0x1');

  assert.equal(manager.prepared, null, 'Prepared payment must be cleared upon network change');
  assert.match(invalidationReason, /Network switched/i);

  await assert.rejects(
    () => manager.executePayment(),
    (err) => {
      assert.ok(err instanceof PaymentPreparationInvalidatedError);
      assert.equal(err.code, 'PREPARATION_INVALIDATED');
      return true;
    }
  );
});

test('WalletPaymentManager: Rejects preparing payment on mismatched network', async () => {
  const mockProvider = createMockProvider({ initialChainIdHex: '0x1' }); // Ethereum Mainnet
  const adapter = new InjectedWalletAdapter({ provider: mockProvider });
  const manager = new WalletPaymentManager();

  await manager.selectAndConnect(adapter);

  // Payment demands Polygon (137) while wallet is on Mainnet (1)
  assert.throws(
    () =>
      manager.preparePayment({
        paymentId: 'pay_polygon',
        tokenAddress: '0x' + '2'.repeat(40),
        recipientAddress: '0x' + '3'.repeat(40),
        amountUnits: '10000000',
        chainId: 137,
      }),
    (err) => {
      assert.ok(err instanceof NetworkMismatchError);
      assert.equal(err.code, 'NETWORK_MISMATCH');
      return true;
    }
  );
});

test('WalletPaymentManager: Successfully executes payment when account and network remain stable', async () => {
  const mockProvider = createMockProvider();
  const adapter = new InjectedWalletAdapter({ provider: mockProvider });
  const manager = new WalletPaymentManager();

  await manager.selectAndConnect(adapter);

  manager.preparePayment({
    paymentId: 'pay_valid_tx',
    tokenAddress: '0x' + '2'.repeat(40),
    recipientAddress: '0x' + '3'.repeat(40),
    amountUnits: '15000000',
    chainId: 11155111,
  });

  const txHash = await manager.executePayment();
  assert.equal(txHash, '0x' + '9'.repeat(64));
  assert.equal(manager.prepared, null, 'Preparation is safely consumed after successful execution');
});

test('Capabilities and Support Matrix: Documented matrix and deep links return-to-session', () => {
  const matrix = getWalletSupportMatrix();
  assert.ok(Array.isArray(matrix));
  assert.ok(matrix.length >= 4);
  const mm = matrix.find((w) => w.wallet === 'MetaMask');
  assert.ok(mm.desktopExtension && mm.mobileDeepLink && mm.chainSwitching);

  const links = getMobileDeepLinks('https://pay.example.com/checkout/pay_test_999');
  assert.ok(links.metamask.includes('metamask.app.link/dapp/pay.example.com/checkout/pay_test_999'));
  assert.ok(links.coinbase.includes('go.cb-w.com/dapp'));
  assert.ok(links.trust.includes('trust://open_url'));
});
