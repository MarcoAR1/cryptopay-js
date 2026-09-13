const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Require built bundle
const {
  detectGaslessCapability,
  prepareGaslessPermit,
  submitGaslessPayment,
} = require('../dist/checkout.cjs');

test('Criterion 1: detectGaslessCapability returns canPayGasless: true when chain and backend support it', async () => {
  const provider = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0xaa36a7'; // Sepolia (11155111)
      return null;
    },
  };

  const backendCaps = {
    isSupported: true,
    forwarderAddress: '0x1111111111111111111111111111111111111111',
    tokenAddress: '0x2222222222222222222222222222222222222222',
    tokenName: 'USD Coin',
    tokenVersion: '2',
    chainId: 11155111,
    relayerConfigured: true,
    relayerAvailable: true,
  };

  const res = await detectGaslessCapability({
    provider,
    tokenAddress: backendCaps.tokenAddress,
    chainId: 11155111,
    backendCapabilities: backendCaps,
  });

  assert.equal(res.isSupported, true);
  assert.equal(res.canPayGasless, true);
});

test('Criterion 2: Incompatible network does NOT call wallet_switchEthereumChain automatically', async () => {
  let switchCalls = 0;
  const provider = {
    request: async ({ method }) => {
      if (method === 'wallet_switchEthereumChain') {
        switchCalls++;
        return null;
      }
      if (method === 'eth_chainId') return '0x1'; // Mainnet (1) instead of Sepolia (11155111)
      return null;
    },
  };

  const backendCaps = {
    isSupported: true,
    tokenAddress: '0x2222222222222222222222222222222222222222',
    chainId: 11155111,
    relayerConfigured: true,
    relayerAvailable: true,
  };

  const res = await detectGaslessCapability({
    provider,
    tokenAddress: backendCaps.tokenAddress,
    chainId: 11155111,
    backendCapabilities: backendCaps,
  });

  // INVARIANT: Capability detection must never switch chain automatically
  assert.equal(switchCalls, 0, 'wallet_switchEthereumChain was called automatically!');
  assert.equal(res.isSupported, true);
  assert.equal(res.canPayGasless, false);
  assert.equal(res.needsManualNetworkSwitch, true);
  assert.equal(res.expectedChainId, 11155111);
  assert.equal(res.currentChainId, 1);
  assert.match(res.reason, /direct QR deposit/i);
});

test('Criterion 2: Incompatible backend (e.g. Canonical USDT without permit) gives clear explanation without false promises', async () => {
  const provider = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0x1';
      return null;
    },
  };

  const backendCaps = {
    isSupported: false,
    reason: 'Token does not implement EIP-2612 permit() standard. Direct transfer or QR deposit required.',
    tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chainId: 1,
  };

  const res = await detectGaslessCapability({
    provider,
    tokenAddress: backendCaps.tokenAddress,
    chainId: 1,
    backendCapabilities: backendCaps,
  });

  assert.equal(res.isSupported, false);
  assert.equal(res.canPayGasless, false);
  assert.match(res.reason, /does not implement EIP-2612 permit/);
});

test('prepareGaslessPermit requests EIP-712 typed signature and extracts v, r, s correctly', async () => {
  let requestedTypedData = null;
  const mockPayer = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';
  const mockSpender = '0x1111111111111111111111111111111111111111';
  const mockToken = '0x2222222222222222222222222222222222222222';

  // Sample valid 65-byte signature
  const sampleR = '4355c3c3e11d0c7e0e9ec0b8d7b49d536eee0e57a8cb68d94a506db454f50adc';
  const sampleS = '5b73e073d93f30939ccbe907081386109c4c5ed02660d9435a568496dd1432ac';
  const sampleV = '1b'; // 27
  const fullSig = `0x${sampleR}${sampleS}${sampleV}`;

  const provider = {
    request: async ({ method, params }) => {
      if (method === 'eth_call') {
        // Return uint256 nonce = 0
        return '0x0000000000000000000000000000000000000000000000000000000000000000';
      }
      if (method === 'eth_signTypedData_v4') {
        requestedTypedData = JSON.parse(params[1]);
        return fullSig;
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const permit = await prepareGaslessPermit({
    provider,
    payer: mockPayer,
    spender: mockSpender,
    value: '50000000',
    deadline: 1770000000,
    tokenInfo: {
      name: 'USD Coin',
      version: '2',
      chainId: 11155111,
      verifyingContract: mockToken,
    },
  });

  assert.equal(requestedTypedData.primaryType, 'Permit');
  assert.equal(requestedTypedData.message.owner, mockPayer);
  assert.equal(requestedTypedData.message.spender, mockSpender);
  assert.equal(requestedTypedData.message.value, '50000000');
  assert.equal(requestedTypedData.message.deadline, 1770000000);

  assert.equal(permit.v, 27);
  assert.equal(permit.r, `0x${sampleR}`);
  assert.equal(permit.s, `0x${sampleS}`);
  assert.equal(permit.value, '50000000');
  assert.equal(permit.deadline, 1770000000);
});
