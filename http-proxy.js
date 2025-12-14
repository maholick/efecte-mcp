#!/usr/bin/env node

/**
 * MCP STDIO-to-HTTP Proxy Bridge
 * 
 * This proxy enables STDIO-based MCP clients (like Claude Desktop) to connect
 * to an HTTP-based MCP server. It acts as a bridge between:
 * - STDIO transport (what the client expects)
 * - HTTP/Streamable HTTP transport (what the server provides)
 * 
 * Use case: When you want to run the MCP server as HTTP (for scalability,
 * remote access, etc.) but your MCP client only supports STDIO transport.
 * 
 * Usage:
 *   1. Start the HTTP server: npm run start:http
 *   2. Configure your MCP client to use this proxy:
 *      {
 *        "command": "node",
 *        "args": ["/path/to/http-proxy.js"],
 *        "env": {
 *          "MCP_HTTP_URL": "http://localhost:3000/mcp"
 *        }
 *      }
 */

import axios from 'axios';

const HTTP_URL = process.env.MCP_HTTP_URL || 'http://localhost:3000/mcp';
const SESSION_TIMEOUT = parseInt(process.env.MCP_SESSION_TIMEOUT || '1800000', 10); // 30 minutes default

// Session state management
let sessionId = null;
let sessionLastActivity = Date.now();
let buffer = '';

/**
 * Forward a message to the HTTP server
 */
async function forwardToHttp(message) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Include session ID if we have one
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const response = await axios.post(HTTP_URL, message, {
      headers,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on HTTP errors
    });

    // Extract session ID from response headers
    const responseSessionId = response.headers['mcp-session-id'] || response.headers['Mcp-Session-Id'];
    if (responseSessionId && !sessionId) {
      sessionId = responseSessionId;
      sessionLastActivity = Date.now();
    }

    // Update last activity
    if (sessionId) {
      sessionLastActivity = Date.now();
    }

    // Return the response data (should be JSON-RPC 2.0 format)
    return response.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`HTTP proxy error: ${errorMessage}\n`);
    
    // Return error response in MCP/JSON-RPC 2.0 format
    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `HTTP proxy error: ${errorMessage}`,
      },
      id: message.id || null,
    };
  }
}

/**
 * Clean up session if idle
 */
function checkSessionTimeout() {
  if (sessionId && Date.now() - sessionLastActivity > SESSION_TIMEOUT) {
    // Session expired, clear it
    process.stderr.write(`Session ${sessionId} expired due to inactivity\n`);
    sessionId = null;
  }
}

/**
 * Process incoming data from stdin
 */
function processInput(data) {
  buffer += data.toString();
  
  // Process complete JSON-RPC messages (separated by newlines)
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    try {
      const message = JSON.parse(trimmed);
      handleMessage(message);
    } catch (error) {
      // Not valid JSON, might be partial message - put back in buffer
      buffer = trimmed + '\n' + buffer;
    }
  }
}

/**
 * Handle a single MCP message
 */
async function handleMessage(message) {
  try {
    // Forward to HTTP server
    const response = await forwardToHttp(message);
    
    // Send response back via stdout (JSON-RPC 2.0 format)
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`Error handling message: ${errorMessage}\n`);
    
    // Send error response
    const errorResponse = {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: errorMessage,
      },
      id: message.id || null,
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
}

/**
 * Cleanup function
 */
async function cleanup() {
  if (sessionId) {
    try {
      await axios.delete(HTTP_URL, {
        headers: { 'Mcp-Session-Id': sessionId },
        timeout: 5000,
      });
      process.stderr.write(`Cleaned up session: ${sessionId}\n`);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Main bridge function
 */
async function bridge() {
  try {
    process.stderr.write(`MCP STDIO-to-HTTP Proxy started\n`);
    process.stderr.write(`Forwarding to: ${HTTP_URL}\n`);
    process.stderr.write(`Session timeout: ${SESSION_TIMEOUT}ms\n`);

    // Set up stdin handler
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', processInput);
    process.stdin.on('end', async () => {
      await cleanup();
      process.exit(0);
    });

    // Periodically check session timeout
    setInterval(checkSessionTimeout, 60000); // Check every minute

    // Handle cleanup on exit
    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`Failed to start bridge: ${errorMessage}\n`);
    process.exit(1);
  }
}

bridge();
