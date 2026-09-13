import { EIP1193Provider, WalletAdapter } from './wallet-adapter';
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
export type ContractPaymentStep = 'CHECKING_PERMISSIONS' | 'SWITCHING_CHAIN' | 'CHECKING_ALLOWANCE' | 'APPROVING_RESET' | 'APPROVING' | 'PAYING' | 'SUCCESS' | 'ERROR';
export interface ContractPaymentStatusUpdate {
    step: ContractPaymentStep;
    txHash?: string;
    details?: string;
}
export type ContractPaymentStatusCallback = (update: ContractPaymentStatusUpdate) => void;
export declare function calculatePayerRequiredAmount(auth: PaymentAuthorization): bigint;
export declare function encodeErc20Allowance(owner: string, spender: string): string;
export declare function encodeErc20Approve(spender: string, amount: bigint): string;
export declare function encodePayTokenCalldata(auth: PaymentAuthorization, gatewaySignature: string): string;
export interface ContractPaymentOptions {
    onStatusUpdate?: ContractPaymentStatusCallback;
    provider?: EIP1193Provider;
    adapter?: WalletAdapter;
}
/**
 * Executes an authorized contract payment (CP-036).
 * Manages allowance checking, approval resets, and safe one-time transaction broadcasting.
 */
export declare function executeContractPayment(instruction: ContractPaymentInstruction, options?: ContractPaymentOptions): Promise<{
    txHash: string;
    approvalTxHash?: string;
}>;
