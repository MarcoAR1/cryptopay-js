import { EthereumProvider } from '../wallet';

export interface GaslessCapabilitiesResponse {
  isSupported: boolean;
  reason?: string;
  tokenAddress?: string;
  forwarderAddress?: string;
  tokenName?: string;
  tokenVersion?: string;
  chainId?: number;
  relayerConfigured?: boolean;
  relayerAvailable?: boolean;
}

export interface GaslessPermitSignature {
  v: number;
  r: string;
  s: string;
  deadline: number;
  value: string;
}

export interface GaslessPaymentRequest {
  payerAddress: string;
  permit: GaslessPermitSignature;
}

export interface GaslessPaymentResponse {
  success: boolean;
  paymentId: string;
  txHash: string;
  status: string;
  sponsorshipStatus: string;
  operationId?: string;
  error?: string;
}

export interface GaslessCapabilityResult {
  isSupported: boolean;
  canPayGasless: boolean;
  reason?: string;
  needsManualNetworkSwitch?: boolean;
  expectedChainId?: number;
  currentChainId?: number;
}

/**
 * Checks whether gasless payment is possible with the given wallet and backend capabilities.
 * INVARIANT (Criterion 2): Capability detection NEVER invokes wallet_switchEthereumChain automatically.
 * Incompatible wallets/configurations receive a clear explanation and are guided to DIRECT/QR deposit.
 */
export async function detectGaslessCapability(options: {
  provider?: EthereumProvider | any;
  tokenAddress?: string;
  chainId: number;
  backendCapabilities: GaslessCapabilitiesResponse;
}): Promise<GaslessCapabilityResult> {
  const { provider, chainId, backendCapabilities } = options;

  if (!backendCapabilities.isSupported) {
    return {
      isSupported: false,
      canPayGasless: false,
      reason: backendCapabilities.reason || 'Token or network configuration does not support gasless sponsorship.',
    };
  }

  if (!provider) {
    return {
      isSupported: true,
      canPayGasless: false,
      reason: 'No Web3 wallet detected. Please connect a compatible wallet or pay via direct QR deposit.',
    };
  }

  let currentChainId: number | null = null;
  try {
    const hexChain = await provider.request({ method: 'eth_chainId' });
    currentChainId = typeof hexChain === 'string' ? parseInt(hexChain, 16) : Number(hexChain);
  } catch {
    return {
      isSupported: true,
      canPayGasless: false,
      reason: 'Unable to inspect wallet network. Please pay via direct QR deposit.',
    };
  }

  if (currentChainId !== null && currentChainId !== chainId) {
    return {
      isSupported: true,
      canPayGasless: false,
      needsManualNetworkSwitch: true,
      expectedChainId: chainId,
      currentChainId,
      reason: `Wallet is connected to network (${currentChainId}). Payment requires network (${chainId}). Please switch network manually or pay via direct QR deposit.`,
    };
  }

  return {
    isSupported: true,
    canPayGasless: true,
  };
}

/**
 * Prepares an EIP-2612 Permit typed data message and requests an off-chain signature
 * from the payer using EIP-712 without requiring any ETH for gas.
 */
export async function prepareGaslessPermit(params: {
  provider: EthereumProvider | any;
  payer: string;
  spender: string;
  value: string;
  deadline?: number;
  tokenInfo: {
    name: string;
    version?: string;
    chainId: number;
    verifyingContract: string;
  };
}): Promise<GaslessPermitSignature> {
  const deadline = params.deadline || Math.floor(Date.now() / 1000) + 3600; // 1 hour

  // Fetch current nonces for payer from ERC20Permit contract
  let nonce = 0n;
  try {
    const cleanPayer = params.payer.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const nonceHex = await params.provider.request({
      method: 'eth_call',
      params: [
        {
          to: params.tokenInfo.verifyingContract,
          data: '0x7ecebe00' + cleanPayer, // nonces(address) selector
        },
        'latest',
      ],
    });
    if (nonceHex && nonceHex !== '0x') {
      nonce = BigInt(nonceHex);
    }
  } catch {
    // Nonce query fallback to 0n if provider mock or network call reverts
    nonce = 0n;
  }

  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    domain: {
      name: params.tokenInfo.name,
      version: params.tokenInfo.version || '1',
      chainId: params.tokenInfo.chainId,
      verifyingContract: params.tokenInfo.verifyingContract,
    },
    message: {
      owner: params.payer,
      spender: params.spender,
      value: params.value,
      nonce: Number(nonce),
      deadline,
    },
  };

  const sig = await params.provider.request({
    method: 'eth_signTypedData_v4',
    params: [params.payer, JSON.stringify(typedData)],
  });

  if (typeof sig !== 'string' || sig.length < 130) {
    throw new Error('Invalid signature returned by wallet');
  }

  const cleanSig = sig.startsWith('0x') ? sig.slice(2) : sig;
  const r = '0x' + cleanSig.substring(0, 64);
  const s = '0x' + cleanSig.substring(64, 128);
  let v = parseInt(cleanSig.substring(128, 130), 16);
  if (v < 27) v += 27;

  return {
    v,
    r,
    s,
    deadline,
    value: params.value,
  };
}

/**
 * Submits the signed permit to the CryptoPay gateway relayer for execution.
 */
export async function submitGaslessPayment(
  baseUrl: string,
  paymentId: string,
  checkoutToken: string,
  request: GaslessPaymentRequest,
  signal?: AbortSignal
): Promise<GaslessPaymentResponse> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${cleanBase}/v1/checkout/${encodeURIComponent(paymentId)}/gasless-pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${checkoutToken}`,
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Gasless payment submission failed (${res.status})`);
  }

  return res.json();
}
