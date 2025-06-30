import { BaseTransport } from './base.js';
import { JSONRPCMessage } from '../jsonrpc.js';
import { TransportType } from '@mcp-log-server/types';

export interface HTTPTransportOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export class HTTPTransport extends BaseTransport {
  readonly type: TransportType = 'http';
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(options: HTTPTransportOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
    this.timeout = options.timeout ?? 30000; // 30 seconds default
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1000; // 1 second default
  }

  async connect(): Promise<void> {
    try {
      // Test connectivity with a health check
      const response = await this.makeRequest('GET', '/health');
      if (response.ok) {
        this.emitConnect();
      } else {
        throw new Error(`HTTP connection failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.emitClose();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('HTTP transport not connected');
    }

    try {
      const response = await this.makeRequestWithRetry('POST', '/mcp', message);
      
      if (!response.ok) {
        throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      this.emitMessage(responseData);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async makeRequest(method: string, path: string, data?: any): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    return fetch(url, options);
  }

  private async makeRequestWithRetry(method: string, path: string, data?: any): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.makeRequest(method, path, data);
        
        // If successful or client error (4xx), don't retry
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        // Server error (5xx), retry if we have attempts left
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * Math.pow(2, attempt)); // Exponential backoff
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        
        // If it's an AbortError or client error, don't retry
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        
        // If we have attempts left, wait and retry
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastError || new Error('HTTP request failed after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 