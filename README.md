# BasicMemory

A Docker-based MCP server for [basic-memory](https://github.com/basicmachines-co/basic-memory) that integrates with your Obsidian vault via HTTP/SSE transport.

This is a wrapper that provides HTTP/SSE access to the official basic-memory MCP server.

## Setup

1. Clone this repository
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and configure:
   ```bash
   OBSIDIAN_VAULT_PATH=/path/to/your/obsidian-vault
   BASIC_MEMORY_PORT=8050
   LOG_LEVEL=info
   ```
4. Start the service:
   ```bash
   docker-compose up -d
   ```

## Configuration

### Environment Variables

- `OBSIDIAN_VAULT_PATH` - Path to your Obsidian vault on the host machine (required)
- `BASIC_MEMORY_PORT` - Port for the HTTP/SSE server (default: 8050)
- `LOG_LEVEL` - Log verbosity: debug, info, warn, error (default: info)

### Example Paths

- Windows: `C:/Users/YourName/Documents/ObsidianVault`
- Linux/Mac: `/home/username/Documents/ObsidianVault`

## Usage

Once running, the MCP server is accessible at:
- **MCP Endpoint**: `http://localhost:8050/mcp`
- **Health Check**: `http://localhost:8050/health`

The server implements MCP over HTTP with Server-Sent Events (SSE) for streaming responses.

## Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "basic-memory": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8050/mcp"
      ]
    }
  }
}
```

### Claude Code

Add to user-level configuration:

```bash
claude mcp add basic-memory --scope user -- npx mcp-remote http://localhost:8050/mcp
```

Verify connection:

```bash
claude mcp list
```

## Stack Name

The Docker Compose stack is named `Basic-Memory`.