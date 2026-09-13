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

export class WalletNotInstalledError extends CryptoPayCoreError {
  constructor(walletName = 'Wallet', public deepLink?: string) {
    super(`${walletName} is not installed or available in this browser`, 'WALLET_NOT_INSTALLED');
  }
}

export class WalletPermissionRejectedError extends CryptoPayCoreError {
  constructor(message = 'User rejected wallet connection or permission request') {
    super(message, 'WALLET_PERMISSION_REJECTED');
  }
}

export class ChainSwitchRejectedError extends CryptoPayCoreError {
  constructor(targetChainId: number) {
    super(`User rejected network switch to chain ${targetChainId}`, 'CHAIN_SWITCH_REJECTED');
  }
}

export class NetworkMismatchError extends CryptoPayCoreError {
  constructor(expectedChainId: number, actualChainId: number) {
    super(`Wallet is connected to chain ${actualChainId}, but payment requires chain ${expectedChainId}`, 'NETWORK_MISMATCH');
  }
}

export class PaymentPreparationInvalidatedError extends CryptoPayCoreError {
  constructor(reason: string) {
    super(`Payment preparation was invalidated due to wallet/network change: ${reason}`, 'PREPARATION_INVALIDATED');
  }
}

export class PayerMismatchError extends CryptoPayCoreError {
  constructor(expectedPayer: string, actualAccount: string) {
    super(
      `Connected account (${actualAccount}) does not match authorized payer (${expectedPayer})`,
      'PAYER_MISMATCH'
    );
  }
}

export class ApprovalRejectedError extends CryptoPayCoreError {
  constructor(message = 'Token approval transaction was rejected or failed') {
    super(message, 'APPROVAL_REJECTED');
  }
}

export class PaymentRejectedError extends CryptoPayCoreError {
  constructor(message = 'Contract payment transaction was rejected by user') {
    super(message, 'PAYMENT_REJECTED');
  }
}

export class AmbiguousExecutionError extends CryptoPayCoreError {
  constructor(message = 'Transaction execution status is ambiguous; automatic duplicate resubmission blocked to protect funds') {
    super(message, 'AMBIGUOUS_EXECUTION');
  }
}

export class ContractExecutionRevertedError extends CryptoPayCoreError {
  constructor(reason = 'Transaction execution reverted on-chain') {
    super(reason, 'EXECUTION_REVERTED');
  }
}

export class IncompatibleVersionError extends CryptoPayCoreError {
  constructor(
    message: string,
    public expectedVersion = 'v2',
    public receivedVersion?: string
  ) {
    super(message, 'INCOMPATIBLE_VERSION');
    this.name = 'IncompatibleVersionError';
  }
}

