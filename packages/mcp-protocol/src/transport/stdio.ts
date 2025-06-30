import { spawn, ChildProcess } from "child_process";
import { JSONRPCMessage } from "@mcp-log-server/types";
import { BaseTransport } from "./base.js";

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

/**
 * Stdio transport for spawning and communicating with MCP servers
 * Uses stdin/stdout for JSON-RPC message exchange
 */
export class StdioTransport extends BaseTransport {
  readonly type = "stdio" as const;
  
  private process: ChildProcess | null = null;
  private messageBuffer = "";

  constructor(private options: StdioTransportOptions) {
    super();
  }

  /**
   * Connect by spawning the MCP server process
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      await this.spawnProcess();
      this.emitConnect();
    } catch (error) {
      this.connecting = false;
      throw error;
    }
  }

  /**
   * Disconnect by terminating the server process
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    return new Promise((resolve) => {
      if (!this.process) {
        this.emitClose();
        resolve();
        return;
      }

      const cleanup = () => {
        this.process = null;
        this.messageBuffer = "";
        this.emitClose();
        resolve();
      };

      // Set up termination timeout
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill("SIGKILL");
          cleanup();
        }
      }, this.options.timeout ?? 5000);

      this.process.once("exit", () => {
        clearTimeout(timeout);
        cleanup();
      });

      this.process.once("error", () => {
        clearTimeout(timeout);
        cleanup();
      });

      // Try graceful shutdown first
      this.process.kill("SIGTERM");
    });
  }

  /**
   * Send message to server via stdin
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.connected || !this.process?.stdin) {
      throw new Error("Transport not connected");
    }

    const serialized = this.serializeMessage(message);
    
    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(serialized + "\n", (error) => {
        if (error) {
          reject(new Error(`Failed to send message: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Spawn the MCP server process and set up communication
   */
  private async spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { command, args = [], cwd, env } = this.options;
      
      this.process = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Handle process startup
      this.process.once("spawn", () => {
        this.setupProcessHandlers();
        resolve();
      });

      this.process.once("error", (error) => {
        reject(new Error(`Failed to spawn process: ${error.message}`));
      });

      // Handle immediate exit (e.g., command not found)
      this.process.once("exit", (code, signal) => {
        if (this.connecting) {
          reject(new Error(`Process exited during startup with code ${code} signal ${signal}`));
        }
      });
    });
  }

  /**
   * Set up process event handlers and message parsing
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle stdout messages
    this.process.stdout?.on("data", (data: Buffer) => {
      this.handleStdoutData(data.toString("utf-8"));
    });

    // Handle stderr for debugging
    this.process.stderr?.on("data", (data: Buffer) => {
      const message = data.toString("utf-8").trim();
      if (message) {
        this.emitError(new Error(`Server stderr: ${message}`));
      }
    });

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      this.emitError(new Error(`Server process exited with code ${code} signal ${signal}`));
      this.emitClose();
    });

    // Handle process errors
    this.process.on("error", (error) => {
      this.emitError(new Error(`Server process error: ${error.message}`));
    });
  }

  /**
   * Handle stdout data and parse JSON-RPC messages
   */
  private handleStdoutData(data: string): void {
    this.messageBuffer += data;

    // Process complete lines
    const lines = this.messageBuffer.split("\n");
    this.messageBuffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const message = this.parseMessage(trimmed);
      if (message) {
        this.emitMessage(message);
      }
    }
  }
} 