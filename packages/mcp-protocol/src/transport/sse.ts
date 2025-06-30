import { BaseTransport } from './base.js';
import { JSONRPCMessage } from '../jsonrpc.js';
import { TransportType } from '@mcp-log-server/types';

export interface SSETransportOptions {
  url: string;
  headers?: Record<string, string>;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export class SSETransport extends BaseTransport {
  readonly type: TransportType = 'sse';
  private url: string;
  private headers: Record<string, string>;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private heartbeatInterval: number;
  private eventSource: EventSource | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastMessageTime: number = 0;

  constructor(options: SSETransportOptions) {
    super();
    this.url = options.url;
    this.headers = options.headers ?? {};
    this.reconnectInterval = options.reconnectInterval ?? 3000; // 3 seconds
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000; // 30 seconds
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create EventSource with custom headers if needed
        const eventSourceInitDict: EventSourceInit = {};
        
        this.eventSource = new EventSource(this.url, eventSourceInitDict);

        this.eventSource.onopen = () => {
          this.reconnectAttempts = 0;
          this.lastMessageTime = Date.now();
          this.startHeartbeat();
          this.emitConnect();
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          this.lastMessageTime = Date.now();
          try {
            const message = JSON.parse(event.data) as JSONRPCMessage;
            this.emitMessage(message);
          } catch (error) {
            this.emitError(new Error(`Failed to parse SSE message: ${error}`));
          }
        };

        this.eventSource.onerror = (event) => {
          const error = new Error(`SSE connection error: ${event}`);
          this.emitError(error);
          
          if (this.eventSource?.readyState === EventSource.CLOSED) {
            this.handleReconnect();
          }
          
          // Reject promise only on initial connect failure
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

        // Listen for custom MCP events
        this.eventSource.addEventListener('mcp-log', (event) => {
          this.lastMessageTime = Date.now();
          try {
            const customEvent = event as MessageEvent;
            const message = JSON.parse(customEvent.data) as JSONRPCMessage;
            this.emitMessage(message);
          } catch (error) {
            this.emitError(new Error(`Failed to parse MCP log event: ${error}`));
          }
        });

        // Listen for heartbeat/ping events
        this.eventSource.addEventListener('ping', () => {
          this.lastMessageTime = Date.now();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.stopReconnectTimer();
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.emitClose();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // SSE is typically unidirectional (server to client)
    // For bidirectional communication, we'd need to use a different approach
    // like sending via HTTP POST to a separate endpoint
    throw new Error('SSE transport does not support sending messages (server-to-client only)');
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emitError(new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`));
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.emitError(error instanceof Error ? error : new Error(String(error)));
        this.handleReconnect();
      });
    }, this.reconnectInterval * Math.min(this.reconnectAttempts, 5)); // Cap exponential backoff
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;
      
      if (timeSinceLastMessage > this.heartbeatInterval * 2) {
        // No message received for too long, consider connection stale
        this.emitError(new Error('SSE connection appears stale (no heartbeat)'));
        this.handleReconnect();
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  override get isConnected(): boolean {
    return super.isConnected && this.eventSource?.readyState === EventSource.OPEN;
  }

  getReadyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED;
  }
} 