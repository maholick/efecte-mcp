#!/usr/bin/env node

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file
config();

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

// Override transport settings for HTTP mode
process.env.EFECTE_TRANSPORT_DEFAULT = 'http';
process.env.EFECTE_TRANSPORT_HTTP_ENABLED = 'true';
// Always default to 0.0.0.0 for HTTP mode (Docker/container compatibility)
// Users can still override via environment variable if needed
if (!process.env.EFECTE_TRANSPORT_HTTP_HOST) {
  process.env.EFECTE_TRANSPORT_HTTP_HOST = '0.0.0.0';
}

import { httpServer } from './server-http.js';
import { logger } from './utils/logger.js';
import { efecteConfig } from './utils/config.js';
import { startCacheCleanup, stopCacheCleanup } from './utils/cache.js';

function printBanner(port: number, host: string): void {
  const baseUrl = efecteConfig.baseUrl.length > 60 
    ? efecteConfig.baseUrl.substring(0, 57) + '...'
    : efecteConfig.baseUrl;
  
  const healthUrl = `http://${host}:${port}/health`;
  const mcpUrl = `http://${host}:${port}/mcp`;
  
  const banner = `                                                                                
============================================
EFECTE MCP (Model Context Protocol Server)
============================================
📦 Version:       ${VERSION}
🚀 Transport:     Streamable HTTP
🌐 Host:          ${host}
🔌 Port:          ${port}
📡 Health Check:  ${healthUrl}
🔗 MCP Endpoint:  ${mcpUrl}
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
    const port = efecteConfig.transport.http.port || 3000;
    const host = efecteConfig.transport.http.host || '0.0.0.0';
    
    printBanner(port, host);
    
    logger.info('Starting Efecte MCP Server in HTTP mode...');
    logger.info(`Configuration:`, {
      baseUrl: efecteConfig.baseUrl,
      transport: 'streamable-http',
      port,
      host,
    });
    
    // Start cache cleanup scheduler
    startCacheCleanup();
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      stopCacheCleanup();
      await httpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      stopCacheCleanup();
      await httpServer.stop();
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

    await httpServer.start();
    
  } catch (error) {
    logger.error('Failed to start HTTP server:', error);
    stopCacheCleanup();
    process.exit(1);
  }
}

main();