import { z } from "zod";

// JSON-RPC 2.0 Base Types
export const JSONRPCVersionSchema = z.literal("2.0");

export const JSONRPCIdSchema = z.union([z.string(), z.number()]);

export const JSONRPCErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

// JSON-RPC 2.0 Request
export const JSONRPCRequestSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

// JSON-RPC 2.0 Response
export const JSONRPCResponseSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  result: z.unknown().optional(),
  error: JSONRPCErrorSchema.optional(),
});

// JSON-RPC 2.0 Notification
export const JSONRPCNotificationSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

// Union of all JSON-RPC message types
export const JSONRPCMessageSchema = z.union([
  JSONRPCRequestSchema,
  JSONRPCResponseSchema,
  JSONRPCNotificationSchema,
]);

// Type exports
export type JSONRPCId = z.infer<typeof JSONRPCIdSchema>;
export type JSONRPCError = z.infer<typeof JSONRPCErrorSchema>;
export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;
export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;
export type JSONRPCNotification = z.infer<typeof JSONRPCNotificationSchema>;
export type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

// MCP Content Types
export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(), // base64-encoded
  mimeType: z.string(),
});

export const AudioContentSchema = z.object({
  type: z.literal("audio"),
  data: z.string(), // base64-encoded
  mimeType: z.string(),
});

export const ContentSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
]);

export type TextContent = z.infer<typeof TextContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type AudioContent = z.infer<typeof AudioContentSchema>;
export type Content = z.infer<typeof ContentSchema>;

// MCP Message Types
export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: ContentSchema,
});

export type Message = z.infer<typeof MessageSchema>;

// MCP Capabilities
export const ServerCapabilitiesSchema = z.object({
  resources: z.object({
    subscribe: z.boolean().optional(),
    listChanged: z.boolean().optional(),
  }).optional(),
  tools: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  prompts: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  logging: z.object({}).optional(),
  completion: z.object({
    argument: z.boolean().optional(),
  }).optional(),
  experimental: z.record(z.unknown()).optional(),
});

export const ClientCapabilitiesSchema = z.object({
  sampling: z.object({}).optional(),
  roots: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  elicitation: z.object({}).optional(),
  logging: z.object({}).optional(),
  resources: z.object({
    subscribe: z.boolean().optional(),
    listChanged: z.boolean().optional(),
  }).optional(),
  tools: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  prompts: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  experimental: z.record(z.unknown()).optional(),
});

export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;

// MCP Server/Client Info
export const ServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export const ClientInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export type ServerInfo = z.infer<typeof ServerInfoSchema>;
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

// MCP Initialize Request/Response
export const InitializeRequestSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  method: z.literal("initialize"),
  params: z.object({
    protocolVersion: z.string(),
    capabilities: ClientCapabilitiesSchema,
    clientInfo: ClientInfoSchema,
  }),
});

export const InitializeResponseSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  result: z.object({
    protocolVersion: z.string(),
    capabilities: ServerCapabilitiesSchema,
    serverInfo: ServerInfoSchema,
  }),
});

export type InitializeRequest = z.infer<typeof InitializeRequestSchema>;
export type InitializeResponse = z.infer<typeof InitializeResponseSchema>;

// MCP Resource Types
export const ResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

export const ResourceContentsSchema = z.object({
  uri: z.string(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  blob: z.string().optional(), // base64-encoded
});

export type Resource = z.infer<typeof ResourceSchema>;
export type ResourceContents = z.infer<typeof ResourceContentsSchema>;

// MCP Tool Types
export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});

export const CallToolRequestSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

export const CallToolResponseSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  result: z.object({
    content: z.array(ContentSchema),
    isError: z.boolean().optional(),
  }),
});

export type Tool = z.infer<typeof ToolSchema>;
export type CallToolRequest = z.infer<typeof CallToolRequestSchema>;
export type CallToolResponse = z.infer<typeof CallToolResponseSchema>;

// MCP Prompt Types
export const PromptSchema = z.object({
  name: z.string(),
  description: z.string(),
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean().optional(),
  })).optional(),
});

export const GetPromptRequestSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  method: z.literal("prompts/get"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

export const GetPromptResponseSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  id: JSONRPCIdSchema,
  result: z.object({
    description: z.string().optional(),
    messages: z.array(MessageSchema),
  }),
});

export type Prompt = z.infer<typeof PromptSchema>;
export type GetPromptRequest = z.infer<typeof GetPromptRequestSchema>;
export type GetPromptResponse = z.infer<typeof GetPromptResponseSchema>;

// MCP Logging Types
export const LoggingLevelSchema = z.enum(["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]);

export const LoggingMessageNotificationSchema = z.object({
  jsonrpc: JSONRPCVersionSchema,
  method: z.literal("notifications/message"),
  params: z.object({
    level: LoggingLevelSchema,
    logger: z.string().optional(),
    data: z.unknown(),
  }),
});

export type LoggingLevel = z.infer<typeof LoggingLevelSchema>;
export type LoggingMessageNotification = z.infer<typeof LoggingMessageNotificationSchema>;

// MCP Template Types (for server-side resource/tool/prompt definitions)
export interface ResourceTemplate {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

export interface ToolTemplate {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface PromptTemplate {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

// Progress token type for tracking operations
export type ProgressToken = string | number;

// Combined capabilities type for negotiation
export type Capabilities = {
  resources?: ServerCapabilities['resources'];
  tools?: ServerCapabilities['tools'];
  prompts?: ServerCapabilities['prompts'];
  logging?: ServerCapabilities['logging'];
  completion?: ServerCapabilities['completion'];
  experimental?: Record<string, unknown>;
};

// Notification types
export interface Notification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// Request/Response union types
export type Request = JSONRPCRequest;
export type Response = JSONRPCResponse;

// MCP Transport Types
export type TransportType = "stdio" | "http" | "sse" | "streamable-http";

export interface Transport {
  readonly type: TransportType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  onMessage(handler: (message: JSONRPCMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}

// MCP Session State
export type SessionState = "disconnected" | "connecting" | "initializing" | "initialized" | "error";

export interface MCPSession {
  readonly state: SessionState;
  readonly clientInfo: ClientInfo | null;
  readonly serverInfo: ServerInfo | null;
  readonly clientCapabilities: ClientCapabilities | null;
  readonly serverCapabilities: ServerCapabilities | null;
  readonly transport: Transport | null;
}

// Utility type predicates
export const isInitializeRequest = (obj: unknown): obj is InitializeRequest => {
  return InitializeRequestSchema.safeParse(obj).success;
};

export const isJSONRPCRequest = (obj: unknown): obj is JSONRPCRequest => {
  return JSONRPCRequestSchema.safeParse(obj).success;
};

export const isJSONRPCResponse = (obj: unknown): obj is JSONRPCResponse => {
  return JSONRPCResponseSchema.safeParse(obj).success;
};

export const isJSONRPCNotification = (obj: unknown): obj is JSONRPCNotification => {
  return JSONRPCNotificationSchema.safeParse(obj).success;
};

// Standard MCP errors
export const MCP_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
  // MCP-specific errors
  INITIALIZATION_FAILED: { code: -32000, message: "Initialization failed" },
  UNSUPPORTED_PROTOCOL: { code: -32001, message: "Unsupported protocol version" },
  RESOURCE_NOT_FOUND: { code: -32002, message: "Resource not found" },
  TOOL_NOT_FOUND: { code: -32003, message: "Tool not found" },
  PROMPT_NOT_FOUND: { code: -32004, message: "Prompt not found" },
} as const; 