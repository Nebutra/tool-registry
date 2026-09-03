/**
 * Errors - Unified error handling for Nebutra services
 *
 * Provides:
 * - Typed error classes
 * - Consistent API error responses
 * - Error serialization for logging
 */
// ============================================
// Error Codes
// ============================================
export const ERROR_CODES = {
    // Client errors (4xx)
    BAD_REQUEST: "BAD_REQUEST",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    CONFLICT: "CONFLICT",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    RATE_LIMITED: "RATE_LIMITED",
    QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
    // Server errors (5xx)
    INTERNAL_ERROR: "INTERNAL_ERROR",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
    DATABASE_ERROR: "DATABASE_ERROR",
    TIMEOUT: "TIMEOUT",
    // Business errors
    PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
    SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
    FEATURE_DISABLED: "FEATURE_DISABLED",
    TENANT_SUSPENDED: "TENANT_SUSPENDED",
};
export class AppError extends Error {
    code;
    statusCode;
    isOperational;
    metadata;
    suggestion;
    timestamp;
    constructor(options) {
        super(options.message);
        this.name = "AppError";
        this.code = options.code;
        this.statusCode = options.statusCode || getDefaultStatusCode(options.code);
        this.isOperational = options.isOperational ?? true;
        if (options.metadata !== undefined) {
            this.metadata = options.metadata;
        }
        if (options.suggestion !== undefined) {
            this.suggestion = options.suggestion;
        }
        this.timestamp = new Date().toISOString();
        if (options.cause) {
            this.cause = options.cause;
        }
        Error.captureStackTrace(this, this.constructor);
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            suggestion: this.suggestion,
            metadata: this.metadata,
        };
    }
}
export class CapabilityError extends AppError {
    capability;
    constructor(capability, message, options) {
        super({
            code: options.code ?? ERROR_CODES.EXTERNAL_SERVICE_ERROR,
            message,
            statusCode: options.statusCode ?? 502,
            ...(options.cause !== undefined ? { cause: options.cause } : {}),
            suggestion: options.suggestion,
            metadata: {
                capability,
                ...(options.metadata ?? {}),
            },
        });
        this.name = "CapabilityError";
        this.capability = capability;
    }
}
// ============================================
// Specific Error Classes
// ============================================
export class ValidationError extends AppError {
    fields;
    constructor(message, fields) {
        super({
            code: ERROR_CODES.VALIDATION_ERROR,
            message,
            statusCode: 400,
            ...(fields !== undefined && { metadata: { fields } }),
        });
        this.name = "ValidationError";
        if (fields !== undefined) {
            this.fields = fields;
        }
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super({ code: ERROR_CODES.UNAUTHORIZED, message, statusCode: 401 });
        this.name = "UnauthorizedError";
    }
}
export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super({ code: ERROR_CODES.FORBIDDEN, message, statusCode: 403 });
        this.name = "ForbiddenError";
    }
}
export class NotFoundError extends AppError {
    constructor(resource = "Resource", id) {
        const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
        super({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
        this.name = "NotFoundError";
    }
}
export class ConflictError extends AppError {
    constructor(message = "Resource already exists") {
        super({ code: ERROR_CODES.CONFLICT, message, statusCode: 409 });
        this.name = "ConflictError";
    }
}
export class RateLimitError extends AppError {
    retryAfter;
    constructor(retryAfter) {
        super({
            code: ERROR_CODES.RATE_LIMITED,
            message: "Too many requests",
            statusCode: 429,
            ...(retryAfter !== undefined && { metadata: { retryAfter } }),
        });
        this.name = "RateLimitError";
        if (retryAfter !== undefined) {
            this.retryAfter = retryAfter;
        }
    }
}
export class QuotaExceededError extends AppError {
    constructor(quota, limit, current) {
        super({
            code: ERROR_CODES.QUOTA_EXCEEDED,
            message: `${quota} quota exceeded (${current}/${limit})`,
            statusCode: 429,
            metadata: { quota, limit, current },
        });
        this.name = "QuotaExceededError";
    }
}
export class ExternalServiceError extends AppError {
    constructor(service, cause) {
        super({
            code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
            message: `External service '${service}' failed`,
            statusCode: 502,
            ...(cause !== undefined && { cause }),
            metadata: { service },
        });
        this.name = "ExternalServiceError";
    }
}
export class DatabaseError extends AppError {
    constructor(operation, cause) {
        super({
            code: ERROR_CODES.DATABASE_ERROR,
            message: `Database operation '${operation}' failed`,
            statusCode: 500,
            ...(cause !== undefined && { cause }),
            isOperational: false,
            metadata: { operation },
        });
        this.name = "DatabaseError";
    }
}
export function toApiError(error, requestId) {
    if (error instanceof AppError) {
        return {
            error: {
                code: error.code,
                message: error.message,
                ...((error.metadata !== undefined || error.suggestion !== undefined) && {
                    details: {
                        ...(error.metadata ?? {}),
                        ...(error.suggestion !== undefined && { suggestion: error.suggestion }),
                    },
                }),
            },
            ...(requestId !== undefined && { requestId }),
        };
    }
    // Unknown error - don't leak details
    return {
        error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: "An unexpected error occurred",
        },
        ...(requestId !== undefined && { requestId }),
    };
}
export function getStatusCode(error) {
    if (error instanceof AppError) {
        return error.statusCode;
    }
    return 500;
}
export function errorHandler(options = {}) {
    return async (c, next) => {
        try {
            await next();
        }
        catch (error) {
            const requestId = c.req.header("x-request-id");
            const statusCode = getStatusCode(error);
            const response = toApiError(error, requestId);
            options.onError?.(error, requestId !== undefined ? { requestId, statusCode } : { statusCode });
            return c.json(response, statusCode);
        }
    };
}
// ============================================
// Utility Functions
// ============================================
function getDefaultStatusCode(code) {
    switch (code) {
        case ERROR_CODES.BAD_REQUEST:
        case ERROR_CODES.VALIDATION_ERROR:
            return 400;
        case ERROR_CODES.UNAUTHORIZED:
            return 401;
        case ERROR_CODES.PAYMENT_REQUIRED:
        case ERROR_CODES.SUBSCRIPTION_EXPIRED:
            return 402;
        case ERROR_CODES.FORBIDDEN:
        case ERROR_CODES.FEATURE_DISABLED:
        case ERROR_CODES.TENANT_SUSPENDED:
            return 403;
        case ERROR_CODES.NOT_FOUND:
            return 404;
        case ERROR_CODES.CONFLICT:
            return 409;
        case ERROR_CODES.RATE_LIMITED:
        case ERROR_CODES.QUOTA_EXCEEDED:
            return 429;
        case ERROR_CODES.INTERNAL_ERROR:
        case ERROR_CODES.DATABASE_ERROR:
            return 500;
        case ERROR_CODES.EXTERNAL_SERVICE_ERROR:
            return 502;
        case ERROR_CODES.SERVICE_UNAVAILABLE:
            return 503;
        case ERROR_CODES.TIMEOUT:
            return 504;
        default:
            return 500;
    }
}
/**
 * Wrap async function with error handling
 */
export function tryCatch(fn, errorHandler) {
    return fn().catch((error) => {
        if (errorHandler) {
            return errorHandler(error);
        }
        throw error;
    });
}
/**
 * Assert condition or throw error
 */
export function assert(condition, message) {
    if (!condition) {
        throw new AppError({
            code: ERROR_CODES.BAD_REQUEST,
            message,
        });
    }
}
/**
 * Assert not null/undefined or throw NotFoundError
 */
export function assertFound(value, resource, id) {
    if (value === null || value === undefined) {
        throw new NotFoundError(resource, id);
    }
}
