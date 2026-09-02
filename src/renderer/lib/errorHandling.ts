/**
 * Comprehensive Error Handling Utility
 * Provides retry logic, error classification, and user-friendly messages
 */

export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class ApiError extends Error {
  type: ErrorType;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(
    type: ErrorType,
    status: number,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Classify error type from HTTP status
 */
export function classifyErrorType(status: number): ErrorType {
  if (status === 0) return ErrorType.NETWORK;
  if (status === 401 || status === 403) return ErrorType.AUTH;
  if (status === 400 || status === 422) return ErrorType.VALIDATION;
  if (status === 404) return ErrorType.NOT_FOUND;
  if (status === 409) return ErrorType.CONFLICT;
  if (status >= 500) return ErrorType.SERVER_ERROR;
  return ErrorType.UNKNOWN;
}

/**
 * Determine if error is retryable
 */
export function isRetryable(error: ApiError | unknown): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as Record<string, unknown>).status as number;
    // Retry on network errors, server errors, rate limiting
    return status === 0 || status === 429 || status >= 500;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('failed to fetch')
    );
  }

  return false;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: ApiError | string | unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as Record<string, unknown>).message);
  }

  return 'An unexpected error occurred';
}

/**
 * Parse API error response and create ApiError
 */
export function parseApiError(status: number, response: unknown, requestUrl?: string): ApiError {
  const type = classifyErrorType(status);
  let message = getDefaultErrorMessage(type, status);

  // Extract message from response if available
  if (response && typeof response === 'object') {
    const resp = response as Record<string, unknown>;
    if (typeof resp.error === 'string') {
      message = resp.error;
    } else if (typeof resp.message === 'string') {
      message = resp.message;
    }
  }

  return new ApiError(type, status, message, isRetryableStatus(status), {
    url: requestUrl,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get default error message for error type
 */
function getDefaultErrorMessage(type: ErrorType, status: number): string {
  const messages: Record<ErrorType, string> = {
    [ErrorType.NETWORK]: 'Network connection failed. Please check your internet connection.',
    [ErrorType.AUTH]: 'Authentication failed. Please log in again.',
    [ErrorType.VALIDATION]: 'Invalid request. Please check your input.',
    [ErrorType.NOT_FOUND]: 'The requested resource was not found.',
    [ErrorType.CONFLICT]: 'This resource already exists or is in use.',
    [ErrorType.SERVER_ERROR]: 'Server error. Please try again later.',
    [ErrorType.UNKNOWN]: `Error: ${status}`,
  };

  return messages[type] || messages[ErrorType.UNKNOWN];
}

/**
 * Check if HTTP status is retryable
 */
function isRetryableStatus(status: number): boolean {
  // Network errors
  if (status === 0) return true;

  // Rate limiting
  if (status === 429) return true;

  // Server errors (except 501 Not Implemented)
  if (status >= 500 && status !== 501) return true;

  // Timeout (if status is passed as 0)
  if (status === 408) return true;

  return false;
}

/**
 * Retry helper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.debug(
          `[retry] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Max retry attempts reached');
}

/**
 * Retry async function with specific error handling
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, onRetry, shouldRetry = () => true } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetry(lastError) || attempt === maxAttempts - 1) {
        throw lastError;
      }

      const delayMs = baseDelay * Math.pow(2, attempt);
      onRetry?.(attempt + 1, lastError);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
