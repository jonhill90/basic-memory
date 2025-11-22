#!/bin/bash

# Basic Memory MCP Server Startup Script
# Handles configuration setup and starts the HTTP/SSE wrapper

set -e

echo "Starting Basic Memory MCP Server wrapper..."

# Set data directory to Obsidian vault
export BASIC_MEMORY_DIR=/obsidian-vault

# Activate Python virtual environment
cd /app
source .venv/bin/activate

# Create basic memory config pointing to obsidian vault
mkdir -p /root/.basic-memory
cat > /root/.basic-memory/config.json << 'CONFIG'
{
  "projects": {
    "obsidian": "/obsidian-vault"
  },
  "default_project": "obsidian",
  "default_project_mode": true
}
CONFIG

echo "Basic Memory configured for directory: $BASIC_MEMORY_DIR"

# Start the HTTP/SSE wrapper
echo "Starting HTTP/SSE wrapper on port ${PORT:-8000}..."
exec node /app-wrapper/src/http-wrapper.js
