#!/usr/bin/env node

/**
 * HTTP/SSE Wrapper for Basic Memory MCP Server
 * Implements proper MCP over HTTP transport with SSE responses
 * Wraps the Python-based basic-memory MCP server
 */

import { spawn } from 'child_process';
import http from 'http';
import { EventEmitter } from 'events';

const PORT = process.env.PORT || 8000;
const BASIC_MEMORY_DIR = process.env.BASIC_MEMORY_DIR || '/obsidian-vault';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

class MCPStdioTransport extends EventEmitter {
  constructor() {
    super();
    this.mcpProcess = null;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  start() {
    console.log(`Starting Basic Memory MCP Server for directory: ${BASIC_MEMORY_DIR}`);

    // Start the Python MCP server using the installed basic-memory command
    this.mcpProcess = spawn('basic-memory', ['mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BASIC_MEMORY_DIR: BASIC_MEMORY_DIR
      },
      cwd: '/app'
    });

    // Handle stdout - parse JSON-RPC responses
    this.mcpProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      console.log('[MCP Response] Raw stdout data:', dataStr);
      this.buffer += dataStr;

      // Try to parse complete JSON messages
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
      console.log('[MCP Response] Processing', lines.length, 'lines, buffer remaining:', this.buffer.length, 'bytes');

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            console.log('[MCP Response] Parsed message:', JSON.stringify(message));
            console.log('[MCP Response] Listener count before emit:', this.listenerCount('message'));
            console.log('[MCP Response] Emitting message event');
            this.emit('message', message);
            console.log('[MCP Response] Emitted, listener count after:', this.listenerCount('message'));
          } catch (e) {
            console.error('[MCP Response] Parse Error:', e.message, 'Line:', line);
          }
        }
      }
    });

    this.mcpProcess.stderr.on('data', (data) => {
      const error = data.toString();
      // Only log errors, not info messages from basic-memory
      if (LOG_LEVEL === 'debug' || error.includes('ERROR') || error.includes('CRITICAL')) {
        console.error('[MCP STDERR]:', error);
      }
    });

    this.mcpProcess.on('close', (code) => {
      console.log(`MCP process exited with code ${code}`);
      // Restart on crash
      if (code !== 0) {
        console.log('Restarting MCP process in 5 seconds...');
        setTimeout(() => this.start(), 5000);
      }
    });

    this.mcpProcess.on('error', (error) => {
      console.error('Failed to start MCP process:', error);
    });
  }

  send(message) {
    if (this.mcpProcess && this.mcpProcess.stdin.writable) {
      const json = JSON.stringify(message);
      console.log('[MCP Request] Sending to stdio:', json);
      this.mcpProcess.stdin.write(json + '\n');
      console.log('[MCP Request] Written to stdin');
    } else {
      console.error('[MCP Request] ERROR: Cannot send - process not available or stdin not writable');
      console.error('[MCP Request] Process exists:', !!this.mcpProcess);
      console.error('[MCP Request] Stdin writable:', this.mcpProcess?.stdin?.writable);
    }
  }

  stop() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }
  }
}

// Create MCP transport
const transport = new MCPStdioTransport();
transport.start();

// Create HTTP server implementing MCP over HTTP
const server = http.createServer((req, res) => {
  console.log(`[SERVER] Incoming ${req.method} request to ${req.url}`);
  console.log(`[SERVER] Headers:`, JSON.stringify(req.headers));

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    console.log('[SERVER] Handling OPTIONS request');
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      basicMemoryDir: BASIC_MEMORY_DIR,
      logLevel: LOG_LEVEL
    }));
    return;
  }

  // MCP endpoint - accepts JSON-RPC requests and responds with SSE
  if (req.url === '/mcp' && req.method === 'POST') {
    console.log('[HTTP] Received POST request to /mcp');
    console.log('[HTTP] Headers:', JSON.stringify(req.headers));

    // Verify Accept header includes text/event-stream
    const accept = req.headers['accept'] || '';
    console.log('[HTTP] Accept header:', accept);

    if (!accept.includes('text/event-stream')) {
      console.log('[HTTP] Rejecting - Accept header missing text/event-stream');
      res.writeHead(406, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: 'server-error',
        error: {
          code: -32600,
          message: 'Not Acceptable: Client must accept both application/json and text/event-stream'
        }
      }));
      return;
    }

    console.log('[HTTP] Setting SSE headers');
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering if behind proxy
    });

    // Send a comment to establish the SSE connection immediately
    res.write(': SSE connection established\n\n');
    console.log('[HTTP] SSE connection established, sent initial comment');

    let body = '';
    req.on('data', chunk => {
      const chunkStr = chunk.toString();
      console.log('[HTTP] Received chunk:', chunkStr);
      body += chunkStr;
    });

    req.on('end', () => {
      console.log('[HTTP] Request body complete:', body);

      try {
        const request = JSON.parse(body);
        console.log('[HTTP] Parsed request:', JSON.stringify(request));
        console.log('[HTTP] Request ID:', request.id, 'Method:', request.method);

        // Check if this is a notification (no ID field at all)
        const isNotification = !('id' in request);

        if (isNotification) {
          // Notifications don't expect responses - just send and close
          console.log('[HTTP] Notification detected - sending without waiting for response');
          transport.send(request);
          res.end();
          return;
        }

        // Track if we've responded
        let hasResponded = false;

        // Set up listener for response
        const messageHandler = (message) => {
          console.log('[HTTP] Received message from MCP:', JSON.stringify(message));
          console.log('[HTTP] Comparing IDs - message.id:', message.id, 'request.id:', request.id);

          // Match response to request by ID
          if (message.id === request.id) {
            console.log('[HTTP] ID match! Sending SSE response');
            hasResponded = true;

            // Send SSE formatted response
            res.write('event: message\n');
            res.write(`data: ${JSON.stringify(message)}\n\n`);

            console.log('[HTTP] Closing connection after response');
            transport.off('message', messageHandler);
            res.end();
          } else {
            console.log('[HTTP] ID mismatch - ignoring message');
          }
        };

        console.log('[HTTP] Setting up message handler');
        console.log('[HTTP] Current listener count:', transport.listenerCount('message'));
        transport.on('message', messageHandler);
        console.log('[HTTP] After adding listener count:', transport.listenerCount('message'));

        // Send request to MCP server
        console.log('[HTTP] Sending request to MCP stdio process');
        transport.send(request);
        console.log('[HTTP] Request sent, waiting for response...');

        // Cleanup on client disconnect
        req.on('close', () => {
          console.log('[HTTP] Client disconnected, hasResponded:', hasResponded);
          // Don't remove listener on disconnect - let the response handler clean it up
          // This prevents race conditions where response arrives after client disconnect
        });

      } catch (error) {
        console.error('[HTTP] Error parsing request:', error);
        res.write('event: message\n');
        res.write(`data: ${JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error: ' + error.message
          }
        })}\n\n`);
        res.end();
      }
    });

    return;
  }

  // 404
  console.log(`[SERVER] No handler matched - returning 404 for ${req.method} ${req.url}`);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Basic Memory MCP HTTP/SSE server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  transport.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  transport.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
