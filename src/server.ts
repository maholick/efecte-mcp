import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

export class EfecteMcpServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'efecte-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.registerTools();
    this.registerResources();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug('Listing available resources');
      const resources = await registerTemplateResources();
      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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

    this.server.onerror = (error) => {
      logger.error('Server error:', error);
    };
  }

  private registerTools(): void {
    logger.info('Registering MCP tools');
  }

  private registerResources(): void {
    logger.info('Registering MCP resources');
  }

  async start(): Promise<void> {
    logger.info('Starting Efecte MCP Server');
    
    if (efecteConfig.transport.default === 'stdio') {
      logger.info('Using STDIO transport');
      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);
      logger.info('Server started successfully on STDIO transport');
    } else if (efecteConfig.transport.default === 'http' && efecteConfig.transport.http.enabled) {
      logger.info('HTTP transport enabled - use start-http.ts instead');
      const { httpServer } = await import('./server-http.js');
      await httpServer.start();
    } else {
      throw new Error(`Invalid transport configuration: ${efecteConfig.transport.default}`);
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Efecte MCP Server');
    await this.server.close();
    logger.info('Server stopped');
  }
}

export const mcpServer = new EfecteMcpServer();