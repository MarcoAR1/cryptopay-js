import {
  ClientConfig,
  CreatePaymentParams,
  PaymentResponse,
  ListPaymentsParams,
  ListPaymentsResponse,
  QuoteResponse,
  RequestWithdrawalParams,
  WithdrawalResponse,
  RequestRefundParams,
  RefundResponse,
  RefundQuoteResponse,
  TreasuryBalanceResponse,
  MerchantConfigResponse,
  UpdateMerchantConfigParams,
  ExportReconciliationParams,
  ExportReconciliationResponse,
  MerchantPaymentDetailResponse,
} from './types';
import {
  CryptoPayNodeError,
  AuthenticationError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  TimeoutError,
  AmbiguousTimeoutError,
  ServerError,
} from './errors';

export class CryptoPayNodeClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(config: ClientConfig) {
    if (!config.apiKey) throw new Error('apiKey is required');
    if (!config.baseUrl) throw new Error('baseUrl is required');

    const url = new URL(config.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Invalid gateway URL');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs || 15000;
    this.maxRetries = config.maxRetries ?? 2;
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'req_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: {
      body?: any;
      idempotencyKey?: string;
      query?: Record<string, any>;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const requestId = this.generateId();
    const idempotencyKey =
      method === 'POST' ? options.idempotencyKey || this.generateId() : undefined;

    let urlString = `${this.baseUrl}${path}`;
    if (options.query) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) sp.append(k, String(v));
      }
      const qs = sp.toString();
      if (qs) urlString += `?${qs}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'X-Request-Id': requestId,
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    let attempts = 0;
    const maxAttempts = method === 'GET' ? this.maxRetries + 1 : 1; // Never automatically retry non-idempotent without caller intent

    while (attempts < maxAttempts) {
      attempts++;
      const controller = new AbortController();
      let timeoutHandle: any = null;

      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort());
      }

      timeoutHandle = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const response = await fetch(urlString, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);

        const responseRequestId = response.headers.get('x-request-id') || requestId;

        if (!response.ok) {
          let errorBody: any = null;
          try {
            errorBody = await response.json();
          } catch {
            // body may not be JSON
          }

          const message = errorBody?.message || errorBody?.error || `Request failed with status ${response.status}`;

          if (response.status === 401) {
            throw new AuthenticationError(message, responseRequestId, 401);
          }
          if (response.status === 403) {
            throw new ForbiddenError(message, responseRequestId);
          }
          if (response.status === 409) {
            throw new ConflictError(message, responseRequestId);
          }
          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('retry-after');
            const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) || 60 : 60;
            throw new RateLimitError(message, retryAfter, responseRequestId);
          }
          if (response.status >= 500) {
            if (attempts < maxAttempts) {
              await new Promise((r) => setTimeout(r, 200 * attempts));
              continue;
            }
            throw new ServerError(message, response.status, responseRequestId);
          }

          throw new CryptoPayNodeError(message, 'CLIENT_ERROR', response.status, responseRequestId, errorBody);
        }

        return (await response.json()) as T;
      } catch (err: any) {
        clearTimeout(timeoutHandle);

        if (err instanceof CryptoPayNodeError) {
          throw err;
        }

        if (err.name === 'AbortError' || controller.signal.aborted) {
          if (method === 'POST' && idempotencyKey) {
            throw new AmbiguousTimeoutError(idempotencyKey);
          }
          throw new TimeoutError('Request timed out before receiving gateway response', requestId);
        }

        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 200 * attempts));
          continue;
        }

        throw new CryptoPayNodeError(
          err.message || 'Network connection failed',
          'NETWORK_ERROR',
          undefined,
          requestId
        );
      }
    }

    throw new CryptoPayNodeError('Max request attempts exceeded', 'RETRY_EXHAUSTED', undefined, requestId);
  }

  async createPayment(params: CreatePaymentParams, signal?: AbortSignal): Promise<PaymentResponse> {
    return this.request<PaymentResponse>('POST', '/v1/payments', {
      body: params,
      idempotencyKey: params.idempotencyKey,
      signal,
    });
  }

  async getPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentResponse> {
    return this.request<PaymentResponse>('GET', `/v1/payments/${encodeURIComponent(paymentId)}`, {
      signal,
    });
  }

  async listPayments(params?: ListPaymentsParams, signal?: AbortSignal): Promise<ListPaymentsResponse> {
    return this.request<ListPaymentsResponse>('GET', '/v1/payments', {
      query: params,
      signal,
    });
  }

  async cancelPayment(paymentId: string, reason?: string, signal?: AbortSignal): Promise<PaymentResponse> {
    return this.request<PaymentResponse>('POST', `/v1/payments/${encodeURIComponent(paymentId)}/cancel`, {
      body: { reason },
      signal,
    });
  }

  async renewPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentResponse> {
    return this.request<PaymentResponse>('POST', `/v1/checkout/${encodeURIComponent(paymentId)}/renew`, {
      signal,
    });
  }

  async getQuote(paymentId: string, signal?: AbortSignal): Promise<QuoteResponse> {
    return this.request<QuoteResponse>('GET', `/v1/checkout/${encodeURIComponent(paymentId)}/quote`, {
      signal,
    });
  }

  async requestWithdrawal(params: RequestWithdrawalParams, signal?: AbortSignal): Promise<WithdrawalResponse> {
    const idempotencyKey = params.idempotencyKey || this.generateId();
    return this.request<WithdrawalResponse>('POST', '/v1/merchant/withdrawals', {
      body: { ...params, idempotencyKey },
      idempotencyKey,
      signal,
    });
  }

  async getWithdrawal(withdrawalId: string, signal?: AbortSignal): Promise<WithdrawalResponse> {
    return this.request<WithdrawalResponse>('GET', `/v1/merchant/withdrawals/${encodeURIComponent(withdrawalId)}`, {
      signal,
    });
  }

  async listWithdrawals(signal?: AbortSignal): Promise<WithdrawalResponse[]> {
    return this.request<WithdrawalResponse[]>('GET', '/v1/merchant/withdrawals', {
      signal,
    });
  }

  async requestRefund(
    paymentId: string,
    params: RequestRefundParams,
    signal?: AbortSignal
  ): Promise<RefundResponse> {
    if (!params.idempotencyKey || !params.idempotencyKey.trim()) {
      throw new Error('idempotencyKey is required for refund requests');
    }
    return this.request<RefundResponse>(
      'POST',
      `/v1/merchant/payments/${encodeURIComponent(paymentId)}/refund`,
      {
        body: params,
        idempotencyKey: params.idempotencyKey,
        signal,
      }
    );
  }

  async getRefundQuote(paymentId: string, signal?: AbortSignal): Promise<RefundQuoteResponse> {
    return this.request<RefundQuoteResponse>(
      'GET',
      `/v1/merchant/payments/${encodeURIComponent(paymentId)}/refund-quote`,
      {
        signal,
      }
    );
  }

  async getRefund(refundId: string, signal?: AbortSignal): Promise<RefundResponse> {
    return this.request<RefundResponse>('GET', `/v1/merchant/refunds/${encodeURIComponent(refundId)}`, {
      signal,
    });
  }

  async listRefunds(paymentId: string, signal?: AbortSignal): Promise<RefundResponse[]> {
    return this.request<RefundResponse[]>(
      'GET',
      `/v1/merchant/payments/${encodeURIComponent(paymentId)}/refunds`,
      {
        signal,
      }
    );
  }

  async getBalances(signal?: AbortSignal): Promise<TreasuryBalanceResponse[]> {
    return this.request<TreasuryBalanceResponse[]>('GET', '/v1/merchant/balances', {
      signal,
    });
  }

  async exportReconciliation(
    params?: ExportReconciliationParams,
    signal?: AbortSignal
  ): Promise<ExportReconciliationResponse> {
    return this.request<ExportReconciliationResponse>('GET', '/v1/merchant/export/reconciliation', {
      query: params,
      signal,
    });
  }

  async getMerchantConfig(signal?: AbortSignal): Promise<MerchantConfigResponse> {
    return this.request<MerchantConfigResponse>('GET', '/v1/merchant/config', {
      signal,
    });
  }

  async updateMerchantConfig(
    params: UpdateMerchantConfigParams,
    signal?: AbortSignal
  ): Promise<MerchantConfigResponse> {
    return this.request<MerchantConfigResponse>('PUT', '/v1/merchant/config', {
      body: params,
      signal,
    });
  }

  async getMerchantPayment(
    paymentId: string,
    signal?: AbortSignal
  ): Promise<MerchantPaymentDetailResponse> {
    return this.request<MerchantPaymentDetailResponse>(
      'GET',
      `/v1/merchant/payments/${encodeURIComponent(paymentId)}`,
      {
        signal,
      }
    );
  }
}
