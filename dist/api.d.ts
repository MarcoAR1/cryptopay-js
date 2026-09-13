import { GaslessCapabilitiesResponse, GaslessPaymentRequest, GaslessPaymentResponse } from './core/gasless';
export interface PaymentResponse {
    paymentId: string;
    amount: string;
    amountUnits: string;
    currency: 'USDT';
    chainId: number;
    tokenAddress: string;
    paymentAddress: string;
    qrCodeUrl: string;
    status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW';
    txHash?: string;
    expiresAt: string;
    paymentMethod?: 'DIRECT' | 'CONTRACT';
}
export type PaymentStatusResponse = PaymentResponse;
/** Browser-only client. Merchant credentials and payment creation stay on your server. */
export declare class CryptoPayAPI {
    private baseUrl;
    constructor(baseUrl: string);
    getPaymentStatus(paymentId: string, checkoutToken: string, signal?: AbortSignal): Promise<PaymentResponse>;
    getGaslessCapabilities(paymentId: string, checkoutToken: string, signal?: AbortSignal): Promise<GaslessCapabilitiesResponse>;
    submitGaslessPayment(paymentId: string, checkoutToken: string, request: GaslessPaymentRequest, signal?: AbortSignal): Promise<GaslessPaymentResponse>;
}
