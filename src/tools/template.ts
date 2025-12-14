import { z } from 'zod';
import { apiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { validateTemplateCode } from '../utils/validation.js';
import { RESTTemplateInfoElement, RESTTemplateInfo } from '../types/efecte.js';
import { Cache } from '../utils/cache.js';
import { efecteConfig } from '../utils/config.js';

const ListTemplatesSchema = z.object({});

const GetTemplateSchema = z.object({
  templateCode: z.string().describe('Template code to fetch details for'),
});

const templateCache = new Cache<RESTTemplateInfo>('templates');
const templateListCache = new Cache<RESTTemplateInfoElement[]>('template-list');

export function registerTemplateTools() {
  return [
    {
      name: 'efecte_list_templates',
      description: 'Get a list of all available templates',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'efecte_get_template',
      description: 'Get detailed information about a specific template including attributes',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code to fetch details for' },
        },
        required: ['templateCode'],
      },
    },
  ];
}

async function listTemplates(_args: z.infer<typeof ListTemplatesSchema>) {
  try {
    const cached = templateListCache.get('all');
    if (cached) {
      logger.debug('Returning cached template list');
      return cached;
    }

    logger.info('Fetching template list from API');
    const result = await apiClient.get<RESTTemplateInfoElement[]>('dc');
    
    templateListCache.set('all', result, efecteConfig.caching.templatesTTL);
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('List templates failed', error);
    throw new Error(`Failed to list templates: ${errorMessage}`);
  }
}

async function getTemplate(args: z.infer<typeof GetTemplateSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    const cached = templateCache.get(args.templateCode);
    if (cached) {
      logger.debug(`Returning cached template: ${args.templateCode}`);
      return cached;
    }

    logger.info(`Fetching template details: ${args.templateCode}`);
    const result = await apiClient.get<RESTTemplateInfo>(`dc/${args.templateCode}`);
    
    templateCache.set(args.templateCode, result, efecteConfig.caching.templatesTTL);
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Get template failed', error);
    throw new Error(`Failed to get template: ${errorMessage}`);
  }
}

export const tools = {
  efecte_list_templates: listTemplates,
  efecte_get_template: getTemplate,
};