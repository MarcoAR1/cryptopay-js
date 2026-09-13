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
export declare function detectGaslessCapability(options: {
    provider?: EthereumProvider | any;
    tokenAddress?: string;
    chainId: number;
    backendCapabilities: GaslessCapabilitiesResponse;
}): Promise<GaslessCapabilityResult>;
/**
 * Prepares an EIP-2612 Permit typed data message and requests an off-chain signature
 * from the payer using EIP-712 without requiring any ETH for gas.
 */
export declare function prepareGaslessPermit(params: {
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
}): Promise<GaslessPermitSignature>;
/**
 * Submits the signed permit to the CryptoPay gateway relayer for execution.
 */
export declare function submitGaslessPayment(baseUrl: string, paymentId: string, checkoutToken: string, request: GaslessPaymentRequest, signal?: AbortSignal): Promise<GaslessPaymentResponse>;
