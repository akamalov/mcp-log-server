import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import type { LogEntry, AgentConfig } from '@mcp-log-server/types';
import fastifyWebSocket from '@fastify/websocket';

interface WebSocketClient {
  id: string;
  socket: any;
  subscriptions: Set<string>;
  lastPing: Date;
  isAlive: boolean;
}

interface RealtimeMessage {
  type: 'log-entry' | 'analytics-update' | 'agent-status' | 'pattern-alert' | 'health-update' | 'ping' | 'pong';
  timestamp: string;
  data: any;
}

export class WebSocketService extends EventEmitter {
  private clients = new Map<string, WebSocketClient>();
  private fastify: FastifyInstance;
  private heartbeatInterval: NodeJS.Timeout;
  private analyticsCache: any = null;
  private lastAnalyticsUpdate: Date = new Date();

  constructor(fastify: FastifyInstance) {
    super();
    this.fastify = fastify;
    this.setupHeartbeat();
  }

  /**
   * Initialize WebSocket routes and handlers
   */
  async initialize() {
    await this.fastify.register(fastifyWebSocket);

    // WebSocket endpoint for real-time log streaming
    this.fastify.register(async (fastify) => {
      fastify.get('/ws/logs', { websocket: true }, (connection, request) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const client: WebSocketClient = {
          id: clientId,
          socket: connection,
          subscriptions: new Set(['logs']),
          lastPing: new Date(),
          isAlive: true
        };

        this.clients.set(clientId, client);
        console.log(`🔌 WebSocket client connected: ${clientId} (${this.clients.size} total)`);

        // Send welcome message
        this.sendToClient(clientId, {
          type: 'ping',
          timestamp: new Date().toISOString(),
          data: { message: 'Connected to MCP Log Server', clientId }
        });

        // Handle incoming messages
        connection.on('message', (message: Buffer) => {
          try {
            const data = JSON.parse(message.toString());
            this.handleClientMessage(clientId, data);
          } catch (error) {
            console.warn(`❌ Invalid WebSocket message from ${clientId}:`, error);
          }
        });

        // Handle client disconnect
        connection.on('close', () => {
          this.clients.delete(clientId);
          console.log(`🔌 WebSocket client disconnected: ${clientId} (${this.clients.size} remaining)`);
        });

        // Handle connection errors
        connection.on('error', (error: Error) => {
          console.warn(`❌ WebSocket error for ${clientId}:`, error);
          this.clients.delete(clientId);
        });

        // Handle pong responses for heartbeat
        connection.on('pong', () => {
          if (this.clients.has(clientId)) {
            this.clients.get(clientId)!.isAlive = true;
            this.clients.get(clientId)!.lastPing = new Date();
          }
        });
      });

      // WebSocket endpoint for analytics updates
      fastify.get('/ws/analytics', { websocket: true }, (connection, request) => {
        const clientId = `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const client: WebSocketClient = {
          id: clientId,
          socket: connection,
          subscriptions: new Set(['analytics', 'health']),
          lastPing: new Date(),
          isAlive: true
        };

        this.clients.set(clientId, client);
        console.log(`📊 Analytics WebSocket client connected: ${clientId}`);

        // Send current analytics if available
        if (this.analyticsCache) {
          this.sendToClient(clientId, {
            type: 'analytics-update',
            timestamp: new Date().toISOString(),
            data: this.analyticsCache
          });
        }

        // Handle incoming messages
        connection.on('message', (message: Buffer) => {
          try {
            const data = JSON.parse(message.toString());
            this.handleClientMessage(clientId, data);
          } catch (error) {
            console.warn(`❌ Invalid WebSocket message from analytics client ${clientId}:`, error);
          }
        });

        // Handle client disconnect and errors (same as above)
        connection.on('close', () => {
          this.clients.delete(clientId);
          console.log(`📊 Analytics WebSocket client disconnected: ${clientId}`);
        });

        connection.on('error', (error: Error) => {
          console.warn(`❌ Analytics WebSocket error for ${clientId}:`, error);
          this.clients.delete(clientId);
        });

        connection.on('pong', () => {
          if (this.clients.has(clientId)) {
            this.clients.get(clientId)!.isAlive = true;
            this.clients.get(clientId)!.lastPing = new Date();
          }
        });
      });
    });

    console.log('✅ WebSocket service initialized with endpoints: /ws/logs, /ws/analytics');
  }

  /**
   * Handle incoming messages from WebSocket clients
   */
  private handleClientMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        if (message.channels && Array.isArray(message.channels)) {
          message.channels.forEach((channel: string) => {
            client.subscriptions.add(channel);
          });
          console.log(`📡 Client ${clientId} subscribed to: ${message.channels.join(', ')}`);
        }
        break;

      case 'unsubscribe':
        if (message.channels && Array.isArray(message.channels)) {
          message.channels.forEach((channel: string) => {
            client.subscriptions.delete(channel);
          });
          console.log(`📡 Client ${clientId} unsubscribed from: ${message.channels.join(', ')}`);
        }
        break;

      case 'pong':
        client.isAlive = true;
        client.lastPing = new Date();
        break;

      case 'request-analytics':
        if (this.analyticsCache) {
          this.sendToClient(clientId, {
            type: 'analytics-update',
            timestamp: new Date().toISOString(),
            data: this.analyticsCache
          });
        }
        break;

      default:
        console.log(`📨 Unknown message type from ${clientId}:`, message.type);
    }
  }

  /**
   * Broadcast a new log entry to subscribed clients
   */
  broadcastLogEntry(logEntry: LogEntry) {
    const message: RealtimeMessage = {
      type: 'log-entry',
      timestamp: new Date().toISOString(),
      data: logEntry
    };

    this.broadcastToSubscribers('logs', message);
  }

  /**
   * Broadcast analytics update to subscribed clients
   */
  broadcastAnalyticsUpdate(analytics: any) {
    this.analyticsCache = analytics;
    this.lastAnalyticsUpdate = new Date();

    const message: RealtimeMessage = {
      type: 'analytics-update',
      timestamp: new Date().toISOString(),
      data: analytics
    };

    this.broadcastToSubscribers('analytics', message);
  }

  /**
   * Broadcast agent status changes
   */
  broadcastAgentStatus(agents: AgentConfig[]) {
    const message: RealtimeMessage = {
      type: 'agent-status',
      timestamp: new Date().toISOString(),
      data: { agents, totalAgents: agents.length }
    };

    this.broadcastToSubscribers(['analytics', 'health'], message);
  }

  /**
   * Broadcast pattern detection alerts
   */
  broadcastPatternAlert(pattern: any) {
    const message: RealtimeMessage = {
      type: 'pattern-alert',
      timestamp: new Date().toISOString(),
      data: pattern
    };

    this.broadcastToSubscribers(['analytics', 'logs'], message);
  }

  /**
   * Broadcast health status updates
   */
  broadcastHealthUpdate(health: any) {
    const message: RealtimeMessage = {
      type: 'health-update',
      timestamp: new Date().toISOString(),
      data: health
    };

    this.broadcastToSubscribers('health', message);
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(clientId: string, message: RealtimeMessage) {
    const client = this.clients.get(clientId);
    if (!client || !client.isAlive) return;

    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      console.warn(`❌ Failed to send message to client ${clientId}:`, error);
      this.clients.delete(clientId);
    }
  }

  /**
   * Broadcast message to clients subscribed to specific channels
   */
  private broadcastToSubscribers(channels: string | string[], message: RealtimeMessage) {
    const targetChannels = Array.isArray(channels) ? channels : [channels];
    let sentCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      if (!client.isAlive) continue;

      const hasSubscription = targetChannels.some(channel => 
        client.subscriptions.has(channel)
      );

      if (hasSubscription) {
        this.sendToClient(clientId, message);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      console.log(`📡 Broadcasted ${message.type} to ${sentCount} clients`);
    }
  }

  /**
   * Setup heartbeat mechanism to detect disconnected clients
   */
  private setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const disconnectedClients: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
        
        if (timeSinceLastPing > 60000) { // 60 seconds timeout
          disconnectedClients.push(clientId);
        } else if (timeSinceLastPing > 30000) { // Send ping after 30 seconds
          try {
            client.socket.ping();
            client.isAlive = false; // Will be set back to true on pong
          } catch (error) {
            disconnectedClients.push(clientId);
          }
        }
      }

      // Clean up disconnected clients
      disconnectedClients.forEach(clientId => {
        console.log(`🧹 Cleaning up disconnected client: ${clientId}`);
        this.clients.delete(clientId);
      });

      if (this.clients.size > 0) {
        console.log(`❤️  WebSocket heartbeat: ${this.clients.size} active clients`);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get current WebSocket statistics
   */
  getStats() {
    const subscriptionCounts: Record<string, number> = {};
    
    for (const client of this.clients.values()) {
      for (const subscription of client.subscriptions) {
        subscriptionCounts[subscription] = (subscriptionCounts[subscription] || 0) + 1;
      }
    }

    return {
      totalClients: this.clients.size,
      subscriptionCounts,
      lastAnalyticsUpdate: this.lastAnalyticsUpdate
    };
  }

  /**
   * Cleanup and close all connections
   */
  async shutdown() {
    console.log('🔌 Shutting down WebSocket service...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.socket.close();
      } catch (error) {
        console.warn(`❌ Error closing WebSocket for ${clientId}:`, error);
      }
    }

    this.clients.clear();
    console.log('✅ WebSocket service shut down complete');
  }
} 