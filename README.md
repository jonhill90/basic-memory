# BasicMemory

A Docker-based MCP server for basic-memory that integrates with your Obsidian vault.

## Setup

1. Clone this repository
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and set your Obsidian vault path:
   ```
   OBSIDIAN_VAULT_PATH=/path/to/your/obsidian-vault
   ```
4. Start the service:
   ```bash
   docker-compose up -d
   ```

## Configuration

The service expects an environment variable `OBSIDIAN_VAULT_PATH` pointing to your Obsidian vault directory on the host machine.

Example paths:
- Windows: `C:/Users/YourName/Documents/ObsidianVault`
- Linux/Mac: `/home/username/Documents/ObsidianVault`

## Stack Name

The Docker Compose stack is named `Basic-Memory`.