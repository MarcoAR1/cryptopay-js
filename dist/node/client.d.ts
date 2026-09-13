import { ClientConfig, CreatePaymentParams, PaymentResponse, ListPaymentsParams, ListPaymentsResponse, QuoteResponse, RequestWithdrawalParams, WithdrawalResponse } from './types';
export declare class CryptoPayNodeClient {
    private apiKey;
    private baseUrl;
    private timeoutMs;
    private maxRetries;
    constructor(config: ClientConfig);
    private generateId;
    request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options?: {
        body?: any;
        idempotencyKey?: string;
        query?: Record<string, any>;
        signal?: AbortSignal;
    }): Promise<T>;
    createPayment(params: CreatePaymentParams, signal?: AbortSignal): Promise<PaymentResponse>;
    getPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentResponse>;
    listPayments(params?: ListPaymentsParams, signal?: AbortSignal): Promise<ListPaymentsResponse>;
    cancelPayment(paymentId: string, reason?: string, signal?: AbortSignal): Promise<PaymentResponse>;
    renewPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentResponse>;
    getQuote(paymentId: string, signal?: AbortSignal): Promise<QuoteResponse>;
    requestWithdrawal(params: RequestWithdrawalParams, signal?: AbortSignal): Promise<WithdrawalResponse>;
    getWithdrawal(withdrawalId: string, signal?: AbortSignal): Promise<WithdrawalResponse>;
}
