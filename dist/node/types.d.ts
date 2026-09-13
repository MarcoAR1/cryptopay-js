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
export type WithdrawalStatus = 'PENDING_RESERVATION' | 'RESERVED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'REJECTED';
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
    status: WithdrawalStatus;
    reservationId?: string;
    txHash?: string;
    nonce?: number;
    blockNumber?: number;
    failureReason?: string;
    createdAt: string;
    updatedAt: string;
}
export type RefundStatus = 'PENDING_AUTHORIZATION' | 'RESERVED' | 'AWAITING_FUNDS' | 'SUBMITTED' | 'EXECUTED' | 'FAILED';
export interface RequestRefundParams {
    amountUnits: string;
    idempotencyKey: string;
    recipientAddress?: string;
    reason?: string;
}
export interface RefundResponse {
    id: string;
    tenantId: string;
    paymentId: string;
    idempotencyKey: string;
    amountUnits: string;
    currency: string;
    chainId?: number;
    tokenAddress?: string;
    recipientAddress: string;
    reason?: string;
    feeUnits: string;
    status: RefundStatus;
    reservationId?: string;
    txHash?: string;
    blockNumber?: number;
    gasUsedUnits?: string;
    gasCostUnits?: string;
    failureReason?: string;
    authorizedBy?: string;
    authorizedAt?: string;
    executedAt?: string;
    createdAt: string;
    updatedAt: string;
}
/**
 * Discriminated types for financial operation lifecycles:
 * Clearly separates an in-flight / requested operation from an on-chain confirmed settlement.
 */
export interface RequestedRefundOperation extends RefundResponse {
    status: 'PENDING_AUTHORIZATION' | 'RESERVED' | 'AWAITING_FUNDS' | 'SUBMITTED';
}
export interface ConfirmedRefundOperation extends RefundResponse {
    status: 'EXECUTED';
    txHash: string;
    executedAt: string;
}
export interface FailedRefundOperation extends RefundResponse {
    status: 'FAILED';
    failureReason: string;
}
export type DiscriminatedRefundOperation = RequestedRefundOperation | ConfirmedRefundOperation | FailedRefundOperation;
export interface RequestedWithdrawalOperation extends WithdrawalResponse {
    status: 'PENDING_RESERVATION' | 'RESERVED' | 'SUBMITTED';
}
export interface ConfirmedWithdrawalOperation extends WithdrawalResponse {
    status: 'CONFIRMED';
    txHash: string;
}
export interface FailedWithdrawalOperation extends WithdrawalResponse {
    status: 'FAILED' | 'REJECTED';
    failureReason: string;
}
export type DiscriminatedWithdrawalOperation = RequestedWithdrawalOperation | ConfirmedWithdrawalOperation | FailedWithdrawalOperation;
export interface RefundQuoteResponse {
    canRefund: boolean;
    reason?: string;
    currency: string;
    grossUnits: string;
    totalRefundedUnits: string;
    remainingRefundableUnits: string;
    availableTreasuryUnits: string;
    immediateSolvency: boolean;
    requiresDirectRecipient: boolean;
    defaultRecipient?: string;
}
export interface TreasuryBalanceResponse {
    id: string;
    tenantId: string;
    chainId: number;
    asset: string;
    currency: string;
    settledBalanceUnits: string;
    reservedBalanceUnits: string;
    availableBalanceUnits: string;
    updatedAt: string;
}
export interface MerchantConfigResponse {
    tenantId: string;
    name: string;
    email: string;
    webhookUrl?: string;
    linkedWalletAddress?: string;
    /** Global platform commission rate set by administrator (read-only for tenant) */
    commissionRate: number;
    enabledPaymentMethods?: string[];
    payoutDestinations?: Record<string, string>;
}
/**
 * Parameters for updating merchant settings.
 * INVARIANT: Tenants can NEVER modify commissionRate.
 */
export interface UpdateMerchantConfigParams {
    webhookUrl?: string;
    linkedWalletAddress?: string;
    enabledPaymentMethods?: ('CONTRACT' | 'DIRECT')[];
    payoutDestinations?: Record<string, string>;
}
export interface ExportReconciliationParams {
    from?: string;
    to?: string;
}
export interface ExportReconciliationResponse {
    csv: string;
    filename: string;
    totalRows: number;
    generatedAt: string;
}
export interface MerchantPaymentItemResponse {
    id: string;
    orderId?: string;
    paymentMethod: 'CONTRACT' | 'DIRECT';
    toAddress: string;
    fromAddress?: string;
    txHash?: string;
    blockNumber?: number;
    currency: string;
    amount: string;
    grossUnits: string;
    netUnits: string;
    feeUnits: string;
    networkGasUnits: string;
    paymentStatus: string;
    settlementStatus: string;
    refundStatus: string;
    webhookStatus: string;
    createdAt: string;
    updatedAt: string;
}
export interface MerchantPaymentDetailResponse {
    payment: MerchantPaymentItemResponse;
    derivationPath?: string;
    walletAddress?: string;
    expiresAt?: string;
    reconciledAt?: string;
    refunds: RefundResponse[];
    ledgerEntries: Array<{
        id: string;
        entryType: string;
        amountUnits: string;
        currency: string;
        referenceType: string;
        referenceId: string;
        txHash?: string;
        createdAt: string;
    }>;
    webhooks: Array<{
        id: string;
        event: string;
        url: string;
        status: string;
        attempts: number;
        maxAttempts: number;
        responseCode?: number;
        responseBody?: string;
        lastAttemptAt?: string;
        createdAt: string;
    }>;
    refundQuote: RefundQuoteResponse;
}
