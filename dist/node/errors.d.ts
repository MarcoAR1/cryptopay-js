export declare class CryptoPayNodeError extends Error {
    statusCode?: number;
    code: string;
    requestId?: string;
    details?: any;
    constructor(message: string, code?: string, statusCode?: number, requestId?: string, details?: any);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        statusCode: number | undefined;
        requestId: string | undefined;
        details: any;
    };
}
export declare class AuthenticationError extends CryptoPayNodeError {
    constructor(message?: string, requestId?: string);
}
export declare class ConflictError extends CryptoPayNodeError {
    constructor(message?: string, requestId?: string);
}
export declare class RateLimitError extends CryptoPayNodeError {
    retryAfterSeconds: number;
    constructor(message?: string, retryAfterSeconds?: number, requestId?: string);
}
export declare class TimeoutError extends CryptoPayNodeError {
    constructor(message?: string, requestId?: string);
}
export declare class AmbiguousTimeoutError extends CryptoPayNodeError {
    idempotencyKey: string;
    constructor(idempotencyKey: string, message?: string);
}
export declare class ServerError extends CryptoPayNodeError {
    constructor(message?: string, statusCode?: number, requestId?: string);
}
