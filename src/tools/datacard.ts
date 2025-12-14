import { z } from 'zod';
import { apiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { efecteConfig } from '../utils/config.js';
import { validateTemplateCode, validateDataCardId, validateAttributeCode, validateNonEmpty } from '../utils/validation.js';
import {
  extractReferenceAttributeFromFilter,
  getReferenceTemplateCode,
  listReferenceValues,
  findSimilarMatch,
  isBadRequestError,
} from '../utils/reference-attributes.js';
import {
  getTextFieldsFromTemplate,
  getCommonTextFields,
  filterDataCardsByText,
} from '../utils/search.js';
import { RESTTemplateInfo } from '../types/efecte.js';
import { Cache } from '../utils/cache.js';
import {
  RESTPaginatedDataCardsInfo,
  RESTDataCard,
  RESTDataCardResponse,
  RESTDataCardCreateRequest,
  RESTDataCardModifyRequest,
  ApiResponse,
  RESTDataCardElement,
  RESTValueElement,
} from '../types/efecte.js';

// Cache for template info used in search
const templateInfoCache = new Cache<RESTTemplateInfo>('template-info-search');

/**
 * Schema for listing data cards with pagination and filtering
 */
const ListDataCardsSchema = z.object({
  templateCode: z.string().describe('Template code to fetch data cards for'),
  filter: z.string().optional().describe('EQL filter expression. Use $attribute_name$ syntax for attributes. Examples: $status$ = \'02 - Solving\', $support_group$ = \'IT Support\', $customer$ = \'John Doe\''),
  dataCards: z.boolean().optional().default(false).describe('Whether to get full data cards or simple info'),
  selectedAttributes: z.string().optional().describe('Comma-separated list of attributes to return'),
  limit: z.number().optional().default(50).describe('Page size limit (1-200)'),
  filterId: z.number().optional().describe('Only show data cards with IDs lower than this'),
  summary: z.boolean().optional().default(false).describe('Return summary with key fields only (useful for large responses)'),
});

/**
 * Schema for getting a single data card by ID
 */
const GetDataCardSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  selectedAttributes: z.string().optional().describe('Comma-separated list of attributes to return'),
});

/**
 * Schema for creating a new data card
 */
const CreateDataCardSchema = z.object({
  templateCode: z.string().describe('Template code'),
  folderCode: z.string().describe('Folder code'),
  data: z.record(z.string(), z.object({
    values: z.array(z.any()),
  })).optional().describe('Data card attributes'),
  createEmptyReferences: z.string().optional(),
  dataCards: z.boolean().optional().default(false),
});

/**
 * Schema for updating an existing data card
 */
const UpdateDataCardSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  folderCode: z.string().optional().describe('Folder code'),
  data: z.record(z.string(), z.object({
    values: z.array(z.any()),
  })).optional().describe('Data card attributes to update'),
  createEmptyReferences: z.string().optional(),
  dataCards: z.boolean().optional().default(false),
});

/**
 * Schema for deleting a data card (moves to trash)
 */
const DeleteDataCardSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
});

/**
 * Schema for getting a specific attribute value from a data card
 */
const GetAttributeSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  attributeCode: z.string().describe('Attribute code'),
});

/**
 * Schema for updating an attribute value (replaces existing values)
 */
const UpdateAttributeSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  attributeCode: z.string().describe('Attribute code'),
  values: z.array(z.any()).describe('New values for the attribute (replaces existing values)'),
});

/**
 * Schema for adding value(s) to a multi-value attribute (appends to existing values)
 */
const AddAttributeValueSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  attributeCode: z.string().describe('Attribute code'),
  values: z.array(z.any()).describe('Values to add to the attribute (for multi-value attributes)'),
});

/**
 * Schema for deleting/clearing an attribute value from a data card
 */
const DeleteAttributeValueSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  attributeCode: z.string().describe('Attribute code to clear'),
});

/**
 * Schema for searching across multiple templates in parallel
 */
const MultiTemplateSearchSchema = z.object({
  templateCodes: z.array(z.string()).min(1).describe('Array of template codes to search across'),
  filter: z.string().optional().describe('EQL filter expression (applied to all templates). Use $attribute_name$ syntax for attributes. Examples: $status$ = \'02 - Solving\', $support_group$ = \'IT Support\', $customer$ = \'John Doe\''),
  dataCards: z.boolean().optional().default(false).describe('Whether to get full data cards or simple info'),
  selectedAttributes: z.string().optional().describe('Comma-separated list of attributes to return'),
  limit: z.number().optional().default(50).describe('Page size limit per template (1-200)'),
});

/**
 * Schema for streaming data cards (for large datasets)
 */
const StreamDataCardsSchema = z.object({
  templateCode: z.string().describe('Template code'),
  filter: z.string().optional().describe('EQL filter expression. Use $attribute_name$ syntax for attributes. Examples: $status$ = \'02 - Solving\', $support_group$ = \'IT Support\', $customer$ = \'John Doe\''),
  dataCards: z.boolean().optional().default(false),
  selectedAttributes: z.string().optional(),
});

/**
 * Schema for simple text-based search
 */
const SearchDataCardsSchema = z.object({
  templateCode: z.string().describe('Template code to search in'),
  query: z.string().describe('Text search query - searches across common text fields (title, description, subject, name, etc.)'),
  searchFields: z.array(z.string()).optional().describe('Optional array of specific field names to search. If not provided, searches all text fields in the template'),
  limit: z.number().optional().default(200).describe('Maximum number of data cards to fetch before filtering (1-200)'),
  dataCards: z.boolean().optional().default(true).describe('Whether to return full data cards or simple info'),
});

export function registerDataCardTools() {
  return [
    {
      name: 'efecte_list_datacards',
      description: 'Get paginated list of data cards by template code. Supports EQL (Efecte Query Language) filtering. EQL syntax uses $attribute_name$ for attribute references. Examples: $status$ = \'02 - Solving\' (static value), $support_group$ = \'IT Support\' (reference by name), $customer$ = \'John Doe\' (reference by name), $created$ > \'2025-01-01\' (date comparison), $status$ = \'02 - Solving\' AND $priority$ = \'2. High\' (complex filter). For reference attributes like support_group or user, filter by the name of the referenced data card.',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code to fetch data cards for' },
          filter: { type: 'string', description: 'EQL filter expression. Use $attribute_name$ syntax for attributes. Examples: $status$ = \'02 - Solving\', $support_group$ = \'IT Support\', $customer$ = \'John Doe\', $created$ > \'2025-01-01\', $status$ = \'02 - Solving\' AND $priority$ = \'2. High\'' },
          dataCards: { type: 'boolean', description: 'Whether to get full data cards', default: false },
          selectedAttributes: { type: 'string', description: 'Comma-separated list of attributes' },
          limit: { type: 'number', description: 'Page size limit (1-200)', default: 50, minimum: 1, maximum: 200 },
          filterId: { type: 'number', description: 'Only show data cards with IDs lower than this' },
          summary: { type: 'boolean', description: 'Return summary with key fields only (useful for large responses)', default: false },
        },
        required: ['templateCode'],
      },
    },
    {
      name: 'efecte_get_datacard',
      description: 'Get a single data card by ID',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          selectedAttributes: { type: 'string', description: 'Comma-separated list of attributes' },
        },
        required: ['templateCode', 'dataCardId'],
      },
    },
    {
      name: 'efecte_create_datacard',
      description: 'Create a new data card',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          folderCode: { type: 'string', description: 'Folder code' },
          data: { type: 'object', description: 'Data card attributes' },
          createEmptyReferences: { type: 'string' },
          dataCards: { type: 'boolean', default: false },
        },
        required: ['templateCode', 'folderCode'],
      },
    },
    {
      name: 'efecte_update_datacard',
      description: 'Update an existing data card',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          folderCode: { type: 'string', description: 'Folder code' },
          data: { type: 'object', description: 'Data card attributes to update' },
          createEmptyReferences: { type: 'string' },
          dataCards: { type: 'boolean', default: false },
        },
        required: ['templateCode', 'dataCardId'],
      },
    },
    {
      name: 'efecte_delete_datacard',
      description: 'Delete a data card (move to trash)',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
        },
        required: ['templateCode', 'dataCardId'],
      },
    },
    {
      name: 'efecte_get_attribute',
      description: 'Get a specific attribute value from a data card',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          attributeCode: { type: 'string', description: 'Attribute code' },
        },
        required: ['templateCode', 'dataCardId', 'attributeCode'],
      },
    },
    {
      name: 'efecte_update_attribute',
      description: 'Update a specific attribute value in a data card (replaces existing values)',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          attributeCode: { type: 'string', description: 'Attribute code' },
          values: { type: 'array', description: 'New values for the attribute (replaces existing)', items: {} },
        },
        required: ['templateCode', 'dataCardId', 'attributeCode', 'values'],
      },
    },
    {
      name: 'efecte_add_attribute_value',
      description: 'Add value(s) to a multi-value attribute in a data card (appends to existing values)',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          attributeCode: { type: 'string', description: 'Attribute code' },
          values: { type: 'array', description: 'Values to add to the attribute', items: {} },
        },
        required: ['templateCode', 'dataCardId', 'attributeCode', 'values'],
      },
    },
    {
      name: 'efecte_delete_attribute_value',
      description: 'Delete/clear an attribute value from a data card',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          attributeCode: { type: 'string', description: 'Attribute code to clear' },
        },
        required: ['templateCode', 'dataCardId', 'attributeCode'],
      },
    },
    {
      name: 'efecte_search_multiple_templates',
      description: 'Search for data cards across multiple templates in parallel. Returns aggregated results with template attribution. Supports EQL (Efecte Query Language) filtering. EQL syntax uses $attribute_name$ for attribute references. Examples: $status$ = \'02 - Solving\' (static value), $support_group$ = \'IT Support\' (reference by name), $customer$ = \'John Doe\' (reference by name), $created$ > \'2025-01-01\' (date comparison). For reference attributes like support_group or user, filter by the name of the referenced data card. The filter is applied to all specified templates.',
      inputSchema: {
        type: 'object',
        properties: {
          templateCodes: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Array of template codes to search across',
            minItems: 1,
          },
          filter: { type: 'string', description: 'EQL filter expression (applied to all templates). Use $attribute_name$ syntax for attributes. Examples: $status$ = \'02 - Solving\', $support_group$ = \'IT Support\', $customer$ = \'John Doe\', $created$ > \'2025-01-01\', $status$ = \'02 - Solving\' AND $priority$ = \'2. High\'' },
          dataCards: { type: 'boolean', description: 'Whether to get full data cards', default: false },
          selectedAttributes: { type: 'string', description: 'Comma-separated list of attributes' },
          limit: { type: 'number', description: 'Page size limit per template (1-200)', default: 50, minimum: 1, maximum: 200 },
        },
        required: ['templateCodes'],
      },
    },
    {
      name: 'efecte_stream_datacards',
      description: 'Stream all data cards (for large datasets). Supports EQL (Efecte Query Language) filtering. EQL syntax uses $attribute_name$ for attribute references. Examples: $status$ = \'02 - Solving\' (static value), $support_group$ = \'IT Support\' (reference by name), $customer$ = \'John Doe\' (reference by name), $created$ > \'2025-01-01\' (date comparison). For reference attributes like support_group or user, filter by the name of the referenced data card.',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          filter: { type: 'string', description: 'EQL filter expression. Use $attribute_name$ syntax for attributes. Examples: $status$ = \'02 - Solving\', $support_group$ = \'IT Support\', $customer$ = \'John Doe\', $created$ > \'2025-01-01\', $status$ = \'02 - Solving\' AND $priority$ = \'2. High\'' },
          dataCards: { type: 'boolean', description: 'Whether to get full data cards', default: false },
          selectedAttributes: { type: 'string', description: 'Comma-separated list of attributes' },
        },
        required: ['templateCode'],
      },
    },
    {
      name: 'efecte_search_datacards',
      description: 'Simple text-based search across data cards. Searches in common text fields (title, description, subject, name, etc.) without requiring EQL syntax. This tool fetches data cards and filters them client-side, making it easy to search without knowing exact attribute names. Note: For better performance with very large datasets, consider using efecte_list_datacards with EQL filters if you know the specific attributes.',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code to search in' },
          query: { type: 'string', description: 'Text search query - searches across common text fields (case-insensitive, partial matching). Single word or quoted phrase matches exact substring. Multiple words use AND logic (all words must be present). Example: "github context" (exact phrase) or github context (both words anywhere)' },
          searchFields: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Optional array of specific field names to search. If not provided, searches all text fields in the template' 
          },
          limit: { type: 'number', description: 'Maximum number of data cards to fetch before filtering (1-200)', default: 200, minimum: 1, maximum: 200 },
          dataCards: { type: 'boolean', description: 'Whether to return full data cards', default: true },
        },
        required: ['templateCode', 'query'],
      },
    },
  ];
}

/**
 * Summarize data cards to include only key fields
 * Reduces response size for large datasets
 */
function summarizeDataCards(data: RESTPaginatedDataCardsInfo): RESTPaginatedDataCardsInfo {
  const summarized = {
    meta: data.meta,
    data: data.data.map((item: any) => {
      // Extract key fields
      const summary: any = {
        name: item.name,
        dataCardId: item.dataCardId,
        templateName: item.templateName,
        templateCode: item.templateCode,
      };

      // If full data cards are included, extract key fields
      if (item.data) {
        const keyFields: any = {};
        
        // Common key fields to include
        const fieldsToInclude = ['status', 'title', 'priority', 'created', 'updated'];
        for (const field of fieldsToInclude) {
          if (item.data[field]) {
            keyFields[field] = item.data[field];
          }
        }

        // Include reference fields (simplified)
        for (const [key, value] of Object.entries(item.data)) {
          if (value && typeof value === 'object' && 'type' in value && value.type === 'reference') {
            const refValue = (value as RESTDataCardElement).values?.[0];
            if (refValue && 'name' in refValue) {
              keyFields[key] = {
                type: 'reference',
                values: [{ name: refValue.name }],
              };
            }
          }
        }

        summary.data = keyFields;
      }

      return summary;
    }),
  };

  return summarized;
}

/**
 * Estimate the size of a response in bytes (rough approximation)
 */
function estimateResponseSize(data: any): number {
  return JSON.stringify(data).length;
}

/**
 * List data cards for a specific template with pagination and filtering
 * @param args - List data cards parameters
 * @returns Paginated list of data cards
 */
async function listDataCards(args: z.infer<typeof ListDataCardsSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    const limit = Math.min(Math.max(args.limit || efecteConfig.pagination.defaultLimit, 1), efecteConfig.pagination.maxLimit);
    
    const params: Record<string, string | number | boolean> = { limit };
    if (args.filter) {
      logger.debug(`Applying EQL filter: ${args.filter}`);
      params.filter = args.filter;
    }
    if (args.dataCards !== undefined) params.dataCards = args.dataCards;
    if (args.selectedAttributes) params.selectedAttributes = args.selectedAttributes;
    if (args.filterId) params.filterId = args.filterId;

    const result = await apiClient.get<RESTPaginatedDataCardsInfo>(
      `dc/${args.templateCode}/data`,
      { params }
    );

    // Check response size and summarize if needed
    const responseSize = estimateResponseSize(result);
    const maxResponseSize = 200 * 1024; // 200KB threshold
    
    if ((args.summary || responseSize > maxResponseSize) && args.dataCards) {
      logger.info(`Response size ${responseSize} bytes exceeds threshold or summary requested, summarizing...`);
      return summarizeDataCards(result);
    }
    
    return result;
  } catch (error: unknown) {
    // Enhanced error handling for 400 errors with reference attributes
    if (isBadRequestError(error) && args.filter) {
      const filterInfo = extractReferenceAttributeFromFilter(args.filter);
      
      if (filterInfo) {
        try {
          // Try to get the reference template for this attribute
          const referenceTemplateCode = await getReferenceTemplateCode(
            filterInfo.attribute,
            args.templateCode
          );

          if (referenceTemplateCode) {
            // Get available values from the reference template
            const availableValues = await listReferenceValues(referenceTemplateCode);
            
            if (availableValues.length > 0) {
              // Try to find a similar match
              const suggestion = findSimilarMatch(filterInfo.value, availableValues);
              
              // Build helpful error message
              let errorMessage = `Filter failed: Invalid value "${filterInfo.value}" for attribute "${filterInfo.attribute}".\n\n`;
              errorMessage += `Available ${filterInfo.attribute.replace(/_/g, ' ')}s:\n`;
              availableValues.slice(0, 20).forEach(value => {
                errorMessage += `- ${value}\n`;
              });
              if (availableValues.length > 20) {
                errorMessage += `... and ${availableValues.length - 20} more\n`;
              }
              
              if (suggestion) {
                errorMessage += `\nDid you mean "${suggestion}"?`;
              }
              
              logger.error('List data cards failed with invalid reference value', {
                attribute: filterInfo.attribute,
                attemptedValue: filterInfo.value,
                availableValues: availableValues.length,
                suggestion,
              });
              
              throw new Error(errorMessage);
            }
          }
        } catch (refError) {
          // If we can't get reference values, fall through to generic error
          logger.debug('Failed to get reference values for error message', refError);
        }
      }
    }

    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('List data cards failed', error);
    const filterInfo = args.filter ? ` with filter "${args.filter}"` : '';
    throw new Error(`Failed to list data cards${filterInfo}: ${errorMessage}`);
  }
}

async function getDataCard(args: z.infer<typeof GetDataCardSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    const params: Record<string, string> = {};
    if (args.selectedAttributes) params.selectedAttributes = args.selectedAttributes;

    const result = await apiClient.get<RESTDataCard>(
      `dc/${args.templateCode}/data/${args.dataCardId}`,
      { params }
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Get data card failed', error);
    throw new Error(`Failed to get data card: ${errorMessage}`);
  }
}

async function createDataCard(args: z.infer<typeof CreateDataCardSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateNonEmpty(args.folderCode, 'Folder code');
    const params: Record<string, string | boolean> = {};
    if (args.createEmptyReferences) params.createEmptyReferences = args.createEmptyReferences;
    if (args.dataCards !== undefined) params.dataCards = args.dataCards;

    const body: RESTDataCardCreateRequest = {
      folderCode: args.folderCode,
      data: args.data as { [key: string]: { values: RESTValueElement[] } } | undefined,
    };

    const result = await apiClient.post<RESTDataCardResponse>(
      `dc/${args.templateCode}/data`,
      body,
      { params }
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Create data card failed', error);
    throw new Error(`Failed to create data card: ${errorMessage}`);
  }
}

async function updateDataCard(args: z.infer<typeof UpdateDataCardSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    if (args.folderCode) {
      validateNonEmpty(args.folderCode, 'Folder code');
    }
    const params: Record<string, string | boolean> = {};
    if (args.createEmptyReferences) params.createEmptyReferences = args.createEmptyReferences;
    if (args.dataCards !== undefined) params.dataCards = args.dataCards;

    const body: RESTDataCardModifyRequest = {
      dataCardId: args.dataCardId,
      folderCode: args.folderCode,
      data: args.data as { [key: string]: { values: RESTValueElement[] } } | undefined,
    };

    const result = await apiClient.patch<RESTDataCardResponse>(
      `dc/${args.templateCode}/data/${args.dataCardId}`,
      body,
      { params }
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Update data card failed', error);
    throw new Error(`Failed to update data card: ${errorMessage}`);
  }
}

async function deleteDataCard(args: z.infer<typeof DeleteDataCardSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    const result = await apiClient.delete<ApiResponse>(
      `dc/${args.templateCode}/data/${args.dataCardId}`
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Delete data card failed', error);
    throw new Error(`Failed to delete data card: ${errorMessage}`);
  }
}

async function getAttribute(args: z.infer<typeof GetAttributeSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    validateAttributeCode(args.attributeCode);
    const result = await apiClient.get<RESTDataCardElement>(
      `dc/${args.templateCode}/data/${args.dataCardId}/${args.attributeCode}`
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Get attribute failed', error);
    throw new Error(`Failed to get attribute: ${errorMessage}`);
  }
}

async function updateAttribute(args: z.infer<typeof UpdateAttributeSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    validateAttributeCode(args.attributeCode);
    const body = {
      values: args.values,
    };

    const result = await apiClient.put<ApiResponse>(
      `dc/${args.templateCode}/data/${args.dataCardId}/${args.attributeCode}`,
      body
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Update attribute failed', error);
    throw new Error(`Failed to update attribute: ${errorMessage}`);
  }
}

/**
 * Add value(s) to a multi-value attribute (appends to existing values)
 * Use this for adding additional values to attributes that support multiple values
 * @param args - Add attribute value parameters
 * @returns Success response with operation details
 */
async function addAttributeValue(args: z.infer<typeof AddAttributeValueSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    validateAttributeCode(args.attributeCode);
    const body = {
      values: args.values,
    };

    const result = await apiClient.post<ApiResponse>(
      `dc/${args.templateCode}/data/${args.dataCardId}/${args.attributeCode}`,
      body
    );
    
    return {
      success: true,
      message: `Added ${args.values.length} value(s) to attribute ${args.attributeCode}`,
      response: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Add attribute value failed', error);
    throw new Error(`Failed to add attribute value: ${errorMessage}`);
  }
}

/**
 * Delete/clear an attribute value from a data card
 * @param args - Delete attribute value parameters
 * @returns Success response with operation details
 */
async function deleteAttributeValue(args: z.infer<typeof DeleteAttributeValueSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    validateAttributeCode(args.attributeCode);
    const result = await apiClient.delete<ApiResponse>(
      `dc/${args.templateCode}/data/${args.dataCardId}/${args.attributeCode}`
    );
    
    return {
      success: true,
      message: `Attribute ${args.attributeCode} cleared successfully`,
      response: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Delete attribute value failed', error);
    throw new Error(`Failed to delete attribute value: ${errorMessage}`);
  }
}

/**
 * Search for data cards across multiple templates in parallel
 * Executes searches concurrently and aggregates results with template attribution
 * @param args - Multi-template search parameters
 * @returns Aggregated results with successful and failed template searches
 */
async function searchMultipleTemplates(args: z.infer<typeof MultiTemplateSearchSchema>) {
  try {
    // Validate all template codes
    args.templateCodes.forEach(templateCode => validateTemplateCode(templateCode));
    
    const limit = Math.min(Math.max(args.limit || efecteConfig.pagination.defaultLimit, 1), efecteConfig.pagination.maxLimit);
    
    // Log filter if provided
    if (args.filter) {
      logger.debug(`Applying EQL filter to ${args.templateCodes.length} template(s): ${args.filter}`);
    }
    
    // Execute searches in parallel
    const searchPromises = args.templateCodes.map(async (templateCode): Promise<{ templateCode: string; success: true; data: RESTPaginatedDataCardsInfo } | { templateCode: string; success: false; error: string }> => {
      const params: Record<string, string | number | boolean> = { limit };
      if (args.filter) params.filter = args.filter;
      if (args.dataCards !== undefined) params.dataCards = args.dataCards;
      if (args.selectedAttributes) params.selectedAttributes = args.selectedAttributes;

      try {
        const result = await apiClient.get<RESTPaginatedDataCardsInfo>(
          `dc/${templateCode}/data`,
          { params }
        );
        return {
          templateCode,
          success: true as const,
          data: result,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const filterInfo = args.filter ? ` with filter "${args.filter}"` : '';
        logger.warn(`Search failed for template ${templateCode}${filterInfo}:`, error);
        return {
          templateCode,
          success: false as const,
          error: errorMessage,
        };
      }
    });

    const results = await Promise.allSettled(searchPromises);
    
    // Aggregate results
    const aggregated: {
      successful: Array<{ templateCode: string; data: RESTPaginatedDataCardsInfo }>;
      failed: Array<{ templateCode: string; error: string }>;
      totalTemplates: number;
      successfulTemplates: number;
      failedTemplates: number;
    } = {
      successful: [],
      failed: [],
      totalTemplates: args.templateCodes.length,
      successfulTemplates: 0,
      failedTemplates: 0,
    };

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          aggregated.successful.push({
            templateCode: result.value.templateCode,
            data: result.value.data,
          });
          aggregated.successfulTemplates++;
        } else {
          aggregated.failed.push({
            templateCode: result.value.templateCode,
            error: result.value.error,
          });
          aggregated.failedTemplates++;
        }
      } else {
        // This shouldn't happen since we catch errors in the promise, but handle it anyway
        aggregated.failedTemplates++;
      }
    }

    return aggregated;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Multi-template search failed', error);
    throw new Error(`Failed to search multiple templates: ${errorMessage}`);
  }
}

async function streamDataCards(args: z.infer<typeof StreamDataCardsSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    const params: Record<string, string | boolean> = {};
    if (args.filter) {
      logger.debug(`Applying EQL filter: ${args.filter}`);
      params.filter = args.filter;
    }
    if (args.dataCards !== undefined) params.dataCards = args.dataCards;
    if (args.selectedAttributes) params.selectedAttributes = args.selectedAttributes;

    const result = await apiClient.get<RESTPaginatedDataCardsInfo>(
      `dc/${args.templateCode}/data/stream`,
      { params }
    );
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Stream data cards failed', error);
    const filterInfo = args.filter ? ` with filter "${args.filter}"` : '';
    throw new Error(`Failed to stream data cards${filterInfo}: ${errorMessage}`);
  }
}

/**
 * Simple text-based search across data cards
 * Fetches data cards and filters them client-side by searching in text fields
 * @param args - Search parameters
 * @returns Filtered list of data cards matching the search query
 */
async function searchDataCards(args: z.infer<typeof SearchDataCardsSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateNonEmpty(args.query, 'Search query');
    
    const limit = Math.min(Math.max(args.limit || 200, 1), efecteConfig.pagination.maxLimit);
    
    logger.info(`Searching data cards in template ${args.templateCode} for query: "${args.query}"`);
    
    // Get template definition to identify text fields
    let templateInfo = templateInfoCache.get(args.templateCode);
    if (!templateInfo) {
      logger.debug(`Fetching template info for ${args.templateCode} to identify text fields`);
      templateInfo = await apiClient.get<RESTTemplateInfo>(`dc/${args.templateCode}`);
      templateInfoCache.set(args.templateCode, templateInfo, efecteConfig.caching.templatesTTL);
    }
    
    // Determine which fields to search
    let searchFields: string[];
    if (args.searchFields && args.searchFields.length > 0) {
      // Use specified fields
      searchFields = args.searchFields;
    } else {
      // Get all text fields from template
      const templateTextFields = getTextFieldsFromTemplate(templateInfo);
      const commonFields = getCommonTextFields();
      
      // Combine template fields with common fields, removing duplicates
      const allFields = new Set([...commonFields, ...templateTextFields]);
      searchFields = Array.from(allFields);
    }
    
    if (searchFields.length === 0) {
      logger.warn(`No text fields found in template ${args.templateCode} for searching. Will only search in name and dataCardId.`);
    }
    
    logger.debug(`Searching in fields: ${searchFields.join(', ')}`);
    
    // Fetch data cards from API
    const params: Record<string, string | number | boolean> = { 
      limit,
      dataCards: args.dataCards !== undefined ? args.dataCards : true,
    };
    
    const result = await apiClient.get<RESTPaginatedDataCardsInfo>(
      `dc/${args.templateCode}/data`,
      { params }
    );
    
    // Filter results client-side
    const filtered = filterDataCardsByText(result, args.query, searchFields);
    
    logger.info(`Search returned ${filtered.data.length} matching data cards out of ${result.data.length} fetched`);
    
    return filtered;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Search data cards failed', error);
    throw new Error(`Failed to search data cards: ${errorMessage}`);
  }
}

export const tools = {
  efecte_list_datacards: listDataCards,
  efecte_get_datacard: getDataCard,
  efecte_create_datacard: createDataCard,
  efecte_update_datacard: updateDataCard,
  efecte_delete_datacard: deleteDataCard,
  efecte_get_attribute: getAttribute,
  efecte_update_attribute: updateAttribute,
  efecte_add_attribute_value: addAttributeValue,
  efecte_delete_attribute_value: deleteAttributeValue,
  efecte_search_multiple_templates: searchMultipleTemplates,
  efecte_stream_datacards: streamDataCards,
  efecte_search_datacards: searchDataCards,
};