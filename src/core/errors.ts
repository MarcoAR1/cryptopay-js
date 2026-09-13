export class CryptoPayCoreError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CryptoPayCoreError';
  }
}

export class SessionExpiredError extends CryptoPayCoreError {
  constructor() {
    super('Payment checkout session has expired', 'SESSION_EXPIRED');
  }
}

export class SessionCancelledError extends CryptoPayCoreError {
  constructor(reason?: string) {
    super(`Payment checkout session was cancelled${reason ? `: ${reason}` : ''}`, 'SESSION_CANCELLED');
  }
}

export class PaymentFailedError extends CryptoPayCoreError {
  constructor(msg = 'Payment execution failed') {
    super(msg, 'PAYMENT_FAILED');
  }
}

export class InvalidResponseError extends CryptoPayCoreError {
  constructor(details: string) {
    super(`Gateway response validation failed: ${details}`, 'INVALID_RESPONSE');
  }
}
