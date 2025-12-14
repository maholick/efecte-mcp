import { apiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { RESTTemplateInfoElement, RESTTemplateInfo } from '../types/efecte.js';
import { Cache } from '../utils/cache.js';
import { efecteConfig } from '../utils/config.js';

const templateCache = new Cache<RESTTemplateInfo>('template-resources');
const templateListCache = new Cache<RESTTemplateInfoElement[]>('template-list-resources');

export async function registerTemplateResources() {
  try {
    let templates = templateListCache.get('all');
    
    if (!templates) {
      logger.info('Fetching templates for resource registration');
      templates = await apiClient.get<RESTTemplateInfoElement[]>('dc');
      templateListCache.set('all', templates, efecteConfig.caching.templatesTTL);
    }

    return templates.map(template => ({
      uri: `efecte://templates/${template.templateCode}`,
      name: template.name,
      description: `Template: ${template.name} (${template.templateCode})`,
      mimeType: 'application/json',
    }));
  } catch (error: unknown) {
    logger.error('Failed to register template resources', error);
    return [];
  }
}

export async function readResource(uri: string): Promise<any> {
  if (!uri.startsWith('efecte://templates/')) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const templateCode = uri.replace('efecte://templates/', '');
  
  let template = templateCache.get(templateCode);
  
  if (!template) {
    logger.info(`Fetching template resource: ${templateCode}`);
    template = await apiClient.get<RESTTemplateInfo>(`dc/${templateCode}`);
    templateCache.set(templateCode, template, efecteConfig.caching.templatesTTL);
  }

  return {
    templateCode: template.code,
    name: template.name,
    allowedFolders: template.allowedFolders,
    attributes: Object.entries(template.attributes).map(([code, attr]) => ({
      code,
      name: attr.name,
      type: attr.type,
      multiValue: attr.multiValue,
      file: attr.file,
      values: attr.values,
      target: attr.target,
    })),
  };
}