import {
  CheckoutState,
  CheckoutSessionData,
  StateListener,
  HeadlessSessionConfig,
} from './types';
import {
  InvalidResponseError,
  SessionExpiredError,
  SessionCancelledError,
} from './errors';

export class HeadlessPaymentSession {
  private baseUrl: string;
  private paymentId: string;
  private checkoutToken: string;
  private pollIntervalMs: number;

  private state: CheckoutState = 'INITIALIZING';
  private data: CheckoutSessionData | null = null;
  private listeners: Set<StateListener> = new Set();
  private pollTimer: any = null;
  private abortController: AbortController | null = null;
  private isDestroyed = false;

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
  }

  getState(): CheckoutState {
    return this.state;
  }

  getData(): CheckoutSessionData | null {
    return this.data;
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
    for (const listener of this.listeners) {
      try {
        listener(this.state, this.data || undefined);
      } catch (err) {
        // Prevent listener errors from breaking execution
      }
    }
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

    // Compute updated state based on response
    if (validated.status === 'CONFIRMED') {
      this.emitState('CONFIRMED', validated);
      this.stopPolling();
    } else if (validated.status === 'FAILED') {
      this.emitState('FAILED', validated);
      this.stopPolling();
    } else if (validated.status === 'CANCELLED') {
      this.emitState('CANCELLED', validated);
      this.stopPolling();
    } else if (validated.status === 'PENDING') {
      const isExpired = new Date(validated.expiresAt).getTime() <= Date.now();
      if (isExpired) {
        this.emitState('EXPIRED', validated);
        this.stopPolling();
      } else {
        this.emitState('AWAITING_PAYMENT', validated);
      }
    }

    return validated;
  }

  async start(): Promise<CheckoutSessionData> {
    const data = await this.fetchStatus();
    if (this.state === 'AWAITING_PAYMENT') {
      this.startPolling();
    }
    return data;
  }

  startPolling(): void {
    if (this.pollTimer || this.isDestroyed) return;
    this.pollTimer = setInterval(async () => {
      try {
        await this.fetchStatus();
      } catch (err) {
        // Network glitches during polling do not crash session
      }
    }, this.pollIntervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async cancel(reason?: string): Promise<void> {
    if (this.isDestroyed) throw new Error('Session is destroyed');

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
    this.emitState('CANCELLED');
    if (!response.ok) {
      // Even if server call fails or endpoint requires merchant key, state is updated locally
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stopPolling();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.listeners.clear();
  }
}
