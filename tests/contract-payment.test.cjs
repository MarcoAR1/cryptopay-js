const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePayerRequiredAmount,
  encodePayTokenCalldata,
  encodeErc20Allowance,
  encodeErc20Approve,
  executeContractPayment,
  PayerMismatchError,
  ApprovalRejectedError,
  PaymentRejectedError,
  AmbiguousExecutionError,
  ChainSwitchRejectedError,
  NetworkMismatchError,
} = require('../dist/checkout.cjs');

const mockAuth = {
  tenantId: '0x' + '1'.repeat(64),
  paymentId: '0x' + '2'.repeat(64),
  attemptId: '0x' + '3'.repeat(64),
  quoteId: '0x' + '4'.repeat(64),
  payer: '0x1111111111111111111111111111111111111111',
  asset: '0x2222222222222222222222222222222222222222',
  tenantWallet: '0x3333333333333333333333333333333333333333',
  platformWallet: '0x4444444444444444444444444444444444444444',
  amount: '100000000', // 100 USDT (6 decimals)
  feeAmount: '5000000', // 5 USDT
  networkCharge: '1000000', // 1 USDT
  chargeFlags: 1, // Buyer pays fee (bit 0 set), merchant pays network (bit 1 not set)
  validAfter: 1000,
  deadline: 2000,
  tenantEpoch: 1,
  platformEpoch: 1,
  attemptVersion: 1,
};

const mockGatewaySignature = '0x' + 'aa'.repeat(65);
const mockContractAddress = '0x9999999999999999999999999999999999999999';

function createMockProvider(opts = {}) {
  let activeAccount = opts.account || mockAuth.payer;
  let activeChainId = opts.chainId || 11155111;
  let currentAllowance = opts.allowance !== undefined ? opts.allowance : '0x00';
  const callHistory = [];

  return {
    callHistory,
    request: async ({ method, params }) => {
      callHistory.push({ method, params });

      if (method === 'eth_requestAccounts') {
        if (opts.rejectAccounts) {
          const err = new Error('User rejected accounts');
          err.code = 4001;
          throw err;
        }
        return [activeAccount];
      }

      if (method === 'eth_chainId') {
        return '0x' + activeChainId.toString(16);
      }

      if (method === 'wallet_switchEthereumChain') {
        if (opts.rejectChainSwitch) {
          const err = new Error('User rejected switch');
          err.code = 4001;
          throw err;
        }
        activeChainId = parseInt(params[0].chainId, 16);
        return null;
      }

      if (method === 'eth_call') {
        return currentAllowance;
      }

      if (method === 'eth_sendTransaction') {
        const tx = params[0];
        // Distinguir approve de payToken
        if (tx.data.startsWith('0x095ea7b3')) {
          if (opts.rejectApprove) {
            const err = new Error('User rejected approval');
            err.code = 4001;
            throw err;
          }
          if (tx.data.endsWith('0'.repeat(64))) {
            return '0x_tx_reset_allowance_hash';
          }
          return '0x_tx_approve_hash';
        }

        if (tx.data.startsWith('0xd0a87f5a')) {
          if (opts.rejectPay) {
            const err = new Error('User rejected payment');
            err.code = 4001;
            throw err;
          }
          if (opts.ambiguousPayError) {
            const err = new Error('Gateway timeout waiting for tx response');
            err.code = -32000;
            throw err;
          }
          return '0x_tx_pay_hash';
        }

        // Native ETH payment
        if (tx.value && tx.value !== '0x0') {
          return '0x_tx_native_pay_hash';
        }

        return '0x_generic_tx_hash';
      }

      throw new Error(`Unhandled mock method: ${method}`);
    },
  };
}

test('calculatePayerRequiredAmount computes total including buyer flags', () => {
  // chargeFlags = 1: amount (100) + fee (5) = 105
  const req1 = calculatePayerRequiredAmount(mockAuth);
  assert.equal(req1, 105000000n);

  // chargeFlags = 3: amount (100) + fee (5) + net (1) = 106
  const req3 = calculatePayerRequiredAmount({ ...mockAuth, chargeFlags: 3 });
  assert.equal(req3, 106000000n);

  // chargeFlags = 0: amount (100)
  const req0 = calculatePayerRequiredAmount({ ...mockAuth, chargeFlags: 0 });
  assert.equal(req0, 100000000n);
});

test('encodePayTokenCalldata generates exact ABIv2 payload with selector 0xd0a87f5a', () => {
  const calldata = encodePayTokenCalldata(mockAuth, mockGatewaySignature);

  assert.equal(calldata.slice(0, 10), '0xd0a87f5a');
  // Total length: selector (10 hex) + 22 words * 64 = 1418 chars
  assert.equal(calldata.length, 1418);
  // Word 17 (sigOffset): 0x240 (576 bytes)
  const offsetSlice = calldata.slice(10 + 17 * 64, 10 + 18 * 64);
  assert.equal(offsetSlice.endsWith('240'), true);
});

test('Rejects with PayerMismatchError if active wallet account is not auth.payer', async () => {
  const provider = createMockProvider({
    account: '0x8888888888888888888888888888888888888888', // different from mockAuth.payer
  });

  await assert.rejects(
    () =>
      executeContractPayment(
        {
          authorization: mockAuth,
          gatewaySignature: mockGatewaySignature,
          contractAddress: mockContractAddress,
          chainId: 11155111,
        },
        { provider }
      ),
    PayerMismatchError
  );
});

test('Switches chain if connected network differs from instruction.chainId', async () => {
  const provider = createMockProvider({
    chainId: 1, // Connected to Mainnet instead of Sepolia
  });

  const res = await executeContractPayment(
    {
      authorization: mockAuth,
      gatewaySignature: mockGatewaySignature,
      contractAddress: mockContractAddress,
      chainId: 11155111,
    },
    { provider }
  );

  assert.equal(res.txHash, '0x_tx_pay_hash');
  const switchCall = provider.callHistory.find((c) => c.method === 'wallet_switchEthereumChain');
  assert.ok(switchCall);
  assert.equal(switchCall.params[0].chainId, '0xaa36a7');
});

test('Rejects with ChainSwitchRejectedError if user cancels network switch', async () => {
  const provider = createMockProvider({
    chainId: 1,
    rejectChainSwitch: true,
  });

  await assert.rejects(
    () =>
      executeContractPayment(
        {
          authorization: mockAuth,
          gatewaySignature: mockGatewaySignature,
          contractAddress: mockContractAddress,
          chainId: 11155111,
        },
        { provider }
      ),
    ChainSwitchRejectedError
  );
});

test('Zero allowance triggers approval; approval is NOT announced as payment', async () => {
  const provider = createMockProvider({
    allowance: '0x00',
  });

  const steps = [];
  const res = await executeContractPayment(
    {
      authorization: mockAuth,
      gatewaySignature: mockGatewaySignature,
      contractAddress: mockContractAddress,
      chainId: 11155111,
    },
    {
      provider,
      onStatusUpdate: (u) => steps.push(u.step),
    }
  );

  assert.equal(res.txHash, '0x_tx_pay_hash');
  assert.equal(res.approvalTxHash, '0x_tx_approve_hash');

  // Verify chronological step ordering: APPROVING happens BEFORE PAYING
  assert.deepEqual(steps, [
    'CHECKING_PERMISSIONS',
    'SWITCHING_CHAIN',
    'CHECKING_ALLOWANCE',
    'APPROVING',
    'PAYING',
    'SUCCESS',
  ]);
});

test('Tokens requiring reset (allowance > 0 and < required) execute approve(0) first', async () => {
  const provider = createMockProvider({
    // Existing allowance of 10 USDT, but 105 USDT is required
    allowance: '0x0000000000000000000000000000000000000000000000000000000000989680', // 10,000,000 in hex
  });

  const steps = [];
  const res = await executeContractPayment(
    {
      authorization: mockAuth,
      gatewaySignature: mockGatewaySignature,
      contractAddress: mockContractAddress,
      chainId: 11155111,
    },
    {
      provider,
      onStatusUpdate: (u) => steps.push(u.step),
    }
  );

  assert.equal(res.txHash, '0x_tx_pay_hash');
  assert.deepEqual(steps, [
    'CHECKING_PERMISSIONS',
    'SWITCHING_CHAIN',
    'CHECKING_ALLOWANCE',
    'APPROVING_RESET',
    'APPROVING',
    'PAYING',
    'SUCCESS',
  ]);
});

test('User rejection during approval throws ApprovalRejectedError and never broadcasts payment', async () => {
  const provider = createMockProvider({
    allowance: '0x00',
    rejectApprove: true,
  });

  await assert.rejects(
    () =>
      executeContractPayment(
        {
          authorization: mockAuth,
          gatewaySignature: mockGatewaySignature,
          contractAddress: mockContractAddress,
          chainId: 11155111,
        },
        { provider }
      ),
    ApprovalRejectedError
  );

  // Assert that payToken was never called
  const payCall = provider.callHistory.find(
    (c) => c.method === 'eth_sendTransaction' && c.params[0].data.startsWith('0xd0a87f5a')
  );
  assert.equal(payCall, undefined);
});

test('User rejection during payment throws PaymentRejectedError', async () => {
  const provider = createMockProvider({
    allowance: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    rejectPay: true,
  });

  await assert.rejects(
    () =>
      executeContractPayment(
        {
          authorization: mockAuth,
          gatewaySignature: mockGatewaySignature,
          contractAddress: mockContractAddress,
          chainId: 11155111,
        },
        { provider }
      ),
    PaymentRejectedError
  );
});

test('Ambiguous timeout response throws AmbiguousExecutionError with NO second submission', async () => {
  const provider = createMockProvider({
    allowance: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    ambiguousPayError: true,
  });

  await assert.rejects(
    () =>
      executeContractPayment(
        {
          authorization: mockAuth,
          gatewaySignature: mockGatewaySignature,
          contractAddress: mockContractAddress,
          chainId: 11155111,
        },
        { provider }
      ),
    AmbiguousExecutionError
  );

  // Verify only 1 payment attempt was sent — NO automatic duplicate resubmission
  const payCalls = provider.callHistory.filter(
    (c) => c.method === 'eth_sendTransaction' && c.params[0].data.startsWith('0xd0a87f5a')
  );
  assert.equal(payCalls.length, 1);
});

test('Native ETH payment bypasses ERC-20 approval and sends value', async () => {
  const provider = createMockProvider();

  const steps = [];
  const res = await executeContractPayment(
    {
      authorization: mockAuth,
      gatewaySignature: mockGatewaySignature,
      contractAddress: mockContractAddress,
      chainId: 11155111,
      isNative: true,
    },
    {
      provider,
      onStatusUpdate: (u) => steps.push(u.step),
    }
  );

  assert.equal(res.txHash, '0x_tx_pay_hash');
  assert.equal(res.approvalTxHash, undefined);
  // No approval steps
  assert.equal(steps.includes('APPROVING'), false);
  assert.equal(steps.includes('APPROVING_RESET'), false);

  const payCall = provider.callHistory.find(
    (c) => c.method === 'eth_sendTransaction' && c.params[0].to === mockContractAddress
  );
  assert.ok(payCall);
  assert.equal(payCall.params[0].value, '0x6422c40'); // 105,000,000 in hex (105 USDT equivalent units)
});
