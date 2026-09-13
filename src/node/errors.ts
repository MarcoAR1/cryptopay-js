export class CryptoPayNodeError extends Error {
  public statusCode?: number;
  public code: string;
  public requestId?: string;
  public details?: any;

  constructor(message: string, code = 'SDK_ERROR', statusCode?: number, requestId?: string, details?: any) {
    // Redact potential API keys from message
    const sanitizedMessage = message.replace(/(cp_sec_[a-zA-Z0-9_-]{6}|sec_[a-zA-Z0-9_-]{6})[a-zA-Z0-9_-]+/g, '$1[REDACTED]');
    super(sanitizedMessage);
    this.name = 'CryptoPayNodeError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

export class AuthenticationError extends CryptoPayNodeError {
  constructor(message = 'Invalid or missing API key', requestId?: string, statusCode = 401) {
    super(message, 'AUTHENTICATION_ERROR', statusCode, requestId);
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenError extends AuthenticationError {
  constructor(message = 'Forbidden access or cross-tenant violation', requestId?: string) {
    super(message, requestId, 403);
    this.name = 'ForbiddenError';
    this.code = 'FORBIDDEN_ERROR';
  }
}

export class ConflictError extends CryptoPayNodeError {
  constructor(message = 'Resource conflict or duplicate operation', requestId?: string) {
    super(message, 'CONFLICT_ERROR', 409, requestId);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends CryptoPayNodeError {
  public retryAfterSeconds: number;

  constructor(message = 'Too many requests, rate limit exceeded', retryAfterSeconds = 60, requestId?: string) {
    super(message, 'RATE_LIMIT_ERROR', 429, requestId);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TimeoutError extends CryptoPayNodeError {
  constructor(message = 'Request timed out', requestId?: string) {
    super(message, 'TIMEOUT_ERROR', 408, requestId);
    this.name = 'TimeoutError';
  }
}

export class AmbiguousTimeoutError extends CryptoPayNodeError {
  public idempotencyKey: string;

  constructor(idempotencyKey: string, message = 'POST request timed out before confirmation; status is ambiguous. Do not retry with a different idempotency key.') {
    super(message, 'AMBIGUOUS_TIMEOUT_ERROR', 408);
    this.name = 'AmbiguousTimeoutError';
    this.idempotencyKey = idempotencyKey;
  }
}

export class ServerError extends CryptoPayNodeError {
  constructor(message = 'Internal server error from gateway', statusCode = 500, requestId?: string) {
    super(message, 'SERVER_ERROR', statusCode, requestId);
    this.name = 'ServerError';
  }
}
