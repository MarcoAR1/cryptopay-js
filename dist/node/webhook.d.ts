export declare class WebhookVerificationError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
export interface WebhookEventPayload {
    eventId: string;
    event: string;
    transactionId?: string;
    tenantId?: string;
    orderId?: string;
    amount?: string;
    amountUnits?: string;
    currency?: string;
    chainId?: number;
    tokenAddress?: string;
    toAddress?: string;
    status?: string;
    txHash?: string | null;
    timestamp?: string | number;
    [key: string]: any;
}
export interface VerifyWebhookOptions {
    /** Raw HTTP request body as Buffer or raw UTF-8 string */
    payload: string | Buffer;
    /** Value of X-CryptoPay-Signature header */
    signatureHeader: string;
    /** Active webhook secret, or array of secrets to support zero-downtime rotation */
    secrets: string | string[];
    /** Allowed clock drift / replay window in seconds (default 300s / 5min). Set 0 to disable */
    toleranceSeconds?: number;
    /** Optional expected tenantId to reject events from other environments/tenants */
    expectedTenantId?: string;
}
/**
 * Extracts and normalizes the hex HMAC signature from header
 * Supports:
 * - "sha256=<hex>"
 * - "v1=<hex>"
 * - "t=<timestamp>,v1=<hex>"
 * - raw "<hex>"
 */
export declare function parseSignatureHeader(header: string): {
    signatureHex: string;
    headerTimestamp?: number;
};
/**
 * Verifies a CryptoPay webhook signature and parses the payload.
 * Strictly verifies against original raw bytes.
 * Supports secret rotation and timestamp replay tolerance.
 */
export declare function verifyWebhook(options: VerifyWebhookOptions): WebhookEventPayload;
/**
 * Express middleware helper to capture raw body and verify webhooks
 * Usage:
 *   app.post('/webhook', express.raw({ type: 'application/json' }), createWebhookMiddleware({ secrets: [...] }))
 */
export declare function createWebhookMiddleware(options: Omit<VerifyWebhookOptions, 'payload' | 'signatureHeader'> & {
    onVerified?: (event: WebhookEventPayload, req: any, res: any) => Promise<void> | void;
}): (req: any, res: any, next: any) => Promise<any>;
