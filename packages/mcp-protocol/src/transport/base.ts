import { EventEmitter } from 'events';
import { Transport, JSONRPCMessage, TransportType } from "@mcp-log-server/types";

export interface TransportEvents {
  message: [message: JSONRPCMessage];
  error: [error: Error];
  close: [];
  connect: [];
}

/**
 * Base transport implementation
 * Provides common functionality for all transport types
 */
export abstract class BaseTransport extends EventEmitter implements Transport {
  abstract readonly type: TransportType;
  
  protected connected = false;
  protected connecting = false;

  /**
   * Whether the transport is currently connected
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Whether the transport is currently connecting
   */
  get isConnecting(): boolean {
    return this.connecting;
  }

  /**
   * Connect to the transport
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the transport
   */
  abstract disconnect(): Promise<void>;

  /**
   * Send a message through the transport
   */
  abstract send(message: JSONRPCMessage): Promise<void>;

  /**
   * Register message handler
   */
  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.on("message", handler);
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): void {
    this.on("error", handler);
  }

  /**
   * Register close handler
   */
  onClose(handler: () => void): void {
    this.on("close", handler);
  }

  /**
   * Remove message handler
   */
  removeMessageHandler(handler: (message: JSONRPCMessage) => void): void {
    this.off("message", handler);
  }

  /**
   * Remove error handler
   */
  removeErrorHandler(handler: (error: Error) => void): void {
    this.off("error", handler);
  }

  /**
   * Remove close handler
   */
  removeCloseHandler(handler: () => void): void {
    this.off("close", handler);
  }

  /**
   * Safely emit message event with error handling
   */
  protected emitMessage(message: JSONRPCMessage): void {
    try {
      this.emit("message", message);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Safely emit error event
   */
  protected emitError(error: Error): void {
    this.emit("error", error);
  }

  /**
   * Safely emit close event
   */
  protected emitClose(): void {
    this.connected = false;
    this.connecting = false;
    this.emit("close");
  }

  /**
   * Safely emit connect event
   */
  protected emitConnect(): void {
    this.connected = true;
    this.connecting = false;
    this.emit("connect");
  }

  /**
   * Parse JSON message with error handling
   */
  protected parseMessage(data: string): JSONRPCMessage | null {
    try {
      const parsed = JSON.parse(data);
      // Basic validation - proper validation should be done by the handler
      if (!parsed || typeof parsed !== "object" || parsed.jsonrpc !== "2.0") {
        throw new Error("Invalid JSON-RPC message format");
      }
      return parsed as JSONRPCMessage;
    } catch (error) {
      this.emitError(new Error(`Failed to parse message: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * Serialize message to JSON string
   */
  protected serializeMessage(message: JSONRPCMessage): string {
    try {
      return JSON.stringify(message);
    } catch (error) {
      throw new Error(`Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.removeAllListeners();
    if (this.connected) {
      this.disconnect().catch((error) => {
        console.error("Error during transport disposal:", error);
      });
    }
  }
} 