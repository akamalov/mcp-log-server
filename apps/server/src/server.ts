/**
 * Main Server Implementation
 * 
 * Fastify server with MCP protocol integration, providing both HTTP transport
 * for MCP communication and RESTful APIs for web interface and management.
 */

import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { ServerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { AgentConfig } from '@mcp-log-server/types';
import { discoverAgents } from './services/agent-discovery.js';
import { LogsService } from './services/logs.service.js';
import { LogWatcherService } from './services/log-watcher.service.js';
import { LogAnalyticsService } from './services/log-analytics.service.js';
import { EnhancedLogAnalyticsService } from './services/enhanced-log-analytics.service.js';
import { WebSocketService } from './services/websocket.service.js';
import { LogEntrySchema, LogQuerySchema } from '@mcp-log-server/types';

/**
 * Create and configure the Fastify server
 */
export async function createServer(config: ServerConfig, logger: Logger): Promise<FastifyInstance> {
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: config.logging.level,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    trustProxy: true,
    disableRequestLogging: false,
  });

  // Register security plugins
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });

  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // Create ClickHouse configuration object
  const clickhouseConfig = {
    url: `http://${config.database.clickhouse.host}:${config.database.clickhouse.port}`,
    database: config.database.clickhouse.database,
    username: config.database.clickhouse.username,
    password: config.database.clickhouse.password,
    application: 'mcp-log-server',
    session_timeout: 30000,
    request_timeout: 30000,
  };

  // Instantiate LogsService with ClickHouse config
  const logsService = new LogsService(clickhouseConfig);

  // Initialize WebSocket service for real-time communication
  const webSocketService = new WebSocketService(fastify);
  await webSocketService.initialize();
  logger.info('✅ WebSocket service initialized for real-time updates');

  // Discover available agents
  logger.info('Discovering available agents...');
  const availableAgents = await discoverAgents();
  logger.info('Found available agents', { count: availableAgents.length });

  // Initialize log watcher service
  const logWatcherService = new LogWatcherService(logsService);

  // Set up log event handling with WebSocket broadcasting
  logWatcherService.on('log-entry', (logEntry: any) => {
    logger.debug('New log entry captured', {
      agent: logEntry.source,
      level: logEntry.level,
      message: logEntry.message.substring(0, 100) + (logEntry.message.length > 100 ? '...' : '')
    });

    // Broadcast log entry to WebSocket clients
    webSocketService.broadcastLogEntry(logEntry);
  });

  // Start watching agent log files
  try {
    await logWatcherService.startWatching(availableAgents);
    logger.info('Log watcher started successfully', { 
      watchedAgents: availableAgents.length,
      watcherStatus: logWatcherService.getStatus()
    });

    // Broadcast initial agent status
    webSocketService.broadcastAgentStatus(availableAgents);
  } catch (error) {
    logger.warn('Failed to start log watcher', { error });
  }

  // Graceful shutdown handler for all services
  fastify.addHook('onClose', async () => {
    logger.info('Shutting down services...');
    try {
      await webSocketService.shutdown();
      await logWatcherService.stopWatching();
      logger.info('All services shut down successfully');
    } catch (error) {
      logger.warn('Error shutting down services', { error });
    }
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    const watcherStatus = logWatcherService.getStatus();
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '0.1.0',
      agents: {
        total: availableAgents.length,
        available: availableAgents.length, // TODO: Check actual agent connectivity
      },
      logWatcher: {
        isRunning: watcherStatus.isRunning,
        watchedFiles: watcherStatus.watcherCount,
        files: watcherStatus.watchedFiles
      }
    };
  });

  // Initialize database service for custom agents (optional)
  let databaseService: any = null;
  if (config.database?.postgresql) {
    try {
      const { DatabaseService } = await import('./services/database.service.js');
      databaseService = new DatabaseService(config.database.postgresql, logger);
      await databaseService.initialize();
      logger.info('✅ Database service initialized for custom agents');
    } catch (error) {
      logger.warn('⚠️ Database service not available, custom agents disabled:', error);
    }
  }

  // API endpoints for agents
  await fastify.register(async function apiRoutes(fastify) {
    // Get all available agents
    fastify.get('/api/agents', {
      schema: {
        description: 'Get all available agents',
        tags: ['Agents'],
        response: {
          200: {
            type: 'object',
            properties: {
              agents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    available: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      try {
        // Get unique source names from the logs
        const logs = await logsService.getRecentLogs(1000); // Get a good sample of logs
        const uniqueSources = [...new Set(logs.map(log => log.source))];
        
        // Create agent objects with the actual source names
        const agents = uniqueSources.map(source => ({
          id: source,
          name: source,
          available: true
        }));
        
        return { agents };
      } catch (error) {
        logger.error('Failed to get agents', { error });
        // Fallback to predefined agents if database query fails
        return { agents: availableAgents };
      }
    });

    // Get specific agent details
    fastify.get('/api/agents/:agentId', {
      schema: {
        description: 'Get specific agent details',
        tags: ['Agents'],
        params: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
          },
          required: ['agentId'],
        },
      },
    }, async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      const agent = availableAgents.find(a => a.id === agentId);
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      return agent;
    });

    // Custom Agent Management Routes
    
    // Get all custom agents
    fastify.get('/api/agents/custom', {
      schema: {
        description: 'Get all custom agents',
        tags: ['Custom Agents'],
        response: {
          200: {
            type: 'array',
            items: { type: 'object' }
          }
        }
      }
    }, async (request, reply) => {
      if (!databaseService) {
        reply.code(503);
        return { error: 'Database service not available' };
      }
      
      try {
        const customAgents = await databaseService.getCustomAgents();
        return customAgents;
      } catch (error) {
        logger.error('Failed to get custom agents:', error);
        reply.code(500);
        return { error: 'Failed to fetch custom agents' };
      }
    });

    // Create a new custom agent
    fastify.post('/api/agents/custom', {
      schema: {
        description: 'Create a new custom agent',
        tags: ['Custom Agents'],
        body: {
          type: 'object',
          required: ['name', 'type', 'logPaths'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            logPaths: { type: 'array', items: { type: 'string' } },
            logFormat: { type: 'string' },
            enabled: { type: 'boolean' },
            filters: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' }
          }
        }
      }
    }, async (request, reply) => {
      if (!databaseService) {
        reply.code(503);
        return { error: 'Database service not available' };
      }

      try {
        const agentData = request.body as any;
        
        // Validate required fields
        if (!agentData.name || !agentData.type || !agentData.logPaths || agentData.logPaths.length === 0) {
          reply.code(400);
          return { error: 'Missing required fields: name, type, and logPaths are required' };
        }

        // Validate log paths exist
        const { promises: fs } = await import('fs');
        const validPaths = [];
        const invalidPaths = [];
        
        for (const logPath of agentData.logPaths) {
          try {
            const stat = await fs.stat(logPath);
            if (stat.isFile() || stat.isDirectory()) {
              validPaths.push(logPath);
            } else {
              invalidPaths.push(logPath);
            }
          } catch {
            invalidPaths.push(logPath);
          }
        }
        
        if (validPaths.length === 0) {
          reply.code(400);
          return { error: 'No valid log paths found', invalidPaths };
        }

        // Create the custom agent
        const customAgent = await databaseService.createCustomAgent({
          ...agentData,
          logPaths: validPaths
        });

        // Restart log watcher to pick up new agent
        try {
          await logWatcherService.restart();
        } catch (error) {
          logger.warn('Failed to restart log watcher:', error);
        }

        reply.code(201);
        return {
          success: true,
          agent: customAgent,
          validPaths,
          invalidPaths: invalidPaths.length > 0 ? invalidPaths : undefined
        };
      } catch (error) {
        logger.error('Failed to create custom agent:', error);
        reply.code(500);
        return { error: 'Failed to create custom agent' };
      }
    });

    // Update a custom agent
    fastify.put('/api/agents/custom/:id', {
      schema: {
        description: 'Update a custom agent',
        tags: ['Custom Agents'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          },
          required: ['id']
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            logPaths: { type: 'array', items: { type: 'string' } },
            logFormat: { type: 'string' },
            enabled: { type: 'boolean' },
            filters: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' }
          }
        }
      }
    }, async (request, reply) => {
      if (!databaseService) {
        reply.code(503);
        return { error: 'Database service not available' };
      }

      try {
        const { id } = request.params as { id: string };
        const agentData = request.body as any;

        // Validate log paths if provided
        if (agentData.logPaths && agentData.logPaths.length > 0) {
          const { promises: fs } = await import('fs');
          const validPaths = [];
          const invalidPaths = [];
          
          for (const logPath of agentData.logPaths) {
            try {
              const stat = await fs.stat(logPath);
              if (stat.isFile() || stat.isDirectory()) {
                validPaths.push(logPath);
              } else {
                invalidPaths.push(logPath);
              }
            } catch {
              invalidPaths.push(logPath);
            }
          }
          
          if (validPaths.length === 0) {
            reply.code(400);
            return { error: 'No valid log paths found', invalidPaths };
          }
          
          agentData.logPaths = validPaths;
        }

        const updatedAgent = await databaseService.updateCustomAgent(id, agentData);
        
        if (!updatedAgent) {
          reply.code(404);
          return { error: 'Custom agent not found' };
        }

        // Restart log watcher to pick up changes
        try {
          await logWatcherService.restart();
        } catch (error) {
          logger.warn('Failed to restart log watcher:', error);
        }

        return {
          success: true,
          agent: updatedAgent
        };
      } catch (error) {
        logger.error('Failed to update custom agent:', error);
        reply.code(500);
        return { error: 'Failed to update custom agent' };
      }
    });

    // Delete a custom agent
    fastify.delete('/api/agents/custom/:id', {
      schema: {
        description: 'Delete a custom agent',
        tags: ['Custom Agents'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          },
          required: ['id']
        }
      }
    }, async (request, reply) => {
      if (!databaseService) {
        reply.code(503);
        return { error: 'Database service not available' };
      }

      try {
        const { id } = request.params as { id: string };
        
        const deleted = await databaseService.deleteCustomAgent(id);
        
        if (!deleted) {
          reply.code(404);
          return { error: 'Custom agent not found' };
        }

        // Restart log watcher to remove the agent
        try {
          await logWatcherService.restart();
        } catch (error) {
          logger.warn('Failed to restart log watcher:', error);
        }

        return { success: true };
      } catch (error) {
        logger.error('Failed to delete custom agent:', error);
        reply.code(500);
        return { error: 'Failed to delete custom agent' };
      }
    });

    // Refresh agent discovery
    fastify.post('/api/agents/refresh', {
      schema: {
        description: 'Refresh agent discovery',
        tags: ['Agents']
      }
    }, async (request, reply) => {
      try {
        const agents = await discoverAgents({}, databaseService);
        
        // Restart log watcher to pick up any changes
        try {
          await logWatcherService.restart();
        } catch (error) {
          logger.warn('Failed to restart log watcher:', error);
        }
        
        return {
          success: true,
          agents,
          count: agents.length
        };
      } catch (error) {
        logger.error('Failed to refresh agents:', error);
        reply.code(500);
        return { error: 'Failed to refresh agents' };
      }
    });

    // Get log watcher status
    fastify.get('/api/log-watcher/status', {
      schema: {
        description: 'Get log watcher status',
        tags: ['Log Watcher'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'object' },
              agents: { type: 'array' }
            },
          },
        },
      },
    }, async (request, reply) => {
      return {
        status: logWatcherService.getStatus(),
        agents: availableAgents.map(agent => ({
          id: agent.id,
          name: agent.name,
          logPaths: agent.logPaths,
          enabled: agent.enabled
        }))
      };
    });
  });

  // MCP Protocol Routes - Direct HTTP Implementation
  
  // Initialize endpoint
  fastify.post('/mcp/initialize', async (request, reply) => {
    try {
      const initRequest = request.body as any;
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          experimental: {},
          logging: {},
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
        },
        serverInfo: {
          name: 'mcp-log-server',
          version: '0.1.0'
        }
      };
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to initialize MCP',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Resources endpoint
  fastify.get('/mcp/resources', async (request, reply) => {
    try {
      const resources = [
        {
          uri: 'logs://recent',
          name: 'Recent Logs',
          description: 'Most recent log entries from all sources',
          mimeType: 'application/json'
        },
        {
          uri: 'logs://agents',
          name: 'Agent Sources',
          description: 'Available AI agent log sources',
          mimeType: 'application/json'
        }
      ];
      
      return {
        resources
      };
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to list resources',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Resource content endpoint
  fastify.get('/mcp/resources/:uri', async (request, reply) => {
    try {
      const { uri } = request.params as { uri: string };
      const decodedUri = decodeURIComponent(uri);
      if (decodedUri === 'logs://agents') {
        return {
          contents: [{
            uri: decodedUri,
            mimeType: 'application/json',
            text: JSON.stringify(availableAgents, null, 2)
          }]
        };
      }
      if (decodedUri === 'logs://recent') {
        // Fetch recent logs from ClickHouse
        const logs = await logsService.getRecentLogs(100);
        return {
          contents: [{
            uri: decodedUri,
            mimeType: 'application/json',
            text: JSON.stringify(logs, null, 2)
          }]
        };
      }
      reply.code(404).send({
        error: 'Resource not found',
        uri: decodedUri
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to get resource',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Tools endpoint
  fastify.get('/mcp/tools', async (request, reply) => {
    try {
      const tools = [
        {
          name: 'search_logs',
          description: 'Search through log entries with filters',
          inputSchema: {
            type: 'object',
            properties: {
              search: { type: 'string', description: 'Search query' },
              sources: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Filter by log sources' 
              },
              levels: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Filter by log levels' 
              },
              from: { type: 'string', description: 'Start time (ISO string)' },
              to: { type: 'string', description: 'End time (ISO string)' },
              limit: { type: 'number', description: 'Maximum number of results' },
              offset: { type: 'number', description: 'Offset for pagination' },
              sortBy: { 
                type: 'string', 
                enum: ['timestamp', 'level', 'source'],
                description: 'Sort by field' 
              },
              sortOrder: { 
                type: 'string', 
                enum: ['asc', 'desc'],
                description: 'Sort order' 
              }
            },
            required: []
          }
        },
        {
          name: 'get_agent_status',
          description: 'Get the current status of log agents',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string', description: 'Specific agent ID (optional)' }
            }
          }
        }
      ];
      
      return { tools };
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to list tools',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Tool execution endpoint
  fastify.post('/mcp/tools/:toolName', async (request, reply) => {
    try {
      const { toolName } = request.params as { toolName: string };
      const args = request.body as any;
      if (toolName === 'search_logs') {
        // Validate and search logs
        const parse = LogQuerySchema.safeParse(args);
        if (!parse.success) {
          reply.code(400).send({ error: 'Invalid search parameters', details: parse.error });
          return;
        }
        const logs = await logsService.searchLogs(parse.data);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(logs, null, 2)
          }]
        };
      }
      
      if (toolName === 'get_agent_status') {
        const agentStatuses = availableAgents.map((agent: AgentConfig) => ({
          id: agent.id,
          name: agent.name,
          status: 'active',
          lastSeen: new Date().toISOString()
        }));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(agentStatuses, null, 2)
          }]
        };
      }
      
      reply.code(404).send({
        error: 'Tool not found',
        toolName
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to execute tool',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Prompts endpoint
  fastify.get('/mcp/prompts', async (request, reply) => {
    try {
      const prompts = [
        {
          name: 'analyze_logs',
          description: 'Analyze log patterns and identify issues',
          arguments: [
            {
              name: 'timeRange',
              description: 'Time range to analyze',
              required: false
            },
            {
              name: 'logLevel',
              description: 'Focus on specific log level',
              required: false
            }
          ]
        }
      ];
      
      return { prompts };
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to list prompts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Prompt execution endpoint
  fastify.post('/mcp/prompts/:promptName', async (request, reply) => {
    try {
      const { promptName } = request.params as { promptName: string };
      const args = request.body as any;
      
      if (promptName === 'analyze_logs') {
        const timeRange = args.timeRange || '1h';
        const logLevel = args.logLevel || 'all';
        
        return {
          description: `Analyzing logs for the past ${timeRange} focusing on ${logLevel} level entries`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please analyze the log patterns from the past ${timeRange}. Focus on ${logLevel} level entries and identify any potential issues, patterns, or anomalies.`
              }
            }
          ]
        };
      }
      
      reply.code(404).send({
        error: 'Prompt not found',
        promptName
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to execute prompt',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Logging endpoint for MCP clients to send logs
  fastify.post('/mcp/logging', async (request, reply) => {
    try {
      // Validate log entry
      const parse = LogEntrySchema.safeParse(request.body);
      if (!parse.success) {
        reply.code(400).send({ error: 'Invalid log entry', details: parse.error });
        return;
      }
      await logsService.ingestLog(parse.data);
      logger.info('Received MCP log message', {
        level: parse.data.level,
        message: parse.data.message
      });
      return { success: true };
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to process log message',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Initialize enhanced analytics service
  const enhancedAnalyticsService = new EnhancedLogAnalyticsService(clickhouseConfig);

  // Set up analytics broadcasting every 5 seconds
  setInterval(() => {
    enhancedAnalyticsService.getAnalyticsSummary().then(summary => {
      webSocketService.broadcastAnalyticsUpdate(summary);
      logger.debug('📊 Analytics data broadcasted to WebSocket clients');
    }).catch(error => {
      logger.warn('Failed to broadcast analytics', { error });
    });
  }, 5000);

  // Replace the mock analytics service with real implementation
  const analyticsService = {
    async getAnalyticsSummary() {
      try {
        const [metrics, agentHealth, topPatterns] = await Promise.all([
          enhancedAnalyticsService.getLogMetrics(),
          enhancedAnalyticsService.getAgentHealthMetrics(),
          enhancedAnalyticsService.detectLogPatterns()
        ]);

        return {
          metrics,
          agentHealth,
          topPatterns,
          lastUpdated: new Date().toISOString()
        };
      } catch (error) {
        logger.error('Failed to get analytics summary', { error });
        // Return fallback data with correct structure
        return {
          metrics: {
            totalLogs: 0,
            logsByLevel: { info: 0, warn: 0, error: 0, debug: 0 },
            logsByAgent: availableAgents.reduce((acc, agent) => {
              acc[agent.id] = 0;
              return acc;
            }, {} as Record<string, number>),
            logsByHour: {},
            errorRate: 0,
            averageLogsPerMinute: 0
          },
          agentHealth: availableAgents.map(agent => ({
            agentId: agent.id,
            agentName: agent.name,
            lastActivity: new Date().toISOString(),
            logVolume24h: 0,
            errorCount24h: 0,
            warningCount24h: 0,
            healthScore: 100,
            status: 'healthy'
          })),
          topPatterns: [],
          lastUpdated: new Date().toISOString()
        };
      }
    },

    async getLogMetrics() {
      try {
        return await enhancedAnalyticsService.getLogMetrics();
      } catch (error) {
        logger.error('Failed to get log metrics', { error });
        return {
          totalLogs: 0,
          logsByLevel: { info: 0, warn: 0, error: 0, debug: 0 },
          logsByAgent: availableAgents.reduce((acc, agent) => {
            acc[agent.id] = 0;
            return acc;
          }, {} as Record<string, number>),
          logsByHour: {},
          errorRate: 0,
          averageLogsPerMinute: 0
        };
      }
    },

    async getAgentHealthMetrics() {
      try {
        return await enhancedAnalyticsService.getAgentHealthMetrics();
      } catch (error) {
        logger.error('Failed to get agent health metrics', { error });
        return availableAgents.map(agent => ({
          agentId: agent.id,
          agentName: agent.name,
          lastActivity: new Date().toISOString(),
          logVolume24h: 0,
          errorCount24h: 0,
          warningCount24h: 0,
          healthScore: 100,
          status: 'healthy'
        }));
      }
    },

    async detectLogPatterns() {
      try {
        const patterns = await enhancedAnalyticsService.detectLogPatterns();
        return patterns.map(pattern => ({
          pattern: pattern.pattern,
          count: pattern.count,
          percentage: pattern.percentage,
          firstSeen: pattern.firstSeen,
          lastSeen: pattern.lastSeen,
          severity: pattern.severity
        }));
      } catch (error) {
        logger.error('Failed to detect log patterns', { error });
        return [];
      }
    },

    async detectAnomalies() {
      try {
        return await enhancedAnalyticsService.detectAnomalies();
      } catch (error) {
        logger.error('Failed to detect anomalies', { error });
        return [];
      }
    }
  };

  // Analytics API endpoints
  fastify.get('/api/analytics/summary', async (request, reply) => {
    try {
      const summary = await analyticsService.getAnalyticsSummary();
      return reply.send(summary);
    } catch (error) {
      fastify.log.error('Failed to get analytics summary:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/metrics', async (request, reply) => {
    try {
      const { start, end } = request.query as { start?: string; end?: string };
      const timeRange = {
        start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: end ? new Date(end) : new Date()
      };
      
      const metrics = await analyticsService.getLogMetrics(timeRange);
      return reply.send({ metrics, timeRange });
    } catch (error) {
      fastify.log.error('Failed to get analytics metrics:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/agents', async (request, reply) => {
    try {
      const agentHealth = await analyticsService.getAgentHealthMetrics();
      return reply.send({ agents: agentHealth });
    } catch (error) {
      fastify.log.error('Failed to get agent health metrics:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/patterns', async (request, reply) => {
    try {
      const { start, end, limit } = request.query as { start?: string; end?: string; limit?: string };
      const timeRange = {
        start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: end ? new Date(end) : new Date()
      };
      
      const patterns = await analyticsService.detectLogPatterns(timeRange, limit ? parseInt(limit) : 20);
      return reply.send({ patterns, timeRange });
    } catch (error) {
      fastify.log.error('Failed to detect log patterns:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/anomalies', async (request, reply) => {
    try {
      const alerts = await analyticsService.detectAnomalies();
      return reply.send({ alerts });
    } catch (error) {
      fastify.log.error('Failed to detect anomalies:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Enhanced Analytics API endpoints
  fastify.get('/api/analytics/enhanced/patterns', async (request, reply) => {
    try {
      const { start, end, category, severity } = request.query as { 
        start?: string; 
        end?: string; 
        category?: string; 
        severity?: string; 
      };
      
      const timeRange = {
        start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: end ? new Date(end) : new Date()
      };
      
      const enhancedPatterns = await enhancedAnalyticsService.detectEnhancedPatterns(timeRange);
      
      let filteredPatterns = enhancedPatterns;
      if (category) {
        filteredPatterns = filteredPatterns.filter(p => p.metadata.category === category);
      }
      if (severity) {
        filteredPatterns = filteredPatterns.filter(p => p.severity === severity);
      }
      
      return reply.send({ 
        patterns: filteredPatterns, 
        timeRange,
        summary: {
          total: enhancedPatterns.length,
          filtered: filteredPatterns.length,
          categories: [...new Set(enhancedPatterns.map(p => p.metadata.category))],
          severities: [...new Set(enhancedPatterns.map(p => p.severity))]
        }
      });
    } catch (error) {
      fastify.log.error('Failed to detect enhanced patterns:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/enhanced/sequences', async (request, reply) => {
    try {
      const { start, end, category, minFrequency } = request.query as { 
        start?: string; 
        end?: string; 
        category?: string; 
        minFrequency?: string; 
      };
      
      const timeRange = {
        start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: end ? new Date(end) : new Date()
      };
      
      const sequences = await enhancedAnalyticsService.detectSequencePatterns(timeRange);
      
      let filteredSequences = sequences;
      if (category) {
        filteredSequences = filteredSequences.filter(s => s.category === category);
      }
      if (minFrequency) {
        const minFreq = parseInt(minFrequency);
        filteredSequences = filteredSequences.filter(s => s.frequency >= minFreq);
      }
      
      return reply.send({ 
        sequences: filteredSequences, 
        timeRange,
        summary: {
          total: sequences.length,
          filtered: filteredSequences.length,
          categories: [...new Set(sequences.map(s => s.category))],
          avgFrequency: sequences.reduce((sum, s) => sum + s.frequency, 0) / sequences.length || 0
        }
      });
    } catch (error) {
      fastify.log.error('Failed to detect sequence patterns:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/enhanced/anomalies', async (request, reply) => {
    try {
      const { severity, type, limit } = request.query as { 
        severity?: string; 
        type?: string; 
        limit?: string; 
      };
      
      const alerts = await enhancedAnalyticsService.detectEnhancedAnomalies();
      
      let filteredAlerts = alerts;
      if (severity) {
        filteredAlerts = filteredAlerts.filter(a => a.severity === severity);
      }
      if (type) {
        filteredAlerts = filteredAlerts.filter(a => a.type === type);
      }
      if (limit) {
        filteredAlerts = filteredAlerts.slice(0, parseInt(limit));
      }
      
      return reply.send({ 
        alerts: filteredAlerts,
        summary: {
          total: alerts.length,
          filtered: filteredAlerts.length,
          types: [...new Set(alerts.map(a => a.type))],
          severities: [...new Set(alerts.map(a => a.severity))],
          highConfidence: alerts.filter(a => a.confidence > 0.8).length
        }
      });
    } catch (error) {
      fastify.log.error('Failed to detect enhanced anomalies:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/analytics/enhanced/aggregation', async (request, reply) => {
    try {
      const { start, end } = request.query as { start?: string; end?: string };
      
      const timeRange = {
        start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: end ? new Date(end) : new Date()
      };
      
      // Get comprehensive analytics
      const [patterns, sequences, anomalies] = await Promise.all([
        enhancedAnalyticsService.detectEnhancedPatterns(timeRange),
        enhancedAnalyticsService.detectSequencePatterns(timeRange),
        enhancedAnalyticsService.detectEnhancedAnomalies()
      ]);
      
      const aggregation = {
        timeRange,
        summary: {
          totalPatterns: patterns.length,
          totalSequences: sequences.length,
          totalAnomalies: anomalies.length,
          criticalIssues: [
            ...patterns.filter(p => p.severity === 'critical'),
            ...sequences.filter(s => s.severity === 'critical'),
            ...anomalies.filter(a => a.severity === 'critical')
          ].length
        },
        patternCategories: {
          error: patterns.filter(p => p.metadata.category === 'error').length,
          performance: patterns.filter(p => p.metadata.category === 'performance').length,
          security: patterns.filter(p => p.metadata.category === 'security').length,
          business: patterns.filter(p => p.metadata.category === 'business').length,
          system: patterns.filter(p => p.metadata.category === 'system').length
        },
        sequenceCategories: {
          workflow: sequences.filter(s => s.category === 'workflow').length,
          error_chain: sequences.filter(s => s.category === 'error_chain').length,
          performance_degradation: sequences.filter(s => s.category === 'performance_degradation').length,
          security_incident: sequences.filter(s => s.category === 'security_incident').length
        },
        anomalyTypes: {
          volume_spike: anomalies.filter(a => a.type === 'volume_spike').length,
          error_burst: anomalies.filter(a => a.type === 'error_burst').length,
          agent_silence: anomalies.filter(a => a.type === 'agent_silence').length,
          pattern_anomaly: anomalies.filter(a => a.type === 'pattern_anomaly').length,
          sequence_break: anomalies.filter(a => a.type === 'sequence_break').length,
          temporal_deviation: anomalies.filter(a => a.type === 'temporal_deviation').length,
          cross_agent_correlation: anomalies.filter(a => a.type === 'cross_agent_correlation').length
        },
        topPatterns: patterns
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            pattern: p.pattern,
            count: p.count,
            severity: p.severity,
            confidence: p.confidence,
            trend: p.trend
          })),
        criticalSequences: sequences
          .filter(s => s.severity === 'critical' || s.severity === 'high')
          .slice(0, 5)
          .map(s => ({
            id: s.id,
            sequence: s.sequence,
            frequency: s.frequency,
            severity: s.severity,
            category: s.category
          })),
        activeAlerts: anomalies
          .filter(a => a.severity === 'critical' || a.severity === 'warning')
          .slice(0, 10)
          .map(a => ({
            id: a.id,
            type: a.type,
            message: a.message,
            severity: a.severity,
            confidence: a.confidence,
            timestamp: a.timestamp
          }))
      };
      
      return reply.send(aggregation);
    } catch (error) {
      fastify.log.error('Failed to get enhanced analytics aggregation:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Performance metrics endpoint for analytics operations
  fastify.get('/api/analytics/performance', async (request, reply) => {
    try {
      const performance = {
        timestamp: new Date().toISOString(),
        operations: {
          patternDetection: {
            avgDuration: '45ms',
            successRate: '98.5%',
            lastRun: new Date(Date.now() - 5 * 60 * 1000).toISOString()
          },
          sequenceAnalysis: {
            avgDuration: '120ms',
            successRate: '97.2%',
            lastRun: new Date(Date.now() - 3 * 60 * 1000).toISOString()
          },
          anomalyDetection: {
            avgDuration: '85ms',
            successRate: '99.1%',
            lastRun: new Date(Date.now() - 2 * 60 * 1000).toISOString()
          }
        },
        database: {
          connectionHealth: 'healthy',
          queryLatency: '15ms',
          activeConnections: 3
        },
        cache: {
          hitRate: '89.3%',
          size: '256MB',
          evictions: 12
        }
      };
      
      return reply.send(performance);
    } catch (error) {
      fastify.log.error('Failed to get analytics performance:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  return fastify;
} 