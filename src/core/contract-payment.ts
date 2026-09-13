import {
  EIP1193Provider,
  WalletAdapter
} from './wallet-adapter';
import {
  PayerMismatchError,
  ApprovalRejectedError,
  PaymentRejectedError,
  AmbiguousExecutionError,
  ChainSwitchRejectedError,
  NetworkMismatchError,
  CryptoPayCoreError
} from './errors';

export interface PaymentAuthorization {
  tenantId: string;
  paymentId: string;
  attemptId: string;
  quoteId: string;
  payer: string;
  asset: string;
  tenantWallet: string;
  platformWallet: string;
  amount: string;
  feeAmount: string;
  networkCharge: string;
  chargeFlags: number;
  validAfter: number;
  deadline: number;
  tenantEpoch: number;
  platformEpoch: number;
  attemptVersion: number;
}

export interface ContractPaymentInstruction {
  authorization: PaymentAuthorization;
  gatewaySignature: string;
  contractAddress: string;
  chainId: number;
  isNative?: boolean;
}

export type ContractPaymentStep =
  | 'CHECKING_PERMISSIONS'
  | 'SWITCHING_CHAIN'
  | 'CHECKING_ALLOWANCE'
  | 'APPROVING_RESET'
  | 'APPROVING'
  | 'PAYING'
  | 'SUCCESS'
  | 'ERROR';

export interface ContractPaymentStatusUpdate {
  step: ContractPaymentStep;
  txHash?: string;
  details?: string;
}

export type ContractPaymentStatusCallback = (update: ContractPaymentStatusUpdate) => void;

// ABI helper functions
function padAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new CryptoPayCoreError(`Invalid Ethereum address: ${address}`, 'INVALID_ADDRESS');
  }
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function padBytes32(b32: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(b32)) {
    throw new CryptoPayCoreError(`Invalid bytes32: ${b32}`, 'INVALID_BYTES32');
  }
  return b32.slice(2).toLowerCase().padStart(64, '0');
}

function padUint256(value: bigint | string | number): string {
  const b = BigInt(value);
  if (b < 0n || b >= 2n ** 256n) {
    throw new CryptoPayCoreError(`Value out of range for uint256: ${value}`, 'INVALID_UINT256');
  }
  return b.toString(16).padStart(64, '0');
}

function padUint64(value: bigint | string | number): string {
  const b = BigInt(value);
  if (b < 0n || b >= 2n ** 64n) {
    throw new CryptoPayCoreError(`Value out of range for uint64: ${value}`, 'INVALID_UINT64');
  }
  return b.toString(16).padStart(64, '0');
}

export function calculatePayerRequiredAmount(auth: PaymentAuthorization): bigint {
  const amount = BigInt(auth.amount);
  const feeAmount = BigInt(auth.feeAmount);
  const networkCharge = BigInt(auth.networkCharge);

  const feePaidByBuyer = (auth.chargeFlags & 1) !== 0;
  const netPaidByBuyer = (auth.chargeFlags & 2) !== 0;

  return amount + (feePaidByBuyer ? feeAmount : 0n) + (netPaidByBuyer ? networkCharge : 0n);
}

export function encodeErc20Allowance(owner: string, spender: string): string {
  // allowance(address,address) => 0xdd62ed3e
  return '0xdd62ed3e' + padAddress(owner) + padAddress(spender);
}

export function encodeErc20Approve(spender: string, amount: bigint): string {
  // approve(address,uint256) => 0x095ea7b3
  return '0x095ea7b3' + padAddress(spender) + padUint256(amount);
}

export function encodePayTokenCalldata(auth: PaymentAuthorization, gatewaySignature: string): string {
  // payToken((bytes32,bytes32,bytes32,bytes32,address,address,address,address,uint256,uint256,uint256,uint8,uint64,uint64,uint64,uint64,uint64),bytes)
  // selector = 0xd0a87f5a
  const selector = '0xd0a87f5a';

  // 17 static words for PaymentAuthorization struct
  const words: string[] = [
    padBytes32(auth.tenantId),
    padBytes32(auth.paymentId),
    padBytes32(auth.attemptId),
    padBytes32(auth.quoteId),
    padAddress(auth.payer),
    padAddress(auth.asset),
    padAddress(auth.tenantWallet),
    padAddress(auth.platformWallet),
    padUint256(auth.amount),
    padUint256(auth.feeAmount),
    padUint256(auth.networkCharge),
    padUint256(auth.chargeFlags), // uint8 padded to 32 bytes
    padUint64(auth.validAfter),
    padUint64(auth.deadline),
    padUint64(auth.tenantEpoch),
    padUint64(auth.platformEpoch),
    padUint64(auth.attemptVersion),
  ];

  // Offset for second dynamic argument (gatewaySignature)
  // 18 words * 32 bytes = 576 bytes = 0x240
  const sigOffset = (18 * 32).toString(16).padStart(64, '0');
  words.push(sigOffset);

  // Parse signature bytes
  const cleanSig = gatewaySignature.startsWith('0x') ? gatewaySignature.slice(2) : gatewaySignature;
  if (cleanSig.length === 0 || cleanSig.length % 2 !== 0) {
    throw new CryptoPayCoreError('Invalid gatewaySignature hex string', 'INVALID_SIGNATURE');
  }

  const sigByteLength = cleanSig.length / 2;
  words.push(sigByteLength.toString(16).padStart(64, '0'));

  // Append signature payload padded to 32-byte chunks (64 hex characters)
  const remainder = cleanSig.length % 64;
  const paddedSig = remainder === 0 ? cleanSig : cleanSig + '0'.repeat(64 - remainder);

  for (let i = 0; i < paddedSig.length; i += 64) {
    words.push(paddedSig.slice(i, i + 64).toLowerCase());
  }

  return selector + words.join('');
}

export interface ContractPaymentOptions {
  onStatusUpdate?: ContractPaymentStatusCallback;
  provider?: EIP1193Provider;
  adapter?: WalletAdapter;
}

/**
 * Executes an authorized contract payment (CP-036).
 * Manages allowance checking, approval resets, and safe one-time transaction broadcasting.
 */
export async function executeContractPayment(
  instruction: ContractPaymentInstruction,
  options: ContractPaymentOptions = {}
): Promise<{ txHash: string; approvalTxHash?: string }> {
  const provider = options.provider || options.adapter?.getProvider();
  if (!provider) {
    throw new CryptoPayCoreError('No EIP-1193 provider available for contract payment', 'NO_PROVIDER');
  }

  const { onStatusUpdate } = options;
  const { authorization: auth, gatewaySignature, contractAddress, chainId, isNative } = instruction;

  // 1. Verificar cuentas y permisos
  onStatusUpdate?.({ step: 'CHECKING_PERMISSIONS', details: 'Checking connected wallet account' });
  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0 || !accounts[0]) {
    throw new CryptoPayCoreError('No account selected in wallet', 'NO_ACCOUNT');
  }

  const activeAccount = accounts[0].toLowerCase();
  const expectedPayer = auth.payer.toLowerCase();
  if (activeAccount !== expectedPayer) {
    throw new PayerMismatchError(auth.payer, accounts[0]);
  }

  // 2. Verificar red y switch si es necesario
  onStatusUpdate?.({ step: 'SWITCHING_CHAIN', details: `Verifying chain ID ${chainId}` });
  const currentChainHex: string = await provider.request({ method: 'eth_chainId' });
  const currentChainId = parseInt(currentChainHex, 16);

  if (currentChainId !== chainId) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + chainId.toString(16) }],
      });
    } catch (switchError: any) {
      if (switchError?.code === 4001 || switchError?.message?.includes('rejected')) {
        throw new ChainSwitchRejectedError(chainId);
      }
      throw new NetworkMismatchError(chainId, currentChainId);
    }

    const postSwitchChainHex: string = await provider.request({ method: 'eth_chainId' });
    if (parseInt(postSwitchChainHex, 16) !== chainId) {
      throw new NetworkMismatchError(chainId, parseInt(postSwitchChainHex, 16));
    }
  }

  const requiredAmount = calculatePayerRequiredAmount(auth);
  let approvalTxHash: string | undefined;

  // 3. Manejo de tokens ERC-20 (Allowance y Aprobación)
  if (!isNative && auth.asset !== '0x0000000000000000000000000000000000000000') {
    onStatusUpdate?.({ step: 'CHECKING_ALLOWANCE', details: 'Checking current ERC-20 token allowance' });

    let currentAllowance = 0n;
    try {
      const allowanceData = encodeErc20Allowance(auth.payer, contractAddress);
      const allowanceResult: string = await provider.request({
        method: 'eth_call',
        params: [{ to: auth.asset, data: allowanceData }, 'latest'],
      });
      if (allowanceResult && allowanceResult !== '0x') {
        currentAllowance = BigInt(allowanceResult);
      }
    } catch (err: any) {
      // Si falla eth_call (ej. red privada o mock estricto), asumimos allowance 0 para forzar aprobación segura
      currentAllowance = 0n;
    }

    if (currentAllowance < requiredAmount) {
      // Manejo de tokens que requieren reset si allowance > 0 (ej. USDT mainnet)
      if (currentAllowance > 0n) {
        onStatusUpdate?.({
          step: 'APPROVING_RESET',
          details: 'Resetting existing token allowance to zero to prevent reversal',
        });
        try {
          const resetData = encodeErc20Approve(contractAddress, 0n);
          await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: auth.payer, to: auth.asset, data: resetData }],
          });
        } catch (resetErr: any) {
          if (resetErr?.code === 4001 || resetErr?.message?.includes('rejected')) {
            throw new ApprovalRejectedError('User rejected token allowance reset');
          }
          throw new ApprovalRejectedError(`Allowance reset failed: ${resetErr?.message || resetErr}`);
        }
      }

      // Enviar aprobación exacta requerida
      onStatusUpdate?.({
        step: 'APPROVING',
        details: `Requesting approval for ${requiredAmount.toString()} units (Approval is NOT payment)`,
      });

      try {
        const approveData = encodeErc20Approve(contractAddress, requiredAmount);
        approvalTxHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{ from: auth.payer, to: auth.asset, data: approveData }],
        });
      } catch (approveErr: any) {
        if (approveErr?.code === 4001 || approveErr?.message?.includes('rejected')) {
          throw new ApprovalRejectedError('User rejected token approval');
        }
        throw new ApprovalRejectedError(`Token approval failed: ${approveErr?.message || approveErr}`);
      }
    }
  }

  // 4. Enviar pago mediante ABI fija de CryptoPay (payToken)
  onStatusUpdate?.({ step: 'PAYING', details: 'Broadcasting contract payment transaction' });

  const calldata = encodePayTokenCalldata(auth, gatewaySignature);
  const txParams: any = {
    from: auth.payer,
    to: contractAddress,
    data: calldata,
  };

  if (isNative || auth.asset === '0x0000000000000000000000000000000000000000') {
    txParams.value = '0x' + requiredAmount.toString(16);
  }

  let txHash: string;
  try {
    txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });
  } catch (payErr: any) {
    if (payErr?.code === 4001 || payErr?.message?.includes('rejected')) {
      throw new PaymentRejectedError('User rejected contract payment transaction');
    }

    // Invariante: Si la respuesta es ambigua (timeout o error desconocido tras broadcast),
    // no se realiza un segundo envío automático bajo ninguna circunstancia.
    if (payErr?.message?.includes('timeout') || payErr?.code === -32000) {
      throw new AmbiguousExecutionError(
        `Transaction submission resulted in ambiguous state: ${payErr.message}. Automatic resubmission blocked to avoid double-spend.`
      );
    }

    throw new CryptoPayCoreError(`Contract payment failed: ${payErr?.message || payErr}`, 'PAYMENT_FAILED');
  }

  onStatusUpdate?.({ step: 'SUCCESS', txHash, details: 'Payment broadcasted successfully' });

  return {
    txHash,
    approvalTxHash,
  };
}
