import { CheckoutState, CheckoutSessionData, StateListener, HeadlessSessionConfig } from './types';
export interface SessionSnapshot {
    baseUrl: string;
    paymentId: string;
    checkoutToken: string;
    state: CheckoutState;
    data: CheckoutSessionData | null;
    localTxHash?: string;
    timestamp: number;
}
export declare class HeadlessPaymentSession {
    private baseUrl;
    private paymentId;
    private checkoutToken;
    private pollIntervalMs;
    private maxBackoffMs;
    private storageKey;
    private enableVisibilityTracking;
    private callbacks?;
    private state;
    private data;
    private localTxHash?;
    private listeners;
    private pollTimer;
    private abortController;
    private isDestroyed;
    private failureCount;
    private visibilityHandler;
    constructor(config: HeadlessSessionConfig);
    private getStorage;
    private saveSnapshot;
    private loadSnapshot;
    clearSnapshot(): void;
    /**
     * Static helper to recover an existing session from storage without duplicating payment creation.
     */
    static recover(storageKey: string, overrides?: Partial<HeadlessSessionConfig>): HeadlessPaymentSession | null;
    private initVisibilityTracking;
    getState(): CheckoutState;
    getData(): CheckoutSessionData | null;
    getLocalTxHash(): string | undefined;
    subscribe(listener: StateListener): () => void;
    private emitState;
    /**
     * Marks that the wallet adapter is interacting with the user (connecting, approving, signing).
     */
    markWalletPreparing(details?: string): void;
    /**
     * Marks that the payment transaction has been submitted to the blockchain network.
     * INVARIANT: This transitions state to CONFIRMING, NEVER to CONFIRMED.
     * onPaymentConfirmed is only invoked once the authoritative gateway validates finality.
     */
    markTransactionBroadcasted(txHash: string): void;
    /**
     * Validates runtime response integrity against spoofing or cross-tenant leaks.
     */
    private validateResponse;
    fetchStatus(): Promise<CheckoutSessionData>;
    start(): Promise<CheckoutSessionData>;
    private scheduleNextPoll;
    startPolling(customIntervalMs?: number): void;
    stopPolling(): void;
    /**
     * Cancels payment session on server if unbroadcasted.
     * INVARIANT: Reject cancellation if payment is already broadcasted or confirming on-chain.
     */
    cancel(reason?: string): Promise<void>;
    /**
     * Unmounts UI view safely without cancelling on-chain monitoring or aborting in-flight payments.
     */
    unmount(): void;
    /**
     * Completely destroys session and clears all memory references.
     */
    destroy(): void;
}
