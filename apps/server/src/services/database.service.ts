import { Pool, PoolClient } from 'pg';
import { ServerConfig } from '../config.js';
import { AgentConfig } from '@mcp-log-server/types';

export interface LogSource {
  id: string;
  user_id?: string;
  name: string;
  type: string;
  config: any;
  is_active: boolean;
  auto_discovery: boolean;
  log_path?: string;
  format_type: string;
  filters: any;
  created_at: Date;
  updated_at: Date;
  last_sync_at?: Date;
}

export interface CustomAgentInput {
  name: string;
  type: string;
  logPaths: string[];
  logFormat?: string;
  enabled?: boolean;
  filters?: string[];
  metadata?: any;
}

export class DatabaseService {
  private pool: Pool;
  private logger: any;

  constructor(config: ServerConfig['database']['postgresql'], logger: any) {
    this.logger = logger;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', { error: err });
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.logger.info('✅ PostgreSQL database connected successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.logger.info('PostgreSQL pool closed');
  }

  // Custom Agent Management

  async createCustomAgent(agent: CustomAgentInput): Promise<LogSource> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO log_sources (name, type, config, is_active, auto_discovery, log_path, format_type, filters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          agent.name,
          agent.type,
          JSON.stringify({
            logPaths: agent.logPaths,
            metadata: agent.metadata || {},
            isCustom: true
          }),
          agent.enabled !== false,
          false, // Custom agents are not auto-discovered
          agent.logPaths[0] || '', // Primary log path
          agent.logFormat || 'structured',
          JSON.stringify(agent.filters || ['info', 'warn', 'error'])
        ]
      );

      this.logger.info('✅ Custom agent created:', { name: agent.name, id: result.rows[0].id });
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async updateCustomAgent(id: string, updates: Partial<CustomAgentInput>): Promise<LogSource | null> {
    const client = await this.pool.connect();
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setParts.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }

      if (updates.type !== undefined) {
        setParts.push(`type = $${paramIndex++}`);
        values.push(updates.type);
      }

      if (updates.logPaths !== undefined) {
        setParts.push(`config = $${paramIndex++}`);
        values.push(JSON.stringify({
          logPaths: updates.logPaths,
          metadata: updates.metadata || {},
          isCustom: true
        }));
        
        setParts.push(`log_path = $${paramIndex++}`);
        values.push(updates.logPaths[0] || '');
      }

      if (updates.enabled !== undefined) {
        setParts.push(`is_active = $${paramIndex++}`);
        values.push(updates.enabled);
      }

      if (updates.logFormat !== undefined) {
        setParts.push(`format_type = $${paramIndex++}`);
        values.push(updates.logFormat);
      }

      if (updates.filters !== undefined) {
        setParts.push(`filters = $${paramIndex++}`);
        values.push(JSON.stringify(updates.filters));
      }

      if (setParts.length === 0) {
        return null;
      }

      setParts.push(`updated_at = NOW()`);
      values.push(id);

      const result = await client.query(
        `UPDATE log_sources 
         SET ${setParts.join(', ')} 
         WHERE id = $${paramIndex} 
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return null;
      }

      this.logger.info('✅ Custom agent updated:', { id, name: result.rows[0].name });
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async deleteCustomAgent(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM log_sources WHERE id = $1 RETURNING name',
        [id]
      );

      if (result.rows.length > 0) {
        this.logger.info('✅ Custom agent deleted:', { id, name: result.rows[0].name });
        return true;
      }

      return false;
    } finally {
      client.release();
    }
  }

  async getCustomAgents(): Promise<LogSource[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM log_sources 
         WHERE auto_discovery = false
         ORDER BY created_at DESC`
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  async getCustomAgent(id: string): Promise<LogSource | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM log_sources WHERE id = $1',
        [id]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getAllLogSources(): Promise<LogSource[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM log_sources ORDER BY created_at DESC'
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  // Convert LogSource to AgentConfig
  logSourceToAgentConfig(logSource: LogSource): AgentConfig {
    const config = logSource.config || {};
    return {
      id: logSource.id,
      name: logSource.name,
      type: logSource.type,
      enabled: logSource.is_active,
      logPaths: config.logPaths || (logSource.log_path ? [logSource.log_path] : []),
      logFormat: logSource.format_type,
      filters: logSource.filters || ['info', 'warn', 'error'],
      metadata: {
        ...config.metadata,
        isCustom: !logSource.auto_discovery,
        lastSyncAt: logSource.last_sync_at?.toISOString(),
        createdAt: logSource.created_at.toISOString(),
        updatedAt: logSource.updated_at.toISOString()
      }
    };
  }

  // Convert AgentConfig to LogSource format
  agentConfigToLogSource(agent: AgentConfig): Omit<LogSource, 'id' | 'created_at' | 'updated_at'> {
    return {
      user_id: undefined,
      name: agent.name,
      type: agent.type,
      config: {
        logPaths: agent.logPaths || [],
        metadata: agent.metadata || {},
        isCustom: agent.metadata?.isCustom || false
      },
      is_active: agent.enabled !== false,
      auto_discovery: !agent.metadata?.isCustom,
      log_path: agent.logPaths?.[0] || '',
      format_type: agent.logFormat || 'structured',
      filters: agent.filters || ['info', 'warn', 'error'],
      last_sync_at: agent.metadata?.lastSyncAt ? new Date(agent.metadata.lastSyncAt) : undefined
    };
  }

  // Store discovered agents for reference
  async upsertDiscoveredAgent(agent: AgentConfig): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO log_sources (name, type, config, is_active, auto_discovery, log_path, format_type, filters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET
           config = EXCLUDED.config,
           is_active = EXCLUDED.is_active,
           log_path = EXCLUDED.log_path,
           format_type = EXCLUDED.format_type,
           filters = EXCLUDED.filters,
           updated_at = NOW()`,
        [
          agent.name,
          agent.type,
          {
            logPaths: agent.logPaths || [],
            metadata: agent.metadata || {},
            isCustom: false
          },
          agent.enabled !== false,
          true, // Auto-discovered
          agent.logPaths?.[0] || '',
          agent.logFormat || 'structured',
          agent.filters || ['info', 'warn', 'error']
        ]
      );
    } finally {
      client.release();
    }
  }
} 