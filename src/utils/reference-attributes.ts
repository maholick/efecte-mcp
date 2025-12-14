import axios from 'axios';
import { apiClient } from '../api/client.js';
import { logger } from './logger.js';
import { RESTTemplateInfo, RESTPaginatedDataCardsInfo } from '../types/efecte.js';
import { Cache } from './cache.js';
import { efecteConfig } from './config.js';

// Cache for template info and reference values
const templateInfoCache = new Cache<RESTTemplateInfo>('template-info-refs');
const referenceValuesCache = new Cache<string[]>('reference-values');

/**
 * Extract reference attribute and value from an EQL filter expression
 * Examples:
 *   "$support_group$ = 'IT Support'" -> { attribute: "support_group", value: "IT Support" }
 *   "$customer$ = 'John Doe'" -> { attribute: "customer", value: "John Doe" }
 */
export function extractReferenceAttributeFromFilter(filter: string): { attribute: string; value: string } | null {
  // Match patterns like $attribute_name$ = 'value' or $attribute_name$ = "value"
  const match = filter.match(/\$([^$]+)\$\s*=\s*['"]([^'"]+)['"]/);
  if (match) {
    return {
      attribute: match[1],
      value: match[2],
    };
  }
  return null;
}

/**
 * Get the reference template code for a given attribute
 * Returns the template code that the attribute references, or null if not a reference attribute
 */
export async function getReferenceTemplateCode(
  attributeCode: string,
  templateCode: string
): Promise<string | null> {
  try {
    // Get template info (use cache if available)
    let templateInfo = templateInfoCache.get(templateCode);
    
    if (!templateInfo) {
      logger.debug(`Fetching template info for ${templateCode} to check attribute ${attributeCode}`);
      templateInfo = await apiClient.get<RESTTemplateInfo>(`dc/${templateCode}`);
      templateInfoCache.set(templateCode, templateInfo, efecteConfig.caching.templatesTTL);
    }

    const attribute = templateInfo.attributes[attributeCode];
    if (!attribute) {
      return null;
    }

    // Check if it's a reference type attribute
    if (attribute.type === 'reference' && attribute.target && attribute.target.length > 0) {
      // Return the first target template (most common case)
      return attribute.target[0];
    }

    return null;
  } catch (error) {
    logger.error(`Failed to get reference template code for attribute ${attributeCode}`, error);
    return null;
  }
}

/**
 * List all available values (names) for a reference template
 * Returns an array of names from data cards in the reference template
 */
export async function listReferenceValues(referenceTemplateCode: string, limit: number = 200): Promise<string[]> {
  const cacheKey = `${referenceTemplateCode}:${limit}`;
  
  // Check cache first
  const cached = referenceValuesCache.get(cacheKey);
  if (cached) {
    logger.debug(`Returning cached reference values for ${referenceTemplateCode}`);
    return cached;
  }

  try {
    logger.debug(`Fetching reference values from template ${referenceTemplateCode}`);
    
    // Fetch data cards from the reference template
    const result = await apiClient.get<RESTPaginatedDataCardsInfo>(
      `dc/${referenceTemplateCode}/data`,
      { 
        params: { 
          limit: Math.min(limit, 200),
          dataCards: true 
        } 
      }
    );

    // Extract names from the data cards
    const names: string[] = [];
    
    for (const dataCard of result.data) {
      // The name is typically in the 'name' field of the dataCard
      if (dataCard.name) {
        names.push(dataCard.name);
      } else if ('data' in dataCard) {
        // If dataCards=true, check the data structure
        const cardData = (dataCard as any).data;
        // Try common name fields
        if (cardData?.name?.values?.[0]?.value) {
          names.push(cardData.name.values[0].value);
        } else if (cardData?.primary_id?.values?.[0]?.value) {
          names.push(cardData.primary_id.values[0].value);
        } else if (cardData?.title?.values?.[0]?.value) {
          names.push(cardData.title.values[0].value);
        }
      }
    }

    // Cache the results for 5 minutes
    referenceValuesCache.set(cacheKey, names, 5 * 60 * 1000);
    
    return names;
  } catch (error) {
    logger.error(`Failed to list reference values for template ${referenceTemplateCode}`, error);
    return [];
  }
}

/**
 * Find the most similar match from a list of options using Levenshtein distance
 * Returns the best match if similarity is above threshold, otherwise null
 */
export function findSimilarMatch(target: string, options: string[], threshold: number = 0.6): string | null {
  if (options.length === 0) {
    return null;
  }

  const targetLower = target.toLowerCase();
  
  // First, try exact case-insensitive match
  const exactMatch = options.find(opt => opt.toLowerCase() === targetLower);
  if (exactMatch) {
    return exactMatch;
  }

  // Try substring match (contains)
  const substringMatch = options.find(opt => 
    opt.toLowerCase().includes(targetLower) || targetLower.includes(opt.toLowerCase())
  );
  if (substringMatch) {
    return substringMatch;
  }

  // Calculate Levenshtein distance for all options
  const similarities = options.map(option => {
    const similarity = calculateSimilarity(targetLower, option.toLowerCase());
    return { option, similarity };
  });

  // Sort by similarity (highest first)
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Return the best match if it's above threshold
  if (similarities[0].similarity >= threshold) {
    return similarities[0].option;
  }

  return null;
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 and 1, where 1 is identical
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLength;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Check if an error is a 400 Bad Request error from Axios
 */
export function isBadRequestError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 400;
  }
  return false;
}

