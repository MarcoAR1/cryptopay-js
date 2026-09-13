import { CheckoutState, CheckoutSessionData, StateListener, HeadlessSessionConfig } from './types';
export declare class HeadlessPaymentSession {
    private baseUrl;
    private paymentId;
    private checkoutToken;
    private pollIntervalMs;
    private state;
    private data;
    private listeners;
    private pollTimer;
    private abortController;
    private isDestroyed;
    constructor(config: HeadlessSessionConfig);
    getState(): CheckoutState;
    getData(): CheckoutSessionData | null;
    subscribe(listener: StateListener): () => void;
    private emitState;
    /**
     * Validates runtime response integrity against spoofing or cross-tenant leaks.
     */
    private validateResponse;
    fetchStatus(): Promise<CheckoutSessionData>;
    start(): Promise<CheckoutSessionData>;
    startPolling(): void;
    stopPolling(): void;
    cancel(reason?: string): Promise<void>;
    destroy(): void;
}
