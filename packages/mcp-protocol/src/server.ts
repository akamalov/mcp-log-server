import { EventEmitter } from 'events';
import { JSONRPCHandler, JSONRPCMessage, JSONRPCError } from './jsonrpc.js';
import { BaseTransport } from './transport/base.js';
import {
  ServerInfo,
  ClientInfo,
  ServerCapabilities,
  ClientCapabilities,
  InitializeRequest,
  InitializeResponse,
  Resource,
  Tool,
  Prompt,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  LoggingLevel,
  Content,
  MCP_ERRORS,
  Capabilities,
  ProgressToken,
  ResourceTemplate,
  ToolTemplate,
  PromptTemplate,
  Notification,
} from '@mcp-log-server/types';
import { CapabilityNegotiator } from './capabilities.js';
import { MCPLogger } from './logging.js';

export interface MCPServerOptions {
  name: string;
  version: string;
  transport: BaseTransport;
  capabilities?: Partial<ServerCapabilities>;
  logging?: {
    level?: LoggingLevel;
  };
}

export interface ResourceHandler {
  (uri: string, options?: any): Promise<{ contents: Content[] }>;
}

export interface ToolHandler {
  (args?: any, meta?: { progressToken?: ProgressToken }): Promise<{ content: Content[] }>;
}

export interface PromptHandler {
  (args?: any): Promise<{ description?: string; messages: Content[] }>;
}

export class MCPServer extends EventEmitter {
  private readonly serverInfo: ServerInfo;
  private readonly serverCapabilities: ServerCapabilities;
  private readonly transport: BaseTransport;
  private readonly jsonrpc: JSONRPCHandler;
  private readonly logger: MCPLogger;

  private clientInfo: ClientInfo | null = null;
  private negotiatedCapabilities: Capabilities | null = null;
  private initialized: boolean = false;
  
  // Resource management
  private resourceTemplates: Map<string, ResourceTemplate> = new Map();
  private resourceHandlers: Map<string, ResourceHandler> = new Map();
  
  // Tool management
  private toolTemplates: Map<string, ToolTemplate> = new Map();
  private toolHandlers: Map<string, ToolHandler> = new Map();
  
  // Prompt management
  private promptTemplates: Map<string, PromptTemplate> = new Map();
  private promptHandlers: Map<string, PromptHandler> = new Map();

  private loggingLevel: LoggingLevel;

  constructor(options: MCPServerOptions) {
    super();
    
    this.serverInfo = {
      name: options.name,
      version: options.version,
    };

    this.serverCapabilities = {
      experimental: {},
      logging: {},
      prompts: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      tools: { listChanged: true },
      ...options.capabilities,
    };

    this.transport = options.transport;
    this.jsonrpc = new JSONRPCHandler();
    this.logger = new MCPLogger('mcp-server');
    this.loggingLevel = options.logging?.level ?? 'info';

    this.setupTransport();
    this.setupMessageHandlers();
  }

  private setupTransport(): void {
    this.transport.on('message', (message: JSONRPCMessage) => {
      this.jsonrpc.handleMessage(JSON.stringify(message));
    });

    this.transport.on('error', (error: Error) => {
      this.logger.error('Transport error:', error);
      this.emit('error', error);
    });

    this.transport.on('close', () => {
      this.logger.info('Transport closed');
      this.emit('close');
    });

    this.transport.on('connect', () => {
      this.logger.info('Transport connected');
      this.emit('connect');
    });
  }

  private setupMessageHandlers(): void {
    // Core MCP protocol handlers
    this.jsonrpc.on('initialize', this.handleInitialize.bind(this));
    this.jsonrpc.on('initialized', this.handleInitialized.bind(this));
    this.jsonrpc.on('ping', this.handlePing.bind(this));
    
    // Resource handlers
    this.jsonrpc.on('resources/list', this.handleResourcesList.bind(this));
    this.jsonrpc.on('resources/read', this.handleResourcesRead.bind(this));
    this.jsonrpc.on('resources/templates/list', this.handleResourceTemplatesList.bind(this));
    this.jsonrpc.on('resources/subscribe', this.handleResourcesSubscribe.bind(this));
    this.jsonrpc.on('resources/unsubscribe', this.handleResourcesUnsubscribe.bind(this));
    
    // Tool handlers
    this.jsonrpc.on('tools/list', this.handleToolsList.bind(this));
    this.jsonrpc.on('tools/call', this.handleToolsCall.bind(this));
    
    // Prompt handlers
    this.jsonrpc.on('prompts/list', this.handlePromptsList.bind(this));
    this.jsonrpc.on('prompts/get', this.handlePromptsGet.bind(this));
    
    // Logging handlers
    this.jsonrpc.on('logging/setLevel', this.handleLoggingSetLevel.bind(this));
  }

  // Core protocol handlers
  private async handleInitialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientInfo = request.params.clientInfo;
    
    // Validate protocol version
    const clientVersion = request.params.protocolVersion;
    if (clientVersion !== '2024-11-05') {
      throw {
        code: MCP_ERRORS.INVALID_REQUEST.code,
        message: `Unsupported protocol version: ${clientVersion}`
      };
    }

    // Negotiate capabilities
    const negotiatedCapabilities = this.negotiateCapabilities(request.params.capabilities);
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: negotiatedCapabilities,
        serverInfo: this.serverInfo,
      }
    };
  }

  private async handleInitialized(): Promise<void> {
    this.initialized = true;
    this.emit('initialized');
  }

  private async handlePing(): Promise<{}> {
    return {};
  }

  // Resource handlers
  private async handleResourcesList(): Promise<{ resources: Resource[] }> {
    const resources: Resource[] = [];
    
    for (const [uri, template] of this.resourceTemplates) {
      resources.push({
        uri,
        name: template.name,
        description: template.description,
        mimeType: template.mimeType,
      });
    }
    
    return { resources };
  }

  private async handleResourcesRead(params: { uri: string }): Promise<{ contents: Content[] }> {
    const handler = this.resourceHandlers.get(params.uri);
    if (!handler) {
      throw {
        code: MCP_ERRORS.INVALID_REQUEST.code,
        message: `Resource not found: ${params.uri}`
      };
    }

    try {
      const result = await handler(params.uri);
      return result;
    } catch (error) {
      this.logger.error(`Resource ${params.uri} failed:`, error);
      throw {
        code: MCP_ERRORS.INTERNAL_ERROR.code,
        message: `Resource read failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async handleResourceTemplatesList(): Promise<{ resourceTemplates: ResourceTemplate[] }> {
    return { resourceTemplates: Array.from(this.resourceTemplates.values()) };
  }

  private async handleResourcesSubscribe(params: { uri: string }): Promise<void> {
    // Implementation for resource subscription
    this.emit('resource-subscribe', params.uri);
  }

  private async handleResourcesUnsubscribe(params: { uri: string }): Promise<void> {
    // Implementation for resource unsubscription
    this.emit('resource-unsubscribe', params.uri);
  }

  // Tool handlers
  private async handleToolsList(): Promise<{ tools: Tool[] }> {
    const tools: Tool[] = [];
    for (const [name, template] of this.toolTemplates) {
      tools.push({
        name,
        description: template.description,
        inputSchema: template.inputSchema,
      });
    }
    return { tools };
  }

  private async handleToolsCall(params: {
    name: string;
    arguments?: any;
    _meta?: { progressToken?: ProgressToken };
  }): Promise<{ content: Content[] }> {
    const handler = this.toolHandlers.get(params.name);
    if (!handler) {
      throw {
        code: MCP_ERRORS.INVALID_REQUEST.code,
        message: `Unknown tool: ${params.name}`,
      };
    }

    try {
      const result = await handler(params.arguments || {}, params._meta);
      return result;
    } catch (error) {
      this.logger.error(`Tool ${params.name} failed:`, error);
      throw {
        code: MCP_ERRORS.INTERNAL_ERROR.code,
        message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Prompt handlers
  private async handlePromptsList(): Promise<{ prompts: Prompt[] }> {
    const prompts: Prompt[] = [];
    for (const [name, template] of this.promptTemplates) {
      prompts.push({
        name,
        description: template.description,
        arguments: template.arguments,
      });
    }
    return { prompts };
  }

  private async handlePromptsGet(params: {
    name: string;
    arguments?: any;
  }): Promise<{ description?: string; messages: Content[] }> {
    const handler = this.promptHandlers.get(params.name);
    if (!handler) {
      throw {
        code: MCP_ERRORS.INVALID_REQUEST.code,
        message: `Unknown prompt: ${params.name}`,
      };
    }

    try {
      const result = await handler(params.arguments || {});
      return result;
    } catch (error) {
      this.logger.error(`Prompt ${params.name} failed:`, error);
      throw {
        code: MCP_ERRORS.INTERNAL_ERROR.code,
        message: `Prompt execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Logging handlers
  private async handleLoggingSetLevel(params: { level: LoggingLevel }): Promise<void> {
    this.logger.setLevel(params.level);
  }

  // Capability negotiation
  private negotiateCapabilities(clientCapabilities: Capabilities): Capabilities {
    const negotiated: Capabilities = {
      experimental: {},
      logging: {},
      resources: clientCapabilities.resources && this.serverCapabilities.resources ? {} : undefined,
      tools: clientCapabilities.tools && this.serverCapabilities.tools ? {} : undefined,
      prompts: clientCapabilities.prompts && this.serverCapabilities.prompts ? {} : undefined,
    };

    return negotiated;
  }

  // Public API methods
  public async start(): Promise<void> {
    await this.transport.connect();
  }

  public async stop(): Promise<void> {
    await this.transport.disconnect();
  }

  public addResource(uri: string, template: ResourceTemplate, handler: ResourceHandler): void {
    this.resourceTemplates.set(uri, template);
    this.resourceHandlers.set(uri, handler);
    
    if (this.initialized) {
      this.sendNotification('notifications/resources/list_changed');
    }
  }

  public addTool(name: string, template: ToolTemplate, handler: ToolHandler): void {
    this.toolTemplates.set(name, template);
    this.toolHandlers.set(name, handler);
    
    if (this.initialized) {
      this.sendNotification('notifications/tools/list_changed');
    }
  }

  public addPrompt(name: string, template: PromptTemplate, handler: PromptHandler): void {
    this.promptTemplates.set(name, template);
    this.promptHandlers.set(name, handler);
    
    if (this.initialized) {
      this.sendNotification('notifications/prompts/list_changed');
    }
  }

  public async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }

    const notification: Notification = {
      jsonrpc: '2.0',
      method,
      params: params ?? {},
    };

    await this.transport.send(notification);
  }

  public async sendProgress(token: ProgressToken, progress: number, total?: number): Promise<void> {
    await this.sendNotification('notifications/progress', {
      progressToken: token,
      progress,
      total,
    });
  }

  public async sendLog(level: LoggingLevel, message: string, data?: any): Promise<void> {
    if (this.shouldLog(level)) {
      await this.sendNotification('notifications/message', {
        level,
        logger: this.serverInfo.name,
        data: message,
        ...(data && { data }),
      });
    }
  }

  private shouldLog(level: LoggingLevel): boolean {
    const levels = [
      'debug',
      'info', 
      'notice',
      'warning',
      'error',
      'critical',
      'alert',
      'emergency',
    ];
    
    const currentLevelIndex = levels.indexOf(this.logger.getLevel());
    const requestedLevelIndex = levels.indexOf(level);
    
    return requestedLevelIndex >= currentLevelIndex;
  }

  // Getters
  public get isInitialized(): boolean {
    return this.initialized;
  }

  public get serverInformation(): ServerInfo {
    return { ...this.serverInfo };
  }

  public get clientInformation(): ClientInfo | null {
    return this.clientInfo ? { ...this.clientInfo } : null;
  }

  public get capabilities(): ServerCapabilities {
    return { ...this.serverCapabilities };
  }
} 