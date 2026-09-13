import {
  CheckoutState,
  CheckoutSessionData,
  StateListener,
  HeadlessSessionConfig,
  SessionCallbacks,
} from './types';
import {
  InvalidResponseError,
  SessionExpiredError,
  SessionCancelledError,
  CryptoPayCoreError,
} from './errors';

export interface SessionSnapshot {
  baseUrl: string;
  paymentId: string;
  checkoutToken: string;
  state: CheckoutState;
  data: CheckoutSessionData | null;
  localTxHash?: string;
  timestamp: number;
}

export class HeadlessPaymentSession {
  private baseUrl: string;
  private paymentId: string;
  private checkoutToken: string;
  private pollIntervalMs: number;
  private maxBackoffMs: number;
  private storageKey: string;
  private enableVisibilityTracking: boolean;
  private callbacks?: SessionCallbacks;

  private state: CheckoutState = 'INITIALIZING';
  private data: CheckoutSessionData | null = null;
  private localTxHash?: string;
  private listeners: Set<StateListener> = new Set();
  private pollTimer: any = null;
  private abortController: AbortController | null = null;
  private isDestroyed = false;
  private failureCount = 0;
  private visibilityHandler: (() => void) | null = null;

  constructor(config: HeadlessSessionConfig) {
    if (!config.baseUrl) throw new Error('baseUrl is required');
    if (!config.paymentId) throw new Error('paymentId is required');
    if (!config.checkoutToken) throw new Error('checkoutToken is required');

    const url = new URL(config.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Invalid gateway URL');
    }

    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.paymentId = config.paymentId;
    this.checkoutToken = config.checkoutToken;
    this.pollIntervalMs = config.pollIntervalMs || 3000;
    this.maxBackoffMs = config.maxBackoffMs || 30000;
    this.storageKey = config.storageKey || `cryptopay_session_${config.paymentId}`;
    this.enableVisibilityTracking = config.enableVisibilityTracking !== false;
    this.callbacks = config.callbacks;

    this.initVisibilityTracking();
    this.loadSnapshot();
  }

  // --- Snapshot and Storage Recovery ---

  private getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    return null;
  }

  private saveSnapshot(): void {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      const snapshot: SessionSnapshot = {
        baseUrl: this.baseUrl,
        paymentId: this.paymentId,
        checkoutToken: this.checkoutToken,
        state: this.state,
        data: this.data,
        localTxHash: this.localTxHash,
        timestamp: Date.now(),
      };
      storage.setItem(this.storageKey, JSON.stringify(snapshot));
    } catch {}
  }

  private loadSnapshot(): void {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) return;
      const snapshot: SessionSnapshot = JSON.parse(raw);
      if (snapshot.paymentId === this.paymentId) {
        if (snapshot.state) this.state = snapshot.state;
        if (snapshot.data) this.data = snapshot.data;
        if (snapshot.localTxHash) {
          this.localTxHash = snapshot.localTxHash;
          if (this.data && !this.data.txHash) {
            this.data.txHash = snapshot.localTxHash;
          }
        }
      }
    } catch {}
  }

  public clearSnapshot(): void {
    const storage = this.getStorage();
    if (storage) {
      try {
        storage.removeItem(this.storageKey);
      } catch {}
    }
  }

  /**
   * Static helper to recover an existing session from storage without duplicating payment creation.
   */
  public static recover(storageKey: string, overrides: Partial<HeadlessSessionConfig> = {}): HeadlessPaymentSession | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const snapshot: SessionSnapshot = JSON.parse(raw);
      return new HeadlessPaymentSession({
        baseUrl: snapshot.baseUrl,
        paymentId: snapshot.paymentId,
        checkoutToken: snapshot.checkoutToken,
        storageKey,
        ...overrides,
      });
    } catch {
      return null;
    }
  }

  // --- Visibility Tracking ---

  private initVisibilityTracking(): void {
    if (!this.enableVisibilityTracking || typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      if (this.isDestroyed) return;
      if (document.visibilityState === 'visible') {
        // Tab brought to foreground: immediately trigger fresh status query and reset polling
        this.fetchStatus().catch(() => {});
        if (this.pollTimer && this.state !== 'CONFIRMED' && this.state !== 'FAILED' && this.state !== 'EXPIRED' && this.state !== 'CANCELLED') {
          this.stopPolling();
          this.startPolling();
        }
      } else if (document.visibilityState === 'hidden') {
        // Tab backgrounded: switch to relaxed backoff polling
        this.stopPolling();
        this.scheduleNextPoll(this.maxBackoffMs);
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  // --- State Access & Listeners ---

  getState(): CheckoutState {
    return this.state;
  }

  getData(): CheckoutSessionData | null {
    return this.data;
  }

  getLocalTxHash(): string | undefined {
    return this.localTxHash;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state to new subscriber
    listener(this.state, this.data || undefined);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(newState: CheckoutState, newData?: CheckoutSessionData): void {
    if (this.isDestroyed) return;
    this.state = newState;
    if (newData) this.data = newData;

    this.saveSnapshot();

    // Callbacks
    this.callbacks?.onStateChange?.(this.state, this.data || undefined);
    if (newState === 'CONFIRMED' && this.data) {
      this.callbacks?.onPaymentConfirmed?.(this.data);
    } else if (newState === 'FAILED' && this.data) {
      this.callbacks?.onPaymentFailed?.(this.data);
    } else if (newState === 'EXPIRED' && this.data) {
      this.callbacks?.onExpired?.(this.data);
    } else if (newState === 'CANCELLED' && this.data) {
      this.callbacks?.onCancelled?.(this.data);
    } else if (newState === 'REVIEW' && this.data) {
      this.callbacks?.onNeedsReview?.(this.data);
    }

    for (const listener of this.listeners) {
      try {
        listener(this.state, this.data || undefined);
      } catch (err) {
        // Prevent listener errors from breaking execution
      }
    }
  }

  // --- UI Workflow Transitions ---

  /**
   * Marks that the wallet adapter is interacting with the user (connecting, approving, signing).
   */
  markWalletPreparing(details?: string): void {
    if (this.isDestroyed || this.state === 'CONFIRMED' || this.state === 'CONFIRMING') return;
    this.emitState('WALLET_PREPARING', this.data || undefined);
  }

  /**
   * Marks that the payment transaction has been submitted to the blockchain network.
   * INVARIANT: This transitions state to CONFIRMING, NEVER to CONFIRMED.
   * onPaymentConfirmed is only invoked once the authoritative gateway validates finality.
   */
  markTransactionBroadcasted(txHash: string): void {
    if (this.isDestroyed) return;
    this.localTxHash = txHash;
    if (this.data) {
      this.data = { ...this.data, txHash };
    }
    this.emitState('CONFIRMING', this.data || undefined);

    // Speed up polling to detect confirmation quickly
    this.stopPolling();
    this.startPolling(2000);
  }

  /**
   * Validates runtime response integrity against spoofing or cross-tenant leaks.
   */
  private validateResponse(raw: any): CheckoutSessionData {
    if (!raw || typeof raw !== 'object') {
      throw new InvalidResponseError('Response is not an object');
    }
    if (raw.paymentId !== this.paymentId) {
      throw new InvalidResponseError(
        `paymentId mismatch in response: expected ${this.paymentId}, got ${raw.paymentId}`
      );
    }
    if (!raw.amount || !raw.amountUnits || !raw.currency) {
      throw new InvalidResponseError('Missing required payment monetary fields');
    }
    if (!raw.paymentAddress || !raw.chainId) {
      throw new InvalidResponseError('Missing payment routing fields (paymentAddress / chainId)');
    }
    if (!raw.status) {
      throw new InvalidResponseError('Missing status in response');
    }

    return raw as CheckoutSessionData;
  }

  async fetchStatus(): Promise<CheckoutSessionData> {
    if (this.isDestroyed) {
      throw new Error('HeadlessPaymentSession is destroyed');
    }

    this.abortController = new AbortController();

    try {
      const response = await fetch(
        `${this.baseUrl}/v1/checkout/${encodeURIComponent(this.paymentId)}`,
        {
          headers: {
            Authorization: `Bearer ${this.checkoutToken}`,
          },
          signal: this.abortController.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch payment session (${response.status})`);
      }

      const json = await response.json();
      const validated = this.validateResponse(json);
      if (this.localTxHash && !validated.txHash) {
        validated.txHash = this.localTxHash;
      }
      this.failureCount = 0; // Reset consecutive failures on success

      // Compute updated state based on authoritative gateway response
      if (validated.status === 'CONFIRMED') {
        this.emitState('CONFIRMED', validated);
        this.stopPolling();
      } else if (validated.status === 'FAILED') {
        this.emitState('FAILED', validated);
        this.stopPolling();
      } else if (validated.status === 'REVIEW') {
        this.emitState('REVIEW', validated);
        this.stopPolling();
      } else if (validated.status === 'CANCELLED') {
        this.emitState('CANCELLED', validated);
        this.stopPolling();
      } else if (validated.status === 'PENDING') {
        const isExpired = new Date(validated.expiresAt).getTime() <= Date.now();
        if (isExpired) {
          this.emitState('EXPIRED', validated);
          this.stopPolling();
        } else if (this.state === 'CONFIRMING') {
          // Keep CONFIRMING if we already have local txHash awaiting finality
          this.data = validated;
          this.saveSnapshot();
        } else if (this.state !== 'WALLET_PREPARING') {
          this.emitState('AWAITING_PAYMENT', validated);
        }
      }

      return validated;
    } catch (err) {
      this.failureCount++;
      throw err;
    }
  }

  async start(): Promise<CheckoutSessionData> {
    const data = await this.fetchStatus();
    if (this.state === 'AWAITING_PAYMENT' || this.state === 'CONFIRMING' || this.state === 'WALLET_PREPARING') {
      this.startPolling();
    }
    return data;
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.pollTimer || this.isDestroyed) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      if (this.isDestroyed) return;

      try {
        await this.fetchStatus();
      } catch (err) {
        // Network errors during polling apply exponential backoff
      }

      if (!this.isDestroyed && (this.state === 'AWAITING_PAYMENT' || this.state === 'CONFIRMING' || this.state === 'WALLET_PREPARING')) {
        const nextDelay = Math.min(
          this.pollIntervalMs * Math.pow(1.5, this.failureCount),
          this.maxBackoffMs
        );
        this.scheduleNextPoll(nextDelay);
      }
    }, delayMs);
  }

  startPolling(customIntervalMs?: number): void {
    this.stopPolling();
    if (this.isDestroyed) return;
    const interval = customIntervalMs || this.pollIntervalMs;
    this.scheduleNextPoll(interval);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Cancels payment session on server if unbroadcasted.
   * INVARIANT: Reject cancellation if payment is already broadcasted or confirming on-chain.
   */
  async cancel(reason?: string): Promise<void> {
    if (this.isDestroyed) throw new Error('Session is destroyed');

    if (this.state === 'CONFIRMING' || this.state === 'CONFIRMED' || this.localTxHash) {
      throw new CryptoPayCoreError(
        'Cannot cancel payment: transaction was already broadcasted on-chain. Closing UI does not abort on-chain processing.',
        'CANNOT_CANCEL_BROADCASTED'
      );
    }

    const response = await fetch(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(this.paymentId)}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.checkoutToken}`,
        },
        body: JSON.stringify({ reason }),
      }
    );

    this.stopPolling();
    this.clearSnapshot();
    this.emitState('CANCELLED');
    if (!response.ok) {
      // Even if server call fails, state is updated locally
    }
  }

  /**
   * Unmounts UI view safely without cancelling on-chain monitoring or aborting in-flight payments.
   */
  unmount(): void {
    this.stopPolling();
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    // Snapshot is intentionally PRESERVED so remount / page reload can recover the session
  }

  /**
   * Completely destroys session and clears all memory references.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.unmount();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.listeners.clear();
  }
}
