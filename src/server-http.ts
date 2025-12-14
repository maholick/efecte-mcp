import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger.js';
import { efecteConfig } from './utils/config.js';
import { registerAuthTools } from './tools/auth.js';
import { registerDataCardTools } from './tools/datacard.js';
import { registerTemplateTools } from './tools/template.js';
import { registerTestTools } from './tools/test.js';
import { registerFileTools } from './tools/file.js';
import { registerTemplateResources } from './resources/templates.js';

interface TransportInfo {
  transport: StreamableHTTPServerTransport;
  server: Server;
  lastActivity: number;
}

export class EfecteHttpServer {
  private app: express.Application;
  private transports: Map<string, TransportInfo> = new Map();
  private httpServer: any;
  private sessionCleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.startSessionCleanup();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // Origin validation middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin || req.headers.referer;
      const allowedOrigins = efecteConfig.transport.http.allowedOrigins;
      
      // If allowedOrigins is undefined, allow all (development mode)
      if (allowedOrigins && allowedOrigins.length > 0 && origin) {
        try {
          const originUrl = new URL(origin);
          const isAllowed = allowedOrigins.some(allowed => {
            try {
              const allowedUrl = new URL(allowed);
              return originUrl.origin === allowedUrl.origin;
            } catch {
              // If allowed origin is not a full URL, check if it matches the hostname
              return originUrl.hostname === allowed || originUrl.origin === allowed;
            }
          });
          
          if (!isAllowed) {
            logger.warn(`Rejected request from unauthorized origin: ${origin}`);
            res.status(403).json({
              error: 'Forbidden',
              message: 'Origin not allowed',
            });
            return;
          }
        } catch (error) {
          // Invalid origin URL format - reject for security
          logger.warn(`Rejected request with invalid origin format: ${origin}`, error);
          res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid origin format',
          });
          return;
        }
      }
      
      next();
    });
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: efecteConfig.security.maxRequestsPerMinute,
      message: {
        error: 'Too many requests',
        message: `Rate limit exceeded. Maximum ${efecteConfig.security.maxRequestsPerMinute} requests per minute.`,
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req: Request) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
      },
    });
    
    this.app.use(limiter);
    
    this.app.use(cors({
      origin: efecteConfig.transport.http.allowedOrigins && efecteConfig.transport.http.allowedOrigins.length > 0
        ? efecteConfig.transport.http.allowedOrigins
        : '*',
      exposedHeaders: ['Mcp-Session-Id'],
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Mcp-Session-Id', 'Last-Event-Id', 'Accept', 'Origin'],
    }));

    this.app.use((req, _res, next) => {
      logger.debug(`HTTP ${req.method} ${req.path}`, {
        headers: req.headers,
        sessionId: req.headers['mcp-session-id'],
      });
      next();
    });
  }

  private createMcpServer(): Server {
    const server = new Server(
      {
        name: 'efecte-mcp-server-http',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers(server);
    return server;
  }

  private setupHandlers(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Listing available tools');
      return {
        tools: [
          ...registerAuthTools(),
          ...registerDataCardTools(),
          ...registerTemplateTools(),
          ...registerTestTools(),
          ...registerFileTools(),
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info(`Calling tool: ${name}`);
      
      try {
        const authTools = await import('./tools/auth.js');
        const dataCardTools = await import('./tools/datacard.js');
        const templateTools = await import('./tools/template.js');
        const testTools = await import('./tools/test.js');
        const fileTools = await import('./tools/file.js');

        const tools: Record<string, (args: any) => Promise<any>> = {
          ...authTools.tools,
          ...dataCardTools.tools,
          ...templateTools.tools,
          ...testTools.tools,
          ...fileTools.tools,
        };

        const tool = tools[name];
        if (!tool) {
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
        }

        const result = await tool(args);
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        logger.error(`Tool execution failed: ${name}`, error);
        
        if (error instanceof McpError) {
          throw error;
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug('Listing available resources');
      const resources = await registerTemplateResources();
      return { resources };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      logger.info(`Reading resource: ${uri}`);
      
      try {
        const templateResources = await import('./resources/templates.js');
        const result = await templateResources.readResource(uri);
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        logger.error(`Resource read failed: ${uri}`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(
          ErrorCode.InternalError,
          `Resource read failed: ${errorMessage}`
        );
      }
    });

    server.onerror = (error) => {
      logger.error('Server error:', error);
    };
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        service: 'efecte-mcp-server',
        transport: 'http',
        sessions: this.transports.size,
      });
    });

    this.app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      logger.debug('POST /mcp request', {
        sessionId,
        hasBody: !!req.body,
        isInitialize: isInitializeRequest(req.body),
      });

      try {
        let transportInfo: TransportInfo | undefined;

        if (sessionId && this.transports.has(sessionId)) {
          transportInfo = this.transports.get(sessionId);
          if (transportInfo) {
            // Update last activity timestamp
            transportInfo.lastActivity = Date.now();
          }
          logger.debug(`Reusing transport for session: ${sessionId}`);
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // Create server first, then transport (fixes bug where server was used before creation)
          const server = this.createMcpServer();
          let sessionInitialized = false;
          let pendingSessionId: string | undefined;
          
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true, // Enable JSON responses for better compatibility
            onsessioninitialized: (sid) => {
              if (sessionInitialized) {
                logger.warn(`Session ${sid} already initialized, ignoring duplicate callback`);
                return;
              }
              sessionInitialized = true;
              pendingSessionId = sid;
              logger.info(`Session initialized: ${sid}`);
              // Store the transport with the session ID and current timestamp
              this.transports.set(sid, { 
                transport, 
                server,
                lastActivity: Date.now(),
              });
            },
          });
          
          transport.onclose = () => {
            try {
              const sid = transport.sessionId || pendingSessionId;
              if (sid && this.transports.has(sid)) {
                logger.info(`Transport closed for session: ${sid}`);
                this.transports.delete(sid);
              }
            } catch (error) {
              logger.error('Error in transport onclose handler:', error);
            }
          };

          try {
            await server.connect(transport);
            await transport.handleRequest(req as any, res as any, req.body);
            
            // If session wasn't initialized by the time request completes, clean up
            if (!sessionInitialized && pendingSessionId) {
              logger.warn(`Session ${pendingSessionId} was not properly initialized, cleaning up`);
              this.transports.delete(pendingSessionId);
            }
          } catch (error) {
            // Clean up on error
            const sid = transport.sessionId || pendingSessionId;
            if (sid && this.transports.has(sid)) {
              this.transports.delete(sid);
            }
            throw error;
          }
          return;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided or not an initialization request',
            },
            id: null,
          });
          return;
        }

        if (transportInfo) {
          // Update last activity timestamp
          transportInfo.lastActivity = Date.now();
          await transportInfo.transport.handleRequest(req as any, res as any, req.body);
        }
      } catch (error: unknown) {
        logger.error('Error handling POST /mcp request:', error);
        if (!res.headersSent) {
          const errorMessage = error instanceof Error ? error.message : 'Internal server error';
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: errorMessage,
            },
            id: null,
          });
        }
      }
    });

    this.app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      if (!sessionId || !this.transports.has(sessionId)) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const lastEventId = req.headers['last-event-id'] as string;
      if (lastEventId) {
        logger.debug(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        logger.debug(`Establishing SSE stream for session: ${sessionId}`);
      }

      try {
        const transportInfo = this.transports.get(sessionId);
        if (transportInfo) {
          // Update last activity timestamp
          transportInfo.lastActivity = Date.now();
          await transportInfo.transport.handleRequest(req as any, res as any);
        }
      } catch (error: unknown) {
        logger.error('Error handling GET /mcp request:', error);
        if (!res.headersSent) {
          res.status(500).send('Internal server error');
        }
      }
    });

    this.app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      if (!sessionId) {
        res.status(400).json({
          error: 'Missing session ID',
        });
        return;
      }

      if (this.transports.has(sessionId)) {
        const transportInfo = this.transports.get(sessionId);
        if (transportInfo) {
          try {
            await transportInfo.server.close();
          } catch (error: unknown) {
            logger.error(`Error closing session ${sessionId} during delete:`, error);
          }
          this.transports.delete(sessionId);
        }
        logger.info(`Session deleted: ${sessionId}`);
        res.status(204).send();
      } else {
        res.status(404).json({
          error: 'Session not found',
        });
      }
    });

    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
      });
    });
  }

  async start(port?: number): Promise<void> {
    const serverPort = port || efecteConfig.transport.http.port || 3000;
    const host = efecteConfig.transport.http.host || '0.0.0.0';
    
    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(serverPort, host, () => {
        logger.info(`Efecte MCP HTTP Server listening on http://${host}:${serverPort}`);
        logger.info(`Health check: http://${host}:${serverPort}/health`);
        logger.info(`MCP endpoint: http://${host}:${serverPort}/mcp`);
        resolve();
      });

      this.httpServer.on('error', (error: unknown) => {
        logger.error('HTTP server error:', error);
        reject(error);
      });
    });
  }

  private startSessionCleanup(): void {
    // Clean up idle sessions every 5 minutes
    this.sessionCleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupIdleSessions(): void {
    const sessionTimeout = efecteConfig.transport.http.sessionTimeout || 1800000; // 30 minutes default
    const now = Date.now();
    const sessionsToClose: string[] = [];

    for (const [sessionId, transportInfo] of this.transports.entries()) {
      const idleTime = now - transportInfo.lastActivity;
      if (idleTime > sessionTimeout) {
        logger.info(`Session ${sessionId} idle for ${Math.round(idleTime / 1000)}s, closing...`);
        sessionsToClose.push(sessionId);
      }
    }

    // Close idle sessions
    for (const sessionId of sessionsToClose) {
      const transportInfo = this.transports.get(sessionId);
      if (transportInfo) {
        // Remove from map first to prevent race conditions
        this.transports.delete(sessionId);
        // Then close asynchronously
        transportInfo.server.close().catch((error: unknown) => {
          logger.error(`Error closing session ${sessionId}:`, error);
        });
      }
    }

    if (sessionsToClose.length > 0) {
      logger.info(`Cleaned up ${sessionsToClose.length} idle session(s)`);
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping HTTP server...');
    
    // Stop session cleanup interval
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = null;
    }
    
    // Clean up all sessions
    const closePromises: Promise<void>[] = [];
    for (const [sessionId, transportInfo] of this.transports) {
      logger.info(`Closing session: ${sessionId}`);
      closePromises.push(
        transportInfo.server.close().catch((error: unknown) => {
          logger.error(`Error closing session ${sessionId}:`, error);
        })
      );
    }
    
    // Wait for all sessions to close, but don't fail if some fail
    await Promise.allSettled(closePromises);
    this.transports.clear();

    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(() => {
          logger.info('HTTP server stopped');
          resolve();
        });
      });
    }
  }
}

export const httpServer = new EfecteHttpServer();