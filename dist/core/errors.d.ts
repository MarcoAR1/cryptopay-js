export declare class CryptoPayCoreError extends Error {
    code: string;
    constructor(message: string, code: string);
}
export declare class SessionExpiredError extends CryptoPayCoreError {
    constructor();
}
export declare class SessionCancelledError extends CryptoPayCoreError {
    constructor(reason?: string);
}
export declare class PaymentFailedError extends CryptoPayCoreError {
    constructor(msg?: string);
}
export declare class InvalidResponseError extends CryptoPayCoreError {
    constructor(details: string);
}
export declare class WalletNotInstalledError extends CryptoPayCoreError {
    deepLink?: string | undefined;
    constructor(walletName?: string, deepLink?: string | undefined);
}
export declare class WalletPermissionRejectedError extends CryptoPayCoreError {
    constructor(message?: string);
}
export declare class ChainSwitchRejectedError extends CryptoPayCoreError {
    constructor(targetChainId: number);
}
export declare class NetworkMismatchError extends CryptoPayCoreError {
    constructor(expectedChainId: number, actualChainId: number);
}
export declare class PaymentPreparationInvalidatedError extends CryptoPayCoreError {
    constructor(reason: string);
}
export declare class PayerMismatchError extends CryptoPayCoreError {
    constructor(expectedPayer: string, actualAccount: string);
}
export declare class ApprovalRejectedError extends CryptoPayCoreError {
    constructor(message?: string);
}
export declare class PaymentRejectedError extends CryptoPayCoreError {
    constructor(message?: string);
}
export declare class AmbiguousExecutionError extends CryptoPayCoreError {
    constructor(message?: string);
}
export declare class ContractExecutionRevertedError extends CryptoPayCoreError {
    constructor(reason?: string);
}
