// MCP Protocol Package - Main Exports
// Core MCP functionality for the MCP Log Server

// Core protocol components
export * from './jsonrpc';
export * from './server';
export * from './capabilities';
export * from './logging';

// Transport implementations
export * from './transport';

// Basic agent integration (simplified)
export { PlaceholderAgentAdapter, DefaultAgentAdapter, discoverAvailableAgents } from './agents';

// Type re-exports from @mcp-log-server/types
export type {
  // MCP Protocol types
  Request,
  Response,
  Notification,
  Content,
  Capabilities,
  ServerInfo,
  ClientInfo,
  InitializeRequest,
  InitializeResponse,
  Resource,
  Prompt,
  LoggingLevel,
  LoggingMessageNotification,
  Tool,
  ServerCapabilities,
  ClientCapabilities,
  ResourceTemplate,
  ToolTemplate,
  PromptTemplate,
  ProgressToken,

  // Agent types
  AgentConfig,
  AgentAdapter,
  LogEntry,
  LogLevel,
  AgentType,
  LogSource,
  LogParser
} from '@mcp-log-server/types';

// Export MCP constants
export { MCP_ERRORS } from '@mcp-log-server/types'; 