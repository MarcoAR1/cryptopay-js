export interface ClientConfig {
    apiKey: string;
    baseUrl: string;
    timeoutMs?: number;
    maxRetries?: number;
}
export interface CreatePaymentParams {
    amount: string;
    currency: string;
    orderId?: string;
    chainId?: number;
    paymentMethod?: 'CONTRACT' | 'DIRECT';
    expiresInSeconds?: number;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
}
export interface PaymentResponse {
    paymentId: string;
    id?: string;
    amount: string;
    amountUnits: string;
    currency: string;
    chainId: number;
    tokenAddress: string;
    paymentAddress: string;
    checkoutUrl?: string;
    qrCodeUrl?: string;
    checkoutToken?: string;
    status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW' | 'CANCELLED';
    expiresAt: string;
    txHash?: string;
    createdAt: string;
}
export interface ListPaymentsParams {
    limit?: number;
    offset?: number;
    status?: string;
}
export interface ListPaymentsResponse {
    items: PaymentResponse[];
    total: number;
}
export interface QuoteResponse {
    quoteId: string;
    paymentId: string;
    payerAmountUnits: string;
    tenantAmountUnits: string;
    feeUnits: string;
    networkChargeUnits: string;
    chargeFlags: number;
    expiresAt: string;
}
export interface RequestWithdrawalParams {
    chainId: number;
    asset: string;
    currency: string;
    amountUnits: string;
    destinationAddress: string;
    idempotencyKey?: string;
}
export interface WithdrawalResponse {
    id: string;
    tenantId: string;
    chainId: number;
    asset: string;
    currency: string;
    amountUnits: string;
    estimatedFeeUnits: string;
    destinationAddress: string;
    idempotencyKey: string;
    status: 'PENDING_RESERVATION' | 'RESERVED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'REJECTED';
    reservationId?: string;
    txHash?: string;
    nonce?: number;
    blockNumber?: number;
    failureReason?: string;
    createdAt: string;
    updatedAt: string;
}
