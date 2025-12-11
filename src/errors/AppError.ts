/**
 * Application Error Types
 *
 * Provides user-friendly error messages for non-technical teams.
 * Each error includes: what went wrong, and how to fix it.
 */

export interface AppErrorData {
    code: string;
    message: string;
    fixAction: string;
    isRetryable: boolean;
    httpStatus: number;
}

export class AppError extends Error {
    code: string;
    fixAction: string;
    isRetryable: boolean;
    httpStatus: number;
    details?: string;

    constructor(data: AppErrorData, details?: string) {
        super(data.message);
        this.name = 'AppError';
        this.code = data.code;
        this.fixAction = data.fixAction;
        this.isRetryable = data.isRetryable;
        this.httpStatus = data.httpStatus;
        this.details = details;
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            fixAction: this.fixAction,
            isRetryable: this.isRetryable,
            details: this.details
        };
    }
}

// Error definitions - user-friendly messages with fix actions
export const ErrorCodes = {
    // Authentication errors
    AUTH_INVALID: {
        code: 'ERR_AUTH_INVALID',
        message: 'API key is invalid',
        fixAction: 'Go to Hypefury Settings > External Apps and generate a new API key',
        isRetryable: false,
        httpStatus: 401
    },
    AUTH_REVOKED: {
        code: 'ERR_AUTH_REVOKED',
        message: 'API access was revoked',
        fixAction: 'Contact Hypefury support or generate a new API key in Hypefury Settings',
        isRetryable: false,
        httpStatus: 403
    },
    AUTH_MISSING: {
        code: 'ERR_AUTH_MISSING',
        message: 'API key is missing',
        fixAction: 'Add an API key for this client in the Clients page',
        isRetryable: false,
        httpStatus: 401
    },

    // Rate limiting
    RATE_LIMIT: {
        code: 'ERR_RATE_LIMIT',
        message: 'Too many requests to Hypefury',
        fixAction: 'Wait 5 minutes and try again, or reduce batch size',
        isRetryable: true,
        httpStatus: 429
    },

    // Service availability
    SERVICE_DOWN: {
        code: 'ERR_SERVICE_DOWN',
        message: 'Hypefury is temporarily unavailable',
        fixAction: 'Try again in a few minutes - this is usually temporary',
        isRetryable: true,
        httpStatus: 503
    },
    SERVICE_ERROR: {
        code: 'ERR_SERVICE_ERROR',
        message: 'Hypefury encountered an error',
        fixAction: 'Try again - if this keeps happening, contact support',
        isRetryable: true,
        httpStatus: 500
    },

    // Network errors
    TIMEOUT: {
        code: 'ERR_TIMEOUT',
        message: 'Connection to Hypefury timed out',
        fixAction: 'Check your internet connection and try again',
        isRetryable: true,
        httpStatus: 504
    },
    NETWORK_ERROR: {
        code: 'ERR_NETWORK',
        message: 'Network connection failed',
        fixAction: 'Check your internet connection and try again',
        isRetryable: true,
        httpStatus: 503
    },

    // Google Doc errors
    GDOC_NOT_FOUND: {
        code: 'ERR_GDOC_NOT_FOUND',
        message: 'Google Doc not found',
        fixAction: 'Make sure the document exists and the URL is correct',
        isRetryable: false,
        httpStatus: 404
    },
    GDOC_ACCESS_DENIED: {
        code: 'ERR_GDOC_ACCESS',
        message: 'Cannot access Google Doc',
        fixAction: 'Make sure the document is shared with "Anyone with the link can view"',
        isRetryable: false,
        httpStatus: 403
    },
    GDOC_INVALID_URL: {
        code: 'ERR_GDOC_INVALID_URL',
        message: 'Invalid Google Doc URL',
        fixAction: 'Copy the full URL from your browser address bar (should contain docs.google.com)',
        isRetryable: false,
        httpStatus: 400
    },

    // Content/validation errors
    EMPTY_POST: {
        code: 'ERR_EMPTY_POST',
        message: 'Post content is empty',
        fixAction: 'Make sure your Google Doc has content separated by "---" dividers',
        isRetryable: false,
        httpStatus: 400
    },
    VALIDATION_FAILED: {
        code: 'ERR_VALIDATION',
        message: 'Input validation failed',
        fixAction: 'Check the error details and correct the input',
        isRetryable: false,
        httpStatus: 400
    },
    QUALITY_REJECTED: {
        code: 'ERR_QUALITY_REJECTED',
        message: 'Post failed quality check',
        fixAction: 'Review the post content - it may contain formatting issues or be too short',
        isRetryable: false,
        httpStatus: 400
    },

    // Client errors
    CLIENT_NOT_FOUND: {
        code: 'ERR_CLIENT_NOT_FOUND',
        message: 'Client not found',
        fixAction: 'Select a valid client from the dropdown or add a new client',
        isRetryable: false,
        httpStatus: 404
    },
    CLIENT_DUPLICATE: {
        code: 'ERR_CLIENT_DUPLICATE',
        message: 'A client with this name already exists',
        fixAction: 'Choose a different name for the client',
        isRetryable: false,
        httpStatus: 409
    },

    // Post/operation errors
    POST_NOT_FOUND: {
        code: 'ERR_POST_NOT_FOUND',
        message: 'Post not found',
        fixAction: 'The post may have been deleted - refresh the page',
        isRetryable: false,
        httpStatus: 404
    },
    OPERATION_NOT_FOUND: {
        code: 'ERR_OPERATION_NOT_FOUND',
        message: 'Operation not found',
        fixAction: 'The operation may have been deleted - refresh the page',
        isRetryable: false,
        httpStatus: 404
    },

    // Database errors
    DATABASE_ERROR: {
        code: 'ERR_DATABASE',
        message: 'Database error occurred',
        fixAction: 'Try again - if this keeps happening, contact support',
        isRetryable: true,
        httpStatus: 500
    },

    // Generic fallback
    UNKNOWN: {
        code: 'ERR_UNKNOWN',
        message: 'An unexpected error occurred',
        fixAction: 'Try again - if this keeps happening, contact support',
        isRetryable: true,
        httpStatus: 500
    }
} as const;

/**
 * Maps Hypefury API HTTP status codes to our error types
 */
export function mapHypefuryError(statusCode: number, responseBody?: string): AppError {
    switch (statusCode) {
        case 401:
            return new AppError(ErrorCodes.AUTH_INVALID, responseBody);
        case 403:
            return new AppError(ErrorCodes.AUTH_REVOKED, responseBody);
        case 429:
            return new AppError(ErrorCodes.RATE_LIMIT, responseBody);
        case 500:
            return new AppError(ErrorCodes.SERVICE_ERROR, responseBody);
        case 502:
        case 503:
        case 504:
            return new AppError(ErrorCodes.SERVICE_DOWN, responseBody);
        default:
            if (statusCode >= 400 && statusCode < 500) {
                return new AppError(ErrorCodes.VALIDATION_FAILED, responseBody);
            }
            return new AppError(ErrorCodes.UNKNOWN, responseBody);
    }
}

/**
 * Maps Google Doc fetch errors to our error types
 */
export function mapGoogleDocError(statusCode: number): AppError {
    switch (statusCode) {
        case 404:
            return new AppError(ErrorCodes.GDOC_NOT_FOUND);
        case 403:
        case 401:
            return new AppError(ErrorCodes.GDOC_ACCESS_DENIED);
        default:
            return new AppError(ErrorCodes.UNKNOWN, `Google Doc returned status ${statusCode}`);
    }
}

/**
 * Creates an error response object for API responses
 */
export function createErrorResponse(error: AppError | Error) {
    if (error instanceof AppError) {
        return {
            success: false,
            error: error.toJSON()
        };
    }

    // Wrap generic errors
    const appError = new AppError(ErrorCodes.UNKNOWN, error.message);
    return {
        success: false,
        error: appError.toJSON()
    };
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: AppError | Error): boolean {
    if (error instanceof AppError) {
        return error.isRetryable;
    }
    // Generic errors default to retryable
    return true;
}
