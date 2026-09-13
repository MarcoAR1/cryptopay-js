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
