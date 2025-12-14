import { RESTTemplateInfo, RESTDataCard, RESTPaginatedDataCardsInfo, RESTDataCardElement } from '../types/efecte.js';

/**
 * Get common text field names that are typically searchable
 * These are field names that commonly appear across different templates
 */
export function getCommonTextFields(): string[] {
  return [
    'title',
    'subject',
    'name',
    'description',
    'primary_id',
    'summary',
    'details',
    'notes',
    'comment',
    'text',
  ];
}

/**
 * Extract all string/text type fields from a template definition
 * Returns an array of attribute codes that are of type 'string'
 */
export function getTextFieldsFromTemplate(templateInfo: RESTTemplateInfo): string[] {
  const textFields: string[] = [];
  
  if (!templateInfo.attributes) {
    return textFields;
  }
  
  for (const [attributeCode, attribute] of Object.entries(templateInfo.attributes)) {
    // Include string type attributes
    if (attribute && attribute.type === 'string') {
      textFields.push(attributeCode);
    }
  }
  
  return textFields;
}

/**
 * Extract text value from a data card element
 * Handles different data structures and returns the text value as a string
 */
function extractTextValue(element: RESTDataCardElement | undefined): string {
  if (!element || !element.values || element.values.length === 0) {
    return '';
  }
  
  // Get the first value
  const firstValue = element.values[0];
  
  // Extract text from value object
  if (firstValue.value !== undefined && firstValue.value !== null) {
    return String(firstValue.value);
  }
  
  if (firstValue.name !== undefined && firstValue.name !== null) {
    return String(firstValue.name);
  }
  
  return '';
}

/**
 * Check if a data card matches the search query
 * Supports both exact phrase matching and multi-word AND logic
 * - Single word or quoted phrase: exact substring match
 * - Multiple words: all words must be present (AND logic)
 */
export function searchInDataCard(
  dataCard: RESTDataCard | any,
  query: string,
  searchFields: string[]
): boolean {
  if (!query || query.trim().length === 0) {
    return true; // Empty query matches all
  }
  
  const trimmedQuery = query.trim();
  
  // Check if query is a quoted phrase (exact match)
  const quotedMatch = trimmedQuery.match(/^["'](.+)["']$/);
  let searchTerms: string[];
  let isExactPhrase = false;
  
  if (quotedMatch) {
    // Quoted phrase: exact match
    searchTerms = [quotedMatch[1].toLowerCase()];
    isExactPhrase = true;
  } else {
    // Split by whitespace and filter out empty strings
    const words = trimmedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 1) {
      // Single word: exact substring match
      searchTerms = words;
      isExactPhrase = true;
    } else {
      // Multiple words: AND logic (all words must be present)
      searchTerms = words;
      isExactPhrase = false;
    }
  }
  
  // Collect all searchable text from the data card
  const searchableTexts: string[] = [];
  
  // Search in the data card's data object (only if dataCards: true was used)
  if (dataCard.data && typeof dataCard.data === 'object') {
    for (const field of searchFields) {
      const fieldData = dataCard.data[field];
      if (fieldData) {
        const textValue = extractTextValue(fieldData as RESTDataCardElement);
        if (textValue) {
          searchableTexts.push(textValue.toLowerCase());
        }
      }
    }
  }
  
  // Also search in the data card name/id if available (works for both dataCards: true and false)
  if (dataCard.name) {
    searchableTexts.push(dataCard.name.toLowerCase());
  }
  
  if (dataCard.dataCardId) {
    searchableTexts.push(String(dataCard.dataCardId).toLowerCase());
  }
  
  // Combine all searchable text
  const combinedText = searchableTexts.join(' ');
  
  // Perform the search
  if (isExactPhrase) {
    // Exact phrase match: check if the phrase appears anywhere in the combined text
    return combinedText.includes(searchTerms[0]);
  } else {
    // Multi-word AND logic: all words must be present
    return searchTerms.every(term => combinedText.includes(term));
  }
}

/**
 * Filter data cards by searching in text fields
 * Returns a new array with only matching data cards
 */
export function filterDataCardsByText(
  dataCards: RESTPaginatedDataCardsInfo,
  query: string,
  searchFields: string[]
): RESTPaginatedDataCardsInfo {
  if (!query || query.trim().length === 0) {
    return dataCards; // Empty query returns all
  }
  
  const filtered = dataCards.data.filter((dataCard: any) => 
    searchInDataCard(dataCard, query, searchFields)
  );
  
  return {
    meta: {
      ...dataCards.meta,
      count: filtered.length,
    },
    data: filtered,
  };
}
