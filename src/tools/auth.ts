import { z } from 'zod';
import { apiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';

const LoginSchema = z.object({});

const LogoutSchema = z.object({});

const CheckAuthSchema = z.object({});

export function registerAuthTools() {
  return [
    {
      name: 'efecte_login',
      description: 'Authenticate with Efecte API using configured credentials',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'efecte_logout',
      description: 'Clear authentication tokens and logout from Efecte API',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'efecte_check_auth',
      description: 'Check if currently authenticated with Efecte API',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

async function login(_args: z.infer<typeof LoginSchema>) {
  try {
    logger.info('Attempting to login to Efecte API');
    const token = await apiClient.getAuthManager().authenticate();
    return {
      success: true,
      message: 'Successfully authenticated with Efecte API',
      tokenReceived: !!token,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Login failed', error);
    return {
      success: false,
      message: `Authentication failed: ${errorMessage}`,
    };
  }
}

async function logout(_args: z.infer<typeof LogoutSchema>) {
  try {
    logger.info('Logging out from Efecte API');
    apiClient.getAuthManager().clearToken();
    return {
      success: true,
      message: 'Successfully logged out from Efecte API',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Logout failed', error);
    return {
      success: false,
      message: `Logout failed: ${errorMessage}`,
    };
  }
}

async function checkAuth(_args: z.infer<typeof CheckAuthSchema>) {
  try {
    const isAuthenticated = apiClient.getAuthManager().isAuthenticated();
    return {
      authenticated: isAuthenticated,
      message: isAuthenticated 
        ? 'Currently authenticated with Efecte API'
        : 'Not authenticated with Efecte API',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Check auth failed', error);
    return {
      authenticated: false,
      message: `Auth check failed: ${errorMessage}`,
    };
  }
}

export const tools = {
  efecte_login: login,
  efecte_logout: logout,
  efecte_check_auth: checkAuth,
};