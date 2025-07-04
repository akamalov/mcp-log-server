#!/usr/bin/env node

/**
 * MCP Log Server - Main Entry Point
 * 
 * This is the main server application that provides MCP (Model Context Protocol)
 * functionality for aggregating and serving logs from various AI agents.
 */

import { createServer } from './server.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

async function main() {
  const logger = createLogger();
  
  try {
    // Load configuration
    const config = await loadConfig();
    logger.info('Configuration loaded successfully', { 
      port: config.server.port,
      host: config.server.host,
      environment: config.environment 
    });

    // Create and start the server
    const server = await createServer(config, logger);
    
    // Start server
    await server.listen({ 
      port: config.server.port, 
      host: config.server.host 
    });

    logger.info(`MCP Log Server started`, {
      port: config.server.port,
      host: config.server.host,
      pid: process.pid
    });

    // Graceful shutdown handling
    const signals = ['SIGTERM', 'SIGINT'] as const;
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);
        
        try {
          await server.close();
          logger.info('Server shut down gracefully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });
    });

  } catch (error) {
    console.error('DETAILED ERROR:', error);
    console.error('ERROR STACK:', error instanceof Error ? error.stack : 'No stack trace');
    logger.error('Failed to start server', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      code: (error as any)?.code,
    });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
}); 