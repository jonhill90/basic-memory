FROM python:3.12-slim

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x for HTTP/SSE wrapper
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package management
RUN pip install uv

# Clone the basic-memory repository
RUN git clone https://github.com/basicmachines-co/basic-memory.git /app

WORKDIR /app

# Install only the core dependencies needed for MCP server (skip GUI extras)
RUN uv sync --group=server --no-dev || uv sync --no-dev || \
    (echo "Trying minimal install..." && \
     uv venv && \
     . .venv/bin/activate && \
     pip install -e . --no-deps && \
     pip install fastmcp mcp loguru typer python-dotenv pydantic sqlalchemy aiosqlite watchfiles)

# Create data directory for markdown files
RUN mkdir -p /data/basic-memory

# Expose MCP port
EXPOSE 8000

# Copy wrapper scripts and package.json
WORKDIR /app-wrapper
COPY src/ src/
COPY package.json package.json
COPY start.sh start.sh
RUN chmod +x start.sh

# Install wrapper dependencies (none currently, but structure is ready)
RUN npm install

# CRITICAL: Unbuffered output for streaming
ENV NODE_ENV=production

# Return to /app for basic-memory
WORKDIR /app

CMD ["/app-wrapper/start.sh"]
