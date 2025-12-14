/**
 * Validation utilities for input validation
 * Provides runtime validation for various input types used throughout the application
 */

/**
 * Validates that a string is not empty after trimming
 * @param value - The string value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if value is empty or whitespace only
 */
export function validateNonEmpty(value: string, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

/**
 * Validates template code format (alphanumeric, underscores, hyphens)
 * @param templateCode - The template code to validate
 * @throws Error if template code is invalid
 */
export function validateTemplateCode(templateCode: string): void {
  validateNonEmpty(templateCode, 'Template code');
  if (!/^[a-zA-Z0-9_-]+$/.test(templateCode)) {
    throw new Error('Template code must contain only alphanumeric characters, underscores, or hyphens');
  }
}

/**
 * Validates data card ID format (non-empty string)
 * @param dataCardId - The data card ID to validate
 * @throws Error if data card ID is invalid
 */
export function validateDataCardId(dataCardId: string): void {
  validateNonEmpty(dataCardId, 'Data card ID');
}

/**
 * Validates attribute code format (non-empty string)
 * @param attributeCode - The attribute code to validate
 * @throws Error if attribute code is invalid
 */
export function validateAttributeCode(attributeCode: string): void {
  validateNonEmpty(attributeCode, 'Attribute code');
}

/**
 * Validates file size (in bytes)
 * @param size - File size in bytes
 * @param maxSizeBytes - Maximum allowed file size in bytes (default: 50MB)
 * @throws Error if file size is invalid or exceeds maximum
 */
export function validateFileSize(size: number, maxSizeBytes: number = 50 * 1024 * 1024): void {
  if (size <= 0) {
    throw new Error('File size must be greater than 0');
  }
  if (size > maxSizeBytes) {
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
    throw new Error(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
  }
}

/**
 * Validates URL format
 * @param url - The URL string to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if URL is invalid
 */
export function validateUrl(url: string, fieldName: string = 'URL'): void {
  validateNonEmpty(url, fieldName);
  try {
    new URL(url);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
}

/**
 * Validates port number range (1-65535)
 * @param port - Port number to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if port is out of valid range
 */
export function validatePort(port: number, fieldName: string = 'Port'): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${fieldName} must be an integer between 1 and 65535`);
  }
}

/**
 * Validates timeout value (in milliseconds)
 * @param timeout - Timeout value in milliseconds
 * @param min - Minimum allowed timeout (default: 1000ms)
 * @param max - Maximum allowed timeout (default: 300000ms = 5 minutes)
 * @param fieldName - Name of the field for error messages
 * @throws Error if timeout is out of valid range
 */
export function validateTimeout(timeout: number, min: number = 1000, max: number = 300000, fieldName: string = 'Timeout'): void {
  if (!Number.isInteger(timeout) || timeout < min || timeout > max) {
    throw new Error(`${fieldName} must be an integer between ${min}ms and ${max}ms`);
  }
}

/**
 * Validates pagination limit
 * @param limit - Pagination limit value
 * @param min - Minimum allowed limit (default: 1)
 * @param max - Maximum allowed limit (default: 200)
 * @throws Error if limit is out of valid range
 */
export function validatePaginationLimit(limit: number, min: number = 1, max: number = 200): void {
  if (!Number.isInteger(limit) || limit < min || limit > max) {
    throw new Error(`Pagination limit must be an integer between ${min} and ${max}`);
  }
}
