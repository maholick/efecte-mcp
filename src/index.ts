#!/usr/bin/env node

import { mcpServer } from './server.js';
import { logger } from './utils/logger.js';
import { startCacheCleanup, stopCacheCleanup } from './utils/cache.js';
import { efecteConfig } from './utils/config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

function printBanner(): void {
  const baseUrl = efecteConfig.baseUrl.length > 60 
    ? efecteConfig.baseUrl.substring(0, 57) + '...'
    : efecteConfig.baseUrl;
  
  const banner = `                                                                                
============================================
EFECTE MCP (Model Context Protocol Server)
============================================
📦 Version:       ${VERSION}
🚀 Transport:     STDIO
🏢 Base URL:      ${baseUrl}

📦 Package:       efecte-mcp
👤 Author:        Shawn Maholick
🌍 Repository:    https://github.com/maholick/efecte-mcp
============================================
`;
  // Use console.error to ensure it goes to stderr (Docker logs)
  console.error(banner);
}

async function main() {
  try {
    printBanner();
    logger.info('Efecte MCP Server starting...');
    
    // Start cache cleanup scheduler
    startCacheCleanup();
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      stopCacheCleanup();
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      stopCacheCleanup();
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      stopCacheCleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', { promise, reason });
      stopCacheCleanup();
      process.exit(1);
    });

    await mcpServer.start();
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    stopCacheCleanup();
    process.exit(1);
  }
}

main();