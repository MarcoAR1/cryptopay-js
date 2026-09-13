function getNodeCrypto(): any {
  if (typeof process !== 'undefined' && typeof (process as any).getBuiltinModule === 'function') {
    return (process as any).getBuiltinModule('crypto');
  }
  try {
    const req = (0, eval)('require');
    if (typeof req === 'function') {
      return req('crypto');
    }
  } catch {
    // ignore
  }
  try {
    const mod = (0, eval)('require')('module');
    if (mod && mod.createRequire && typeof import.meta !== 'undefined' && (import.meta as any).url) {
      return mod.createRequire((import.meta as any).url)('crypto');
    }
  } catch {
    // ignore
  }
  throw new WebhookVerificationError(
    'Node.js crypto module is required for webhook verification but could not be loaded',
    'CRYPTO_UNAVAILABLE'
  );
}

export class WebhookVerificationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
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
export function parseSignatureHeader(header: string): { signatureHex: string; headerTimestamp?: number } {
  if (!header || typeof header !== 'string') {
    throw new WebhookVerificationError('Missing or invalid signature header', 'INVALID_SIGNATURE_HEADER');
  }

  const parts = header.split(',');
  let signatureHex = '';
  let headerTimestamp: number | undefined;

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith('t=')) {
      const ts = Number(trimmed.slice(2));
      if (!Number.isNaN(ts)) {
        headerTimestamp = ts;
      }
    } else if (trimmed.startsWith('sha256=')) {
      signatureHex = trimmed.slice(7);
    } else if (trimmed.startsWith('v1=')) {
      signatureHex = trimmed.slice(3);
    } else if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      signatureHex = trimmed;
    }
  }

  if (!signatureHex || !/^[a-fA-F0-9]{64}$/.test(signatureHex)) {
    throw new WebhookVerificationError('No valid sha256 signature found in header', 'MALFORMED_SIGNATURE');
  }

  return { signatureHex: signatureHex.toLowerCase(), headerTimestamp };
}

/**
 * Verifies a CryptoPay webhook signature and parses the payload.
 * Strictly verifies against original raw bytes.
 * Supports secret rotation and timestamp replay tolerance.
 */
export function verifyWebhook(options: VerifyWebhookOptions): WebhookEventPayload {
  const {
    payload,
    signatureHeader,
    secrets,
    toleranceSeconds = 300,
    expectedTenantId,
  } = options;

  if (payload === undefined || payload === null) {
    throw new WebhookVerificationError('Payload is required for webhook verification', 'MISSING_PAYLOAD');
  }

  const rawBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  if (rawBuffer.length === 0) {
    throw new WebhookVerificationError('Payload cannot be empty', 'EMPTY_PAYLOAD');
  }

  const { signatureHex, headerTimestamp } = parseSignatureHeader(signatureHeader);
  const secretList = Array.isArray(secrets) ? secrets : [secrets];

  if (secretList.length === 0) {
    throw new WebhookVerificationError('At least one webhook secret is required', 'MISSING_SECRETS');
  }

  const providedBuf = Buffer.from(signatureHex, 'hex');
  const crypto = getNodeCrypto();
  let matched = false;

  for (const secret of secretList) {
    if (!secret) continue;
    const computedHex = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
    const computedBuf = Buffer.from(computedHex, 'hex');

    if (
      computedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(computedBuf, providedBuf)
    ) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    throw new WebhookVerificationError('Invalid signature: HMAC does not match any provided secret', 'INVALID_SIGNATURE');
  }

  // Parse JSON from the verified raw buffer
  let parsed: WebhookEventPayload;
  try {
    parsed = JSON.parse(rawBuffer.toString('utf8'));
  } catch (err: any) {
    throw new WebhookVerificationError(`Failed to parse webhook JSON payload: ${err.message}`, 'INVALID_JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new WebhookVerificationError('Parsed payload must be a JSON object', 'INVALID_SCHEMA');
  }

  // Verify tenant isolation if expectedTenantId configured
  if (expectedTenantId && parsed.tenantId && parsed.tenantId !== expectedTenantId) {
    throw new WebhookVerificationError(
      `Event tenantId (${parsed.tenantId}) does not match expected tenantId (${expectedTenantId})`,
      'TENANT_MISMATCH'
    );
  }

  // Verify timestamp replay window
  if (toleranceSeconds > 0) {
    const eventTimeStr = headerTimestamp
      ? headerTimestamp * (headerTimestamp < 10000000000 ? 1000 : 1)
      : parsed.timestamp
      ? new Date(parsed.timestamp).getTime()
      : undefined;

    if (eventTimeStr !== undefined && !Number.isNaN(eventTimeStr)) {
      const now = Date.now();
      const diffMs = Math.abs(now - eventTimeStr);
      const toleranceMs = toleranceSeconds * 1000;

      if (diffMs > toleranceMs) {
        throw new WebhookVerificationError(
          `Webhook timestamp is outside tolerance window (${Math.round(diffMs / 1000)}s > ${toleranceSeconds}s)`,
          'TIMESTAMP_OUT_OF_RANGE'
        );
      }
    }
  }

  return parsed;
}

/**
 * Express middleware helper to capture raw body and verify webhooks
 * Usage:
 *   app.post('/webhook', express.raw({ type: 'application/json' }), createWebhookMiddleware({ secrets: [...] }))
 */
export function createWebhookMiddleware(options: Omit<VerifyWebhookOptions, 'payload' | 'signatureHeader'> & {
  onVerified?: (event: WebhookEventPayload, req: any, res: any) => Promise<void> | void;
}) {
  return async (req: any, res: any, next: any) => {
    const signature = req.headers['x-cryptopay-signature'] as string;
    if (!signature) {
      return res.status(401).json({ error: 'Missing X-CryptoPay-Signature header' });
    }

    try {
      const rawBody = req.rawBody || req.body;
      const event = verifyWebhook({
        payload: rawBody,
        signatureHeader: signature,
        secrets: options.secrets,
        toleranceSeconds: options.toleranceSeconds,
        expectedTenantId: options.expectedTenantId,
      });

      req.cryptopayEvent = event;
      if (options.onVerified) {
        await options.onVerified(event, req, res);
      } else {
        next();
      }
    } catch (err: any) {
      const status = err instanceof WebhookVerificationError && err.code === 'TIMESTAMP_OUT_OF_RANGE' ? 400 : 401;
      return res.status(status).json({ error: err.message, code: err.code });
    }
  };
}
