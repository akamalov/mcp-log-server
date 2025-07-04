/**
 * Configuration Management
 * 
 * Loads and validates configuration from environment variables
 * with sensible defaults for development.
 */

export interface ServerConfig {
  server: {
    port: number;
    host: string;
  };
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
  };
  rateLimit: {
    max: number;
    timeWindow: string;
  };
  mcp: {
    protocol: {
      version: string;
      name: string;
      description: string;
    };
    transports: {
      http: {
        enabled: boolean;
        path: string;
      };
      stdio: {
        enabled: boolean;
      };
    };
  };
  agents: {
    discovery: {
      enabled: boolean;
      interval: number; // milliseconds
    };
    logPaths: {
      claude: string[];
      cursor: string[];
      vscode: string[];
    };
  };
  database: {
    postgresql: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    };
    clickhouse: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    };
    redis: {
      host: string;
      port: number;
      password?: string;
      db: number;
    };
  };
  logging: {
    level: string;
  };
  environment: 'development' | 'production' | 'test';
}

/**
 * Load configuration from environment variables
 */
export async function loadConfig(): Promise<ServerConfig> {
  const config: ServerConfig = {
    server: {
      port: Number(process.env.PORT) || 3001,
      host: process.env.HOST || '0.0.0.0',
    },
    cors: {
      origin: process.env.CORS_ORIGIN ? 
        (process.env.CORS_ORIGIN.includes(',') ? 
          process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : 
          process.env.CORS_ORIGIN) : 
        true,
      credentials: process.env.CORS_CREDENTIALS === 'true',
    },
    rateLimit: {
      max: Number(process.env.RATE_LIMIT_MAX) || 100,
      timeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '1m',
    },
    mcp: {
      protocol: {
        version: process.env.MCP_VERSION || '0.1.0',
        name: process.env.MCP_SERVER_NAME || 'mcp-log-server',
        description: process.env.MCP_SERVER_DESCRIPTION || 'MCP Log Server - AI Agent Log Aggregation',
      },
      transports: {
        http: {
          enabled: process.env.MCP_HTTP_ENABLED !== 'false',
          path: process.env.MCP_HTTP_PATH || '/mcp',
        },
        stdio: {
          enabled: process.env.MCP_STDIO_ENABLED === 'true',
        },
      },
    },
    agents: {
      discovery: {
        enabled: process.env.AGENT_DISCOVERY_ENABLED !== 'false',
        interval: Number(process.env.AGENT_DISCOVERY_INTERVAL) || 30000,
      },
      logPaths: {
        claude: process.env.CLAUDE_LOG_PATHS?.split(',').map(s => s.trim()) || [],
        cursor: process.env.CURSOR_LOG_PATHS?.split(',').map(s => s.trim()) || [],
        vscode: process.env.VSCODE_LOG_PATHS?.split(',').map(s => s.trim()) || [],
      },
    },
    database: {
      postgresql: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB || 'mcp_logs',
        username: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
      },
      clickhouse: {
        host: process.env.CLICKHOUSE_HOST || 'localhost',
        port: Number(process.env.CLICKHOUSE_PORT) || 8123,
        database: process.env.CLICKHOUSE_DB || 'mcp_logs',
        username: process.env.CLICKHOUSE_USER || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB) || 0,
      },
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
    environment: (process.env.NODE_ENV as any) || 'development',
  };

  // Validate required configuration
  validateConfig(config);

  return config;
}

/**
 * Validate configuration values
 */
function validateConfig(config: ServerConfig): void {
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error(`Invalid port: ${config.server.port}. Must be between 1 and 65535.`);
  }

  if (!config.mcp.protocol.name || config.mcp.protocol.name.length === 0) {
    throw new Error('MCP server name cannot be empty');
  }

  // Add more validation as needed
} 