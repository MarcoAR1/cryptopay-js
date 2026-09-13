export type CheckoutState = 'INITIALIZING' | 'AWAITING_PAYMENT' | 'WALLET_PREPARING' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'REVIEW';
export interface CheckoutSessionData {
    paymentId: string;
    amount: string;
    amountUnits: string;
    currency: string;
    chainId: number;
    tokenAddress: string;
    paymentAddress: string;
    qrCodeUrl?: string;
    status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW' | 'CANCELLED';
    expiresAt: string;
    txHash?: string;
}
export type StateListener = (state: CheckoutState, data?: CheckoutSessionData) => void;
export interface SessionCallbacks {
    onStateChange?: (state: CheckoutState, data?: CheckoutSessionData) => void;
    onPaymentConfirmed?: (data: CheckoutSessionData) => void;
    onPaymentFailed?: (data: CheckoutSessionData, error?: Error) => void;
    onExpired?: (data: CheckoutSessionData) => void;
    onCancelled?: (data: CheckoutSessionData) => void;
    onNeedsReview?: (data: CheckoutSessionData) => void;
}
export interface HeadlessSessionConfig {
    baseUrl: string;
    paymentId: string;
    checkoutToken: string;
    pollIntervalMs?: number;
    maxBackoffMs?: number;
    storageKey?: string;
    enableVisibilityTracking?: boolean;
    callbacks?: SessionCallbacks;
}
