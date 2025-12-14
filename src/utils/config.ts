import { config } from 'dotenv';
import { EfecteConfig } from '../types/efecte.js';
import { validateUrl, validatePort, validateTimeout, validatePaginationLimit } from './validation.js';

config();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return num;
}

// Validate and build configuration
function buildConfig(): EfecteConfig {
  const baseUrl = getEnvVar('EFECTE_BASE_URL');
  validateUrl(baseUrl, 'EFECTE_BASE_URL');
  
  const timeout = getEnvNumber('EFECTE_TIMEOUT', 30000);
  validateTimeout(timeout, 1000, 300000, 'EFECTE_TIMEOUT');
  
  const defaultLimit = getEnvNumber('EFECTE_PAGINATION_DEFAULT_LIMIT', 50);
  validatePaginationLimit(defaultLimit);
  
  const maxLimit = getEnvNumber('EFECTE_PAGINATION_MAX_LIMIT', 200);
  validatePaginationLimit(maxLimit);
  
  if (defaultLimit > maxLimit) {
    throw new Error('EFECTE_PAGINATION_DEFAULT_LIMIT cannot be greater than EFECTE_PAGINATION_MAX_LIMIT');
  }
  
  const httpPort = getEnvNumber('EFECTE_TRANSPORT_HTTP_PORT', 3000);
  validatePort(httpPort, 'EFECTE_TRANSPORT_HTTP_PORT');
  
  const sessionTimeout = getEnvNumber('EFECTE_TRANSPORT_HTTP_SESSION_TIMEOUT', 1800000);
  if (sessionTimeout < 60000) {
    throw new Error('EFECTE_TRANSPORT_HTTP_SESSION_TIMEOUT must be at least 60000ms (1 minute)');
  }
  
  const maxRequestsPerMinute = getEnvNumber('EFECTE_SECURITY_MAX_REQUESTS_PER_MINUTE', 60);
  if (maxRequestsPerMinute < 1 || maxRequestsPerMinute > 10000) {
    throw new Error('EFECTE_SECURITY_MAX_REQUESTS_PER_MINUTE must be between 1 and 10000');
  }
  
  const tokenRefreshThreshold = getEnvNumber('EFECTE_SECURITY_TOKEN_REFRESH_THRESHOLD', 300);
  if (tokenRefreshThreshold < 0 || tokenRefreshThreshold > 3600) {
    throw new Error('EFECTE_SECURITY_TOKEN_REFRESH_THRESHOLD must be between 0 and 3600 seconds');
  }
  
  const loggingLevel = getEnvVar('EFECTE_LOGGING_LEVEL', 'info');
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(loggingLevel.toLowerCase())) {
    throw new Error(`EFECTE_LOGGING_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
  
  const transportDefault = getEnvVar('EFECTE_TRANSPORT_DEFAULT', 'stdio');
  if (transportDefault !== 'stdio' && transportDefault !== 'http') {
    throw new Error('EFECTE_TRANSPORT_DEFAULT must be either "stdio" or "http"');
  }

  return {
    baseUrl,
    apiPath: getEnvVar('EFECTE_API_PATH', '/rest-api/itsm/v1'),
    username: getEnvVar('EFECTE_USERNAME'),
    password: getEnvVar('EFECTE_PASSWORD'),
    timeout,
    caching: {
      templatesTTL: getEnvNumber('EFECTE_CACHE_TEMPLATES_TTL', 300000),
      authTokenTTL: getEnvNumber('EFECTE_CACHE_AUTH_TOKEN_TTL', 3300000),
    },
    pagination: {
      defaultLimit,
      maxLimit,
    },
    transport: {
      default: transportDefault as 'stdio' | 'http',
      http: {
        enabled: getEnvBool('EFECTE_TRANSPORT_HTTP_ENABLED', false),
        port: httpPort,
        host: getEnvVar('EFECTE_TRANSPORT_HTTP_HOST', '0.0.0.0'),
        allowedOrigins: process.env.EFECTE_TRANSPORT_HTTP_ALLOWED_ORIGINS
          ? process.env.EFECTE_TRANSPORT_HTTP_ALLOWED_ORIGINS.split(',').map(o => o.trim())
          : undefined, // undefined means allow all (for development)
        sessionTimeout,
      },
    },
    logging: {
      level: loggingLevel,
      enableStructured: getEnvBool('EFECTE_LOGGING_ENABLE_STRUCTURED', false),
      enablePerformanceMetrics: getEnvBool('EFECTE_LOGGING_ENABLE_PERFORMANCE_METRICS', false),
    },
    security: {
      enableAuditLogging: getEnvBool('EFECTE_SECURITY_ENABLE_AUDIT_LOGGING', false),
      maxRequestsPerMinute,
      tokenRefreshThreshold,
    },
  };
}

export const efecteConfig: EfecteConfig = buildConfig();

export function getApiUrl(path: string = ''): string {
  const baseUrl = efecteConfig.baseUrl.replace(/\/$/, '');
  const apiPath = efecteConfig.apiPath.replace(/^\//, '').replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  
  return cleanPath 
    ? `${baseUrl}/${apiPath}/${cleanPath}`
    : `${baseUrl}/${apiPath}`;
}