/**
 * Errors - Unified error handling for Nebutra services
 *
 * Provides:
 * - Typed error classes
 * - Consistent API error responses
 * - Error serialization for logging
 */
export declare const ERROR_CODES: {
    readonly BAD_REQUEST: "BAD_REQUEST";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly CONFLICT: "CONFLICT";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly QUOTA_EXCEEDED: "QUOTA_EXCEEDED";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE";
    readonly EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR";
    readonly DATABASE_ERROR: "DATABASE_ERROR";
    readonly TIMEOUT: "TIMEOUT";
    readonly PAYMENT_REQUIRED: "PAYMENT_REQUIRED";
    readonly SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED";
    readonly FEATURE_DISABLED: "FEATURE_DISABLED";
    readonly TENANT_SUSPENDED: "TENANT_SUSPENDED";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export interface AppErrorOptions {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    cause?: Error;
    metadata?: Record<string, unknown>;
    suggestion?: string;
    isOperational?: boolean;
}
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly metadata?: Record<string, unknown>;
    readonly suggestion?: string;
    readonly timestamp: string;
    constructor(options: AppErrorOptions);
    toJSON(): Record<string, unknown>;
}
export interface CapabilityErrorOptions {
    statusCode?: number;
    cause?: Error;
    metadata?: Record<string, unknown>;
    suggestion: string;
    code?: ErrorCode;
}
export declare class CapabilityError extends AppError {
    readonly capability: string;
    constructor(capability: string, message: string, options: CapabilityErrorOptions);
}
export declare class ValidationError extends AppError {
    readonly fields?: Record<string, string[]>;
    constructor(message: string, fields?: Record<string, string[]>);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(resource?: string, id?: string);
}
export declare class ConflictError extends AppError {
    constructor(message?: string);
}
export declare class RateLimitError extends AppError {
    readonly retryAfter?: number;
    constructor(retryAfter?: number);
}
export declare class QuotaExceededError extends AppError {
    constructor(quota: string, limit: number, current: number);
}
export declare class ExternalServiceError extends AppError {
    constructor(service: string, cause?: Error);
}
export declare class DatabaseError extends AppError {
    constructor(operation: string, cause?: Error);
}
export interface ApiErrorResponse {
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
    requestId?: string;
}
export declare function toApiError(error: unknown, requestId?: string): ApiErrorResponse;
export declare function getStatusCode(error: unknown): number;
interface HonoContext {
    req: {
        header: (name: string) => string | undefined;
    };
    json: (data: unknown, status?: number) => unknown;
}
export interface ErrorHandlerOptions {
    /**
     * Called for every caught error so callers can route it to their structured
     * logger (e.g. @nebutra/logger).  Defaults to a no-op — DO NOT rely on the
     * previous process.stderr.write behaviour; pass an onError callback instead.
     */
    onError?: (error: unknown, meta: {
        requestId?: string;
        statusCode: number;
    }) => void;
}
export declare function errorHandler(options?: ErrorHandlerOptions): (c: HonoContext, next: () => Promise<void>) => Promise<unknown>;
/**
 * Wrap async function with error handling
 */
export declare function tryCatch<T>(fn: () => Promise<T>, errorHandler?: (error: unknown) => T | Promise<T>): Promise<T>;
/**
 * Assert condition or throw error
 */
export declare function assert(condition: unknown, message: string): asserts condition;
/**
 * Assert not null/undefined or throw NotFoundError
 */
export declare function assertFound<T>(value: T | null | undefined, resource: string, id?: string): asserts value is T;
export {};
//# sourceMappingURL=index.d.ts.map