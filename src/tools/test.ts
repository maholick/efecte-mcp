import { z } from 'zod';
import { apiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { ApiResponse } from '../types/efecte.js';

const EchoSchema = z.object({
  message: z.string().optional().describe('Message to echo back'),
});

const EchoAuthSchema = z.object({
  message: z.string().optional().describe('Message to echo back (requires authentication)'),
});

export function registerTestTools() {
  return [
    {
      name: 'efecte_echo',
      description: 'Test connectivity with Efecte API (no authentication required)',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to echo back' },
        },
      },
    },
    {
      name: 'efecte_echo_auth',
      description: 'Test authenticated connectivity with Efecte API',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to echo back' },
        },
      },
    },
  ];
}

async function echo(args: z.infer<typeof EchoSchema>) {
  try {
    logger.info('Testing API connectivity with echo');
    
    const params: Record<string, string> = {};
    if (args.message) params.message = args.message;

    const result = await apiClient.get<ApiResponse>('echo', { params });
    
    return {
      success: true,
      response: result,
      message: 'API connectivity test successful',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Echo test failed', error);
    return {
      success: false,
      message: `Echo test failed: ${errorMessage}`,
    };
  }
}

async function echoAuth(args: z.infer<typeof EchoAuthSchema>) {
  try {
    logger.info('Testing authenticated API connectivity');
    
    const params: Record<string, string> = {};
    if (args.message) params.message = args.message;

    const result = await apiClient.get<ApiResponse>('echo/jwt', { params });
    
    return {
      success: true,
      response: result,
      message: 'Authenticated API connectivity test successful',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Authenticated echo test failed', error);
    return {
      success: false,
      message: `Authenticated echo test failed: ${errorMessage}`,
    };
  }
}

export const tools = {
  efecte_echo: echo,
  efecte_echo_auth: echoAuth,
};