# Efecte/Matrix42 MCP Server

**A Model Context Protocol (MCP) server for integrating AI assistants with Efecte/Matrix42 Service Management systems**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)

---

## ⚠️ Important Legal Notice

**This is an unofficial, community-driven integration project.** This software is not affiliated with, endorsed by, or sponsored by Efecte Oyj, Matrix42 AG, or any of their subsidiaries or affiliates.

- **Efecte** and **Matrix42** are registered trademarks of their respective owners
- This project is provided as-is for educational and integration purposes
- Users are responsible for ensuring compliance with their Efecte/Matrix42 license agreements
- This software uses the publicly documented REST API endpoints

**Note:** Following Matrix42's acquisition of Efecte in April 2024, the products were rebranded to **Matrix42 Core** and **Matrix42 Professional**. However, the REST API endpoints and technical integration continue to use the "Efecte" branding in API paths (e.g., `/rest-api/itsm/v1`). This integration works with both legacy Efecte instances and the rebranded Matrix42 service management platforms.

---

## 🚀 Overview

Connect your AI assistant (Claude, ChatGPT, or any MCP-compatible client) directly to your Efecte/Matrix42 Service Management system. This MCP server provides a comprehensive set of tools for managing incidents, requests, problems, and other service management entities through natural language interactions.

### Key Capabilities

- 🤖 **AI-Powered Service Management** - Interact with your service desk using natural language
- 🔐 **Secure Authentication** - Automatic JWT token management with refresh
- 📊 **Full CRUD Operations** - Create, read, update, and delete data cards
- 📎 **File Management** - Upload and download attachments
- 🔍 **Advanced Search** - Query across multiple templates simultaneously
- ⚡ **High Performance** - Intelligent caching and streaming for large datasets
- 🔒 **Production Ready** - Security features, rate limiting, and comprehensive error handling

---

## ✨ Features

### Core Functionality

- ✅ **Full REST API Coverage** - Supports most Efecte/Matrix42 ESM REST API endpoints
- ✅ **Authentication Management** - Automatic JWT token handling with refresh
- ✅ **DataCard Operations** - Complete CRUD operations for data cards
- ✅ **Template Management** - List and retrieve template information
- ✅ **File Handling** - Upload and download attachments
- ✅ **Resource Browsing** - Access template information as MCP resources
- ✅ **Multi-Template Search** - Search across multiple templates in parallel

### Advanced Features

- 🚀 **Dual Transport Modes** - Both STDIO and Streamable HTTP transports
- 💾 **Intelligent Caching** - Templates and authentication tokens cached for performance
- 🔒 **Security Features** - Origin validation, rate limiting, session management
- ✅ **Input Validation** - Comprehensive runtime validation for all inputs
- 📊 **Streaming Support** - Handle large datasets efficiently
- 🔄 **Automatic Retry** - Built-in retry logic for transient failures

---

## 📦 Installation

### Prerequisites

- Node.js 22 or higher
- npm or yarn
- Access to an Efecte/Matrix42 instance with REST API enabled
- Valid API credentials

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd efecte_mcp

# Install dependencies
npm install

# Build the project
npm run build

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your credentials
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Required: Efecte/Matrix42 server configuration
EFECTE_BASE_URL=https://your-instance.com
EFECTE_API_PATH=/rest-api/itsm/v1
EFECTE_USERNAME=your_username
EFECTE_PASSWORD=your_password

# Optional: Transport configuration
EFECTE_TRANSPORT_DEFAULT=stdio  # or "http"
EFECTE_TRANSPORT_HTTP_ENABLED=false
EFECTE_TRANSPORT_HTTP_PORT=3000
EFECTE_TRANSPORT_HTTP_HOST=localhost
EFECTE_TRANSPORT_HTTP_ALLOWED_ORIGINS=
EFECTE_TRANSPORT_HTTP_SESSION_TIMEOUT=1800000

# Optional: API configuration
EFECTE_TIMEOUT=30000
EFECTE_PAGINATION_DEFAULT_LIMIT=50
EFECTE_PAGINATION_MAX_LIMIT=200

# Optional: Caching configuration
EFECTE_CACHE_TEMPLATES_TTL=300000
EFECTE_CACHE_AUTH_TOKEN_TTL=3300000

# Optional: Security configuration
EFECTE_SECURITY_ENABLE_AUDIT_LOGGING=false
EFECTE_SECURITY_MAX_REQUESTS_PER_MINUTE=60
EFECTE_SECURITY_TOKEN_REFRESH_THRESHOLD=300

# Optional: Logging configuration
EFECTE_LOGGING_LEVEL=info  # debug, info, warn, error
EFECTE_LOGGING_ENABLE_STRUCTURED=false
EFECTE_LOGGING_ENABLE_PERFORMANCE_METRICS=false
DEBUG=false
```

### MCP Client Integration

#### STDIO Transport (Recommended for Local Use)

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "efecte": {
      "command": "node",
      "args": ["/path/to/efecte_mcp/dist/index.js"],
      "env": {
        "EFECTE_BASE_URL": "https://your-instance.com",
        "EFECTE_USERNAME": "your_username",
        "EFECTE_PASSWORD": "your_password"
      }
    }
  }
}
```

#### HTTP Transport (For Remote Access)

1. Set `EFECTE_TRANSPORT_HTTP_ENABLED=true` in your `.env` file
2. Optionally configure `EFECTE_TRANSPORT_HTTP_ALLOWED_ORIGINS` for security
3. Start the HTTP server: `npm run start:http`
4. Connect MCP client to `http://localhost:3000` (or configured port)

**For STDIO-based clients (backward compatibility):**

Use the `http-proxy.js` bridge to connect STDIO clients to the HTTP server:

```json
{
  "efecte": {
    "command": "node",
    "args": ["/path/to/efecte_mcp/http-proxy.js"],
    "env": {
      "MCP_HTTP_URL": "http://localhost:3000/mcp",
      "MCP_SESSION_TIMEOUT": "1800000"
    }
  }
}
```

---

## 🛠️ Available Tools

### Authentication Tools

| Tool | Description |
|------|-------------|
| `efecte_login` | Authenticate with Efecte/Matrix42 API |
| `efecte_logout` | Clear authentication tokens |
| `efecte_check_auth` | Check authentication status |

### DataCard Tools

| Tool | Description |
|------|-------------|
| `efecte_list_datacards` | Get paginated list of data cards (with smart error handling for invalid reference values and optional summary mode) |
| `efecte_get_datacard` | Retrieve a single data card |
| `efecte_create_datacard` | Create a new data card |
| `efecte_update_datacard` | Update an existing data card |
| `efecte_delete_datacard` | Delete a data card (move to trash) |
| `efecte_get_attribute` | Get specific attribute value |
| `efecte_update_attribute` | Update attribute value (replaces existing) |
| `efecte_add_attribute_value` | Add value(s) to multi-value attribute |
| `efecte_delete_attribute_value` | Delete/clear an attribute value |
| `efecte_search_datacards` | Simple text-based search across data cards (searches in common text fields without requiring EQL syntax) |
| `efecte_search_multiple_templates` | Search across multiple templates in parallel |
| `efecte_stream_datacards` | Stream all data cards for large datasets |

### Template Tools

| Tool | Description |
|------|-------------|
| `efecte_list_templates` | List all available templates |
| `efecte_get_template` | Get detailed template information |

### File Tools

| Tool | Description |
|------|-------------|
| `efecte_upload_file` | Upload attachment to data card |
| `efecte_download_file` | Download attachment from data card |

### Test Tools

| Tool | Description |
|------|-------------|
| `efecte_echo` | Test API connectivity |
| `efecte_echo_auth` | Test authenticated connectivity |

---

## 🔍 EQL Filter Syntax

The Efecte MCP server supports EQL (Efecte Query Language) for filtering data cards. EQL uses `$attribute_name$` syntax to reference attributes.

### Basic Syntax

- **Attribute References**: Use `$attribute_name$` to reference attributes
- **String Values**: Enclose string values in single quotes: `'value'`
- **Operators**: `=`, `<>`, `>`, `<`, `>=`, `<=`
- **Logical Operators**: `AND`, `OR`, `NOT`

### Filter Examples

**Static Value Attributes:**
```typescript
"filter": "$status$ = '02 - Solving'"
"filter": "$priority$ = '2. High'"
"filter": "$status$ <> '07 - Closed'"
```

**Reference Attributes (by name):**
```typescript
// Filter by support group
"filter": "$support_group$ = 'IT Support'"

// Filter by customer/user
"filter": "$customer$ = 'John Doe'"

// Filter by organization
"filter": "$organization_inc$ = 'collaboration Factory GmbH'"
```

**Date Comparisons:**
```typescript
"filter": "$created$ > '2025-01-01'"
"filter": "$created$ >= '2025-01-01T00:00:00Z'"
```

**Complex Filters:**
```typescript
"filter": "$status$ = '02 - Solving' AND $priority$ = '2. High'"
"filter": "$status$ = '01 - New' OR $status$ = '02 - Solving'"
"filter": "$support_group$ = 'IT Support' AND $priority$ <> '3. Medium'"
```

### Finding Attribute Names

To find the correct attribute names for filtering:
1. Use `efecte_get_template` to see all available attributes for a template
2. Use `efecte_list_datacards` with `dataCards: true` to see actual attribute names in returned data
3. Attribute codes are typically lowercase with underscores (e.g., `support_group`, `customer`, `organization_inc`)

### Error Handling for Invalid Reference Values

When filtering by reference attributes (like `support_group`, `customer`, etc.) with an invalid value, the server automatically:
- Detects the 400 Bad Request error
- Identifies the reference attribute and attempted value
- Queries the reference template to list all available values
- Returns a helpful error message with:
  - The attempted invalid value
  - A list of all available values (up to 20)
  - A suggested similar match (if found)

**Example Error Message:**
```
Filter failed: Invalid value "IT support group" for attribute "support_group".

Available support groups:
- IT
- Customer Support
- Cloud Operations
- Partner Management

Did you mean "IT"?
```

This makes it easy to discover the correct values to use in your filters without needing to query templates separately.

### Simple Text Search vs EQL Filters

**Use `efecte_search_datacards` when:**
- You want to search with plain text without knowing attribute names
- You need to search across multiple text fields at once
- You don't know the exact EQL syntax

**Use `efecte_list_datacards` with EQL filters when:**
- You know the exact attribute names
- You need precise filtering (exact matches, date ranges, etc.)
- You want server-side filtering for better performance with large datasets
- You need complex filter expressions with AND/OR logic

---

## 💡 Usage Examples

### List Active Incidents

```typescript
// Tool: efecte_list_datacards
{
  "templateCode": "incident",
  "limit": 50,
  "filter": "$status$ = '02 - Solving'"
}
```

### List Service Requests by Support Group

```typescript
// Tool: efecte_list_datacards
{
  "templateCode": "ServiceRequest",
  "limit": 10,
  "dataCards": true,
  "filter": "$support_group$ = 'IT'"
}
```

**Note:** If you use an invalid support group name, the server will automatically list all available support groups in the error message to help you find the correct value.

### List Data Cards with Summary (Large Responses)

For large datasets, you can use the `summary` parameter to get only key fields, reducing response size:

```typescript
// Tool: efecte_list_datacards
{
  "templateCode": "ServiceRequest",
  "limit": 100,
  "dataCards": true,
  "summary": true,
  "filter": "$status$ = '01 - Not started'"
}
```

The summary includes:
- Data card ID and name
- Template information
- Key fields: status, title, priority, created, updated
- Simplified reference fields (name only)

Responses larger than 200KB are automatically summarized when `dataCards: true` is used, unless you explicitly set `summary: false`.

### Simple Text Search

Search for data cards using plain text without needing to know EQL syntax or attribute names:

```typescript
// Tool: efecte_search_datacards
{
  "templateCode": "ServiceRequest",
  "query": "network issue",
  "limit": 50,
  "dataCards": true
}
```

This tool:
- Searches across common text fields (title, description, subject, name, etc.)
- Performs case-insensitive partial matching
- Automatically identifies text fields from the template
- Returns matching results

**Note**: This tool fetches data cards first, then filters them client-side. For better performance with very large datasets, consider using `efecte_list_datacards` with EQL filters if you know the specific attributes to search.

### List Incidents by Customer

```typescript
// Tool: efecte_list_datacards
{
  "templateCode": "incident",
  "limit": 20,
  "filter": "$customer$ = 'John Doe'"
}
```

### List High Priority Active Items

```typescript
// Tool: efecte_list_datacards
{
  "templateCode": "incident",
  "limit": 50,
  "filter": "$status$ = '02 - Solving' AND $priority$ = '2. High'"
}
```

### Create a New Incident

```typescript
// Tool: efecte_create_datacard
{
  "templateCode": "incident",
  "folderCode": "incident_management",
  "data": {
    "subject": {
      "values": [{ "value": "Network connectivity issue" }]
    },
    "description": {
      "values": [{ "value": "Users unable to access network resources" }]
    },
    "priority": {
      "values": [{ "value": "02", "code": "high" }]
    }
  }
}
```

### Upload an Attachment

```typescript
// Tool: efecte_upload_file
{
  "templateCode": "incident",
  "dataCardId": "12345",
  "attributeCode": "attachments",
  "fileName": "screenshot.png",
  "fileContent": "base64_encoded_content_here",
  "mimeType": "image/png"
}
```

### Search Across Multiple Templates

```typescript
// Tool: efecte_search_multiple_templates
{
  "templateCodes": ["incident", "ServiceRequest", "problem"],
  "filter": "$status$ = '02 - Solving'",
  "limit": 50,
  "dataCards": false
}
```

### Search by Support Group Across Templates

```typescript
// Tool: efecte_search_multiple_templates
{
  "templateCodes": ["incident", "ServiceRequest"],
  "filter": "$support_group$ = 'IT Support'",
  "limit": 20,
  "dataCards": true
}
```

---

## 🏃 Running the Server

### Development Mode

```bash
# STDIO mode with auto-reload
npm run dev

# HTTP mode with auto-reload
npm run dev:http
```

### Production Mode

```bash
# STDIO mode
npm run start:stdio

# HTTP mode
npm run start:http
```

### Other Commands

```bash
npm run build        # Build TypeScript
npm run typecheck    # Type checking
npm run lint         # Run linter
npm run clean        # Clean build artifacts
```

---

## 🏗️ Project Structure

```
efecte_mcp/
├── src/
│   ├── index.ts           # Entry point (STDIO mode)
│   ├── start-http.ts      # Entry point (HTTP mode)
│   ├── server.ts          # MCP server setup (STDIO)
│   ├── server-http.ts     # MCP server setup (HTTP)
│   ├── api/
│   │   ├── client.ts      # API client with auto-retry
│   │   └── auth.ts        # Authentication & token management
│   ├── tools/             # MCP tools
│   │   ├── auth.ts        # Authentication tools
│   │   ├── datacard.ts    # DataCard CRUD operations
│   │   ├── template.ts    # Template operations
│   │   ├── file.ts        # File upload/download
│   │   └── test.ts        # Connectivity testing
│   ├── resources/         # MCP resources
│   │   └── templates.ts   # Template resources
│   ├── types/            # TypeScript types
│   │   └── efecte.ts     # Efecte API types
│   └── utils/            # Utilities
│       ├── config.ts     # Configuration management
│       ├── logger.ts     # Logging utility
│       ├── cache.ts      # Caching system
│       └── validation.ts # Input validation helpers
├── dist/                 # Compiled output
├── http-proxy.js         # STDIO-to-HTTP bridge
├── start-http-server.sh  # HTTP server startup script
├── package.json
├── tsconfig.json
├── .env.example          # Environment variable template
└── LICENSE               # MIT License
```

---

## 🔒 Security

- **Credentials**: Stored in environment variables, never logged
- **Token Handling**: Secure JWT token management with automatic refresh
- **Rate Limiting**: Configurable per-minute request limits (default: 60/min)
- **Origin Validation**: HTTP transport supports configurable allowed origins
- **Session Management**: Automatic cleanup of idle sessions
- **Input Validation**: Comprehensive runtime validation to prevent injection attacks
- **Error Handling**: No sensitive data exposed in error messages

---

## ⚡ Performance

- **Template Caching**: 5 minutes default (configurable)
- **Authentication Token Caching**: 55 minutes default (configurable)
- **Automatic Cache Cleanup**: Periodic cleanup of expired entries
- **Configurable Request Timeouts**: Default 30 seconds
- **Pagination Support**: Configurable limits (default: 50, max: 200)
- **Streaming Support**: Handle large datasets efficiently
- **Parallel Operations**: Multi-template search executes in parallel

---

## 🐛 Troubleshooting

### Authentication Issues

1. Verify credentials in `.env` file
2. Check `EFECTE_BASE_URL` is correct
3. Ensure user has API access permissions

### Connection Issues

1. Check network connectivity
2. Verify firewall rules
3. Confirm API endpoint accessibility

### Debug Mode

Enable debug logging:

```env
EFECTE_LOGGING_LEVEL=debug
DEBUG=true
```

### HTTP Proxy Issues

If using `http-proxy.js`:

1. Ensure HTTP server is running: `npm run start:http`
2. Check `MCP_HTTP_URL` environment variable
3. Increase `MCP_SESSION_TIMEOUT` if experiencing connection drops

---

## 📋 Limitations

- File uploads limited by configured size limits (default: 50MB)
- HTTP transport uses session-based authentication (no OAuth)
- Large dataset operations may require pagination or streaming
- The STDIO-to-HTTP proxy requires the HTTP server to be running separately

---

## 🤝 Contributing

Contributions are welcome! This is a community-driven project. Please ensure:

- Code follows existing style and patterns
- All tests pass (when available)
- Documentation is updated
- No sensitive information is committed

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## ⚖️ Trademark Notice

**Efecte** and **Matrix42** are registered trademarks of their respective owners. This project is not affiliated with, endorsed by, or sponsored by Efecte Oyj, Matrix42 AG, or any of their subsidiaries or affiliates. This software is provided as-is for integration purposes only.

---

## 📞 Support

For issues or questions:

1. Check the documentation above
2. Review error logs (written to stderr)
3. Contact your Efecte/Matrix42 administrator for API access issues
4. Open an issue in the repository (if available)

---

## 🙏 Acknowledgments

- Built with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Integrates with the Efecte/Matrix42 REST API
- Community-driven and open-source

---

**Made with ❤️ for the service management community**
