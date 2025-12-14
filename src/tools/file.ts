import { z } from 'zod';
import { apiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { validateTemplateCode, validateDataCardId, validateAttributeCode, validateFileSize, validateNonEmpty } from '../utils/validation.js';

const UploadFileSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  attributeCode: z.string().describe('Attribute code for the file'),
  fileContent: z.string().describe('Base64 encoded file content'),
  fileName: z.string().describe('Name of the file'),
  mimeType: z.string().optional().describe('MIME type of the file'),
});

const DownloadFileSchema = z.object({
  templateCode: z.string().describe('Template code'),
  dataCardId: z.string().describe('Data card ID'),
  attributeCode: z.string().describe('Attribute code for the file'),
  location: z.string().describe('Location/ID of the file to download'),
});

export function registerFileTools() {
  return [
    {
      name: 'efecte_upload_file',
      description: 'Upload a file attachment to a data card',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          attributeCode: { type: 'string', description: 'Attribute code for the file' },
          fileContent: { type: 'string', description: 'Base64 encoded file content' },
          fileName: { type: 'string', description: 'Name of the file' },
          mimeType: { type: 'string', description: 'MIME type of the file' },
        },
        required: ['templateCode', 'dataCardId', 'attributeCode', 'fileContent', 'fileName'],
      },
    },
    {
      name: 'efecte_download_file',
      description: 'Download a file attachment from a data card',
      inputSchema: {
        type: 'object',
        properties: {
          templateCode: { type: 'string', description: 'Template code' },
          dataCardId: { type: 'string', description: 'Data card ID' },
          attributeCode: { type: 'string', description: 'Attribute code for the file' },
          location: { type: 'string', description: 'Location/ID of the file' },
        },
        required: ['templateCode', 'dataCardId', 'attributeCode', 'location'],
      },
    },
  ];
}

async function uploadFile(args: z.infer<typeof UploadFileSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    validateAttributeCode(args.attributeCode);
    validateNonEmpty(args.fileName, 'File name');
    validateNonEmpty(args.fileContent, 'File content');
    
    logger.info(`Uploading file: ${args.fileName} to datacard ${args.dataCardId}`);
    
    const fileBuffer = Buffer.from(args.fileContent, 'base64');
    validateFileSize(fileBuffer.length);
    
    const result = await apiClient.uploadFile(
      `dc/${args.templateCode}/data/${args.dataCardId}/${args.attributeCode}/file`,
      fileBuffer,
      args.fileName,
      args.mimeType
    );
    
    return {
      success: true,
      message: `File ${args.fileName} uploaded successfully`,
      response: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('File upload failed', error);
    throw new Error(`Failed to upload file: ${errorMessage}`);
  }
}

async function downloadFile(args: z.infer<typeof DownloadFileSchema>) {
  try {
    validateTemplateCode(args.templateCode);
    validateDataCardId(args.dataCardId);
    validateAttributeCode(args.attributeCode);
    validateNonEmpty(args.location, 'File location');
    
    logger.info(`Downloading file from datacard ${args.dataCardId}`);
    
    const fileBuffer = await apiClient.downloadFile(
      `dc/${args.templateCode}/data/${args.dataCardId}/${args.attributeCode}/file/${args.location}`
    );
    
    return {
      success: true,
      message: 'File downloaded successfully',
      fileContent: fileBuffer.toString('base64'),
      size: fileBuffer.length,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('File download failed', error);
    throw new Error(`Failed to download file: ${errorMessage}`);
  }
}

export const tools = {
  efecte_upload_file: uploadFile,
  efecte_download_file: downloadFile,
};