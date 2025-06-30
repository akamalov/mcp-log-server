import { EventEmitter } from 'events';
import { 
  JSONRPCMessage, 
  JSONRPCRequest, 
  JSONRPCResponse, 
  JSONRPCNotification,
  JSONRPCId,
  JSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse,
  isJSONRPCNotification,
  MCP_ERRORS 
} from "@mcp-log-server/types";

// Re-export types for use by other modules
export type { JSONRPCMessage, JSONRPCError, JSONRPCRequest, JSONRPCResponse, JSONRPCNotification };

export interface JSONRPCRequestHandler {
  (request: JSONRPCRequest): Promise<unknown>;
}

export interface JSONRPCNotificationHandler {
  (notification: JSONRPCNotification): Promise<void>;
}

/**
 * Events emitted by the JSON-RPC handler
 */
export interface JSONRPCEvents {
  message: [message: JSONRPCMessage];
  request: [request: JSONRPCRequest];
  response: [response: JSONRPCResponse]; 
  notification: [notification: JSONRPCNotification];
  error: [error: Error];
}

/**
 * JSON-RPC 2.0 protocol handler
 * Provides request/response lifecycle management and message routing
 */
export class JSONRPCHandler extends EventEmitter {
  private requestHandlers = new Map<string, JSONRPCRequestHandler>();
  private notificationHandlers = new Map<string, JSONRPCNotificationHandler>();
  private pendingRequests = new Map<JSONRPCId, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestIdCounter = 0;
  private readonly requestTimeout: number;

  constructor(options: { requestTimeout?: number } = {}) {
    super();
    this.requestTimeout = options.requestTimeout ?? 30000; // 30 seconds default
  }

  /**
   * Register a handler for a specific method
   */
  onRequest(method: string, handler: JSONRPCRequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  /**
   * Register a handler for notifications
   */
  onNotification(method: string, handler: JSONRPCNotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Remove a request handler
   */
  removeRequestHandler(method: string): void {
    this.requestHandlers.delete(method);
  }

  /**
   * Remove a notification handler
   */
  removeNotificationHandler(method: string): void {
    this.notificationHandlers.delete(method);
  }

  /**
   * Create a JSON-RPC request
   */
  createRequest(method: string, params?: Record<string, unknown>): JSONRPCRequest {
    const id = this.generateRequestId();
    return {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
  }

  /**
   * Create a JSON-RPC notification
   */
  createNotification(method: string, params?: Record<string, unknown>): JSONRPCNotification {
    return {
      jsonrpc: "2.0",
      method,
      params,
    };
  }

  /**
   * Create a success response
   */
  createResponse(id: JSONRPCId, result: unknown): JSONRPCResponse {
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  }

  /**
   * Create an error response
   */
  createErrorResponse(id: JSONRPCId, error: JSONRPCError): JSONRPCResponse {
    return {
      jsonrpc: "2.0",
      id,
      error,
    };
  }

  /**
   * Send a request and wait for response
   */
  async sendRequest(
    message: JSONRPCRequest,
    sendMessage: (msg: JSONRPCMessage) => Promise<void>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pendingRequests.set(message.id, { resolve, reject, timeout });
      
      sendMessage(message).catch((error) => {
        this.pendingRequests.delete(message.id);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Process a JSON-RPC message
   */
  public handleMessage(data: string | Buffer): void {
    try {
      const parsed = JSON.parse(data.toString());
      const message = this.validateMessage(parsed);
      
      this.emit("message", message);
      
      if (this.isRequest(message)) {
        this.emit("request", message);
      } else if (this.isResponse(message)) {
        this.emit("response", message);
      } else if (this.isNotification(message)) {
        this.emit("notification", message);
      }
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate that the parsed data is a valid JSON-RPC message
   */
  private validateMessage(data: unknown): JSONRPCMessage {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON-RPC message: not an object');
    }
    
    const obj = data as any;
    if (obj.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC message: missing or invalid jsonrpc version');
    }
    
    return obj as JSONRPCMessage;
  }

  /**
   * Check if message is a request
   */
  private isRequest(message: JSONRPCMessage): message is JSONRPCRequest {
    return isJSONRPCRequest(message);
  }

  /**
   * Check if message is a response
   */
  private isResponse(message: JSONRPCMessage): message is JSONRPCResponse {
    return isJSONRPCResponse(message);
  }

  /**
   * Check if message is a notification
   */
  private isNotification(message: JSONRPCMessage): message is JSONRPCNotification {
    return isJSONRPCNotification(message);
  }

  /**
   * Handle incoming request
   */
  private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const handler = this.requestHandlers.get(request.method);
    
    if (!handler) {
      return this.createErrorResponse(request.id, {
        code: MCP_ERRORS.METHOD_NOT_FOUND.code,
        message: `Method '${request.method}' not found`,
      });
    }

    try {
      const result = await handler(request);
      return this.createResponse(request.id, result);
    } catch (error) {
      return this.createErrorResponse(request.id, {
        code: MCP_ERRORS.INTERNAL_ERROR.code,
        message: MCP_ERRORS.INTERNAL_ERROR.message,
        data: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle incoming response
   */
  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    
    if (!pending) {
      this.handleRequestError(null, response as JSONRPCRequest);
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      const error = new Error(response.error.message);
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle incoming notification
   */
  private async handleNotification(notification: JSONRPCNotification): Promise<void> {
    const handler = this.notificationHandlers.get(notification.method);
    
    if (!handler) {
      this.handleNotificationError(null, notification);
      return;
    }

    try {
      await handler(notification);
    } catch (error) {
      this.handleNotificationError(error, notification);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): number {
    return ++this.requestIdCounter;
  }

  /**
   * Clean up pending requests
   */
  dispose(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("JSON-RPC handler disposed"));
    }
    this.pendingRequests.clear();
    this.removeAllListeners();
  }

  private handleRequestError(error: unknown, request: JSONRPCRequest): void {
    this.emit("error", new Error(`Unexpected response with id: ${request.id}`));
  }

  private handleNotificationError(error: unknown, notification: JSONRPCNotification): void {
    this.emit("error", new Error(`Unknown notification method: ${notification.method}`));
  }

  private handleGeneralError(error: unknown): void {
    this.emit("error", error instanceof Error ? error : new Error(String(error)));
  }
} 