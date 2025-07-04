import { Kysely, PostgresDialect, sql, type Insertable, type Updateable, type Selectable } from 'kysely';
import { Pool, type PoolConfig } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  Database,
  User,
  LogSource,
  UserPreferences,
  ApiToken,
  SystemConfig,
  SavedQuery,
  InsertUser,
  InsertLogSource,
  InsertApiToken,
  InsertSavedQuery,
  InsertSystemConfig,
  AuditLogTable,
  UsersTable,
  LogSourcesTable,
  SourceHealthTable,
  UserPreferencesTable,
  ApiTokensTable,
  SavedQueriesTable,
  SystemConfigTable,
  UserUpdate,
  LogSourceUpdate,
  UserPreferencesUpdate,
  SavedQueryUpdate,
  UserFilters,
  LogSourceFilters,
  SourceHealthFilters,
  AuditLogFilters,
  PaginationParams,
  UserWithPreferences,
  LogSourceWithHealth,
  LogSourceWithUser,
  ApiTokenWithUser,
} from './types.js';

export interface PostgresClientConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export class PostgresClient {
  private db: Kysely<Database>;
  private pool: Pool;
  private isConnected: boolean = false;

  constructor(config: PostgresClientConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      connectionTimeoutMillis: config.connectionTimeoutMs || 30000,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
    };

    this.pool = new Pool(poolConfig);
    
    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: this.pool,
      }),
    });
  }

  async connect(): Promise<void> {
    try {
      // Test the connection
      await this.db.selectFrom('system_config').select('key').limit(1).execute();
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to PostgreSQL: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.db.destroy();
    await this.pool.end();
    this.isConnected = false;
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.selectFrom('system_config').select('key').limit(1).execute();
      return true;
    } catch {
      return false;
    }
  }

  getDb(): Kysely<Database> {
    return this.db;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  // Schema Management
  async runMigrations(): Promise<void> {
    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // Split SQL commands and execute them
      const commands = schema
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);

      for (const command of commands) {
        await sql`${sql.raw(command)}`.execute(this.db);
      }

      // Record this migration
      await this.db
        .insertInto('schema_migrations')
        .values({
          version: '001_initial_schema',
          description: 'Initial database schema',
          applied_at: new Date()
        })
        .onConflict(oc => oc.column('version').doNothing())
        .execute();

    } catch (error) {
      throw new Error(`Failed to run migrations: ${error}`);
    }
  }

  // Users
  async createUser(userData: InsertUser): Promise<User> {
    const [newUser] = await this.db
      .insertInto('users')
      .values({
        email: userData.email,
        username: userData.username,
        password_hash: userData.password_hash,
        is_active: userData.is_active ?? true,
        is_admin: userData.is_admin ?? false,
      })
      .returningAll()
      .execute();

    return newUser;
  }

  async getUserById(id: string): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst();
  }

  async updateUser(id: string, updates: UserUpdate): Promise<User | undefined> {
    return await this.db
      .updateTable('users')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ last_login_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async getUsers(filters: UserFilters = {}, pagination: PaginationParams = {}): Promise<User[]> {
    let query = this.db.selectFrom('users').selectAll();

    if (filters.is_active !== undefined) {
      query = query.where('is_active', '=', filters.is_active);
    }

    if (filters.is_admin !== undefined) {
      query = query.where('is_admin', '=', filters.is_admin);
    }

    if (filters.email) {
      query = query.where('email', 'ilike', `%${filters.email}%`);
    }

    if (filters.username) {
      query = query.where('username', 'ilike', `%${filters.username}%`);
    }

    if (filters.created_after) {
      query = query.where('created_at', '>=', filters.created_after);
    }

    if (filters.created_before) {
      query = query.where('created_at', '<=', filters.created_before);
    }

    if (pagination.limit) {
      query = query.limit(pagination.limit);
    }

    if (pagination.offset) {
      query = query.offset(pagination.offset);
    }

    return await query.execute();
  }

  async getUserWithPreferences(id: string): Promise<UserWithPreferences | undefined> {
    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!user) {
      return undefined;
    }

    const preferences = await this.db
      .selectFrom('user_preferences')
      .selectAll()
      .where('user_id', '=', id)
      .executeTakeFirst();

    return {
      ...user,
      preferences: preferences || null,
    };
  }

  // Log Sources
  async createLogSource(sourceData: InsertLogSource): Promise<LogSource> {
    const [newSource] = await this.db
      .insertInto('log_sources')
      .values({
        user_id: sourceData.user_id,
        name: sourceData.name,
        type: sourceData.type,
        config: sourceData.config,
        is_active: sourceData.is_active ?? true,
        auto_discovery: sourceData.auto_discovery ?? false,
        log_path: sourceData.log_path ?? null,
        format_type: sourceData.format_type,
        filters: sourceData.filters ?? [],
      })
      .returningAll()
      .execute();

    return newSource;
  }

  async getLogSourceById(id: string): Promise<LogSource | undefined> {
    return await this.db
      .selectFrom('log_sources')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async updateLogSource(id: string, updates: LogSourceUpdate): Promise<LogSource | undefined> {
    return await this.db
      .updateTable('log_sources')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteLogSource(id: string): Promise<void> {
    await this.db
      .deleteFrom('log_sources')
      .where('id', '=', id)
      .execute();
  }

  async getLogSources(filters: LogSourceFilters = {}, pagination: PaginationParams = {}): Promise<LogSource[]> {
    let query = this.db.selectFrom('log_sources').selectAll();

    if (filters.user_id) {
      query = query.where('user_id', '=', filters.user_id);
    }

    if (filters.is_active !== undefined) {
      query = query.where('is_active', '=', filters.is_active);
    }

    if (filters.type) {
      query = query.where('type', '=', filters.type);
    }

    if (filters.name) {
      query = query.where('name', 'ilike', `%${filters.name}%`);
    }

    if (pagination.limit) {
      query = query.limit(pagination.limit);
    }

    if (pagination.offset) {
      query = query.offset(pagination.offset);
    }

    return await query.orderBy('created_at', 'desc').execute();
  }

  async getLogSourcesWithHealth(filters: LogSourceFilters = {}): Promise<LogSourceWithHealth[]> {
    // Simplified query to avoid type issues
    const sources = await this.getLogSources(filters);
    
    const results: LogSourceWithHealth[] = [];
    for (const source of sources) {
      const health = await this.db
        .selectFrom('source_health')
        .selectAll()
        .where('source_id', '=', source.id)
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      results.push({
        ...source,
        health: (health as any) || null,
      });
    }

    return results;
  }

  // Source Health
  async createSourceHealth(sourceId: string, status: 'healthy' | 'warning' | 'error' | 'disconnected', errorMessage?: string, metrics?: Record<string, any>): Promise<void> {
    await this.db
      .insertInto('source_health')
      .values({
        source_id: sourceId,
        status,
        last_check_at: new Date(),
        error_message: errorMessage || null,
        metrics: metrics || null,
      })
      .execute();
  }

  async getSourceHealth(filters: SourceHealthFilters = {}): Promise<Selectable<SourceHealthTable>[]> {
    let query = this.db.selectFrom('source_health').selectAll();

    if (filters.source_id) {
      query = query.where('source_id', '=', filters.source_id);
    }

    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }

    if (filters.since) {
      query = query.where('last_check_at', '>=', filters.since);
    }

    return await query.orderBy('last_check_at', 'desc').execute();
  }

  // User Preferences
  async createUserPreferences(userId: string, preferences: Record<string, any>): Promise<UserPreferences> {
    const [newPreferences] = await this.db
      .insertInto('user_preferences')
      .values({
        user_id: userId,
        preferences: preferences,
      })
      .returningAll()
      .execute();

    return newPreferences;
  }

  async updateUserPreferences(userId: string, preferences: Record<string, any>): Promise<UserPreferences> {
    const [updatedPreferences] = await this.db
      .insertInto('user_preferences')
      .values({
        user_id: userId,
        preferences: preferences,
      })
      .onConflict((oc) => 
        oc.column('user_id').doUpdateSet({
          preferences: (eb) => eb.ref('excluded.preferences'),
        })
      )
      .returningAll()
      .execute();

    return updatedPreferences;
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    return await this.db
      .selectFrom('user_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
  }

  // API Tokens
  async createApiToken(tokenData: InsertApiToken): Promise<ApiToken> {
    const [newToken] = await this.db
      .insertInto('api_tokens')
      .values({
        user_id: tokenData.user_id,
        name: tokenData.name,
        token_hash: tokenData.token_hash,
        permissions: tokenData.permissions,
        expires_at: tokenData.expires_at || null,
        last_used_at: tokenData.last_used_at || null,
        is_active: tokenData.is_active ?? true,
      })
      .returningAll()
      .execute();

    return newToken;
  }

  async getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined> {
    return await this.db
      .selectFrom('api_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('is_active', '=', true)
      .executeTakeFirst();
  }

  async updateApiTokenUsage(id: string): Promise<void> {
    await this.db
      .updateTable('api_tokens')
      .set({ last_used_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async getUserApiTokens(userId: string): Promise<ApiToken[]> {
    return await this.db
      .selectFrom('api_tokens')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async revokeApiToken(id: string): Promise<void> {
    await this.db
      .updateTable('api_tokens')
      .set({ is_active: false })
      .where('id', '=', id)
      .execute();
  }

  // System Configuration
  async createSystemConfig(configData: InsertSystemConfig): Promise<SystemConfig> {
    const [newConfig] = await this.db
      .insertInto('system_config')
      .values({
        key: configData.key,
        value: configData.value,
        description: configData.description || null,
        is_public: configData.is_public ?? false,
      })
      .returningAll()
      .execute();

    return newConfig;
  }

  async getSystemConfig(key: string): Promise<any> {
    const result = await this.db
      .selectFrom('system_config')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();
    return result?.value;
  }

  async getAllSystemConfig(includePrivate: boolean = false): Promise<SystemConfig[]> {
    let query = this.db.selectFrom('system_config').selectAll();
    
    if (!includePrivate) {
      query = query.where('is_public', '=', true);
    }

    return await query.execute();
  }

  // Audit Logging
  async createAuditLog(log: Insertable<AuditLogTable>): Promise<Selectable<AuditLogTable>> {
    const [result] = await this.db
      .insertInto('audit_log')
      .values({
        user_id: log.user_id ?? null,
        action: log.action,
        resource_type: log.resource_type,
        resource_id: log.resource_id ?? null,
        old_values: log.old_values ?? null,
        new_values: log.new_values ?? null,
        ip_address: log.ip_address ?? null,
        user_agent: log.user_agent ?? null,
      })
      .returningAll()
      .execute();

    return result;
  }

  async getAuditLogs(filters: AuditLogFilters = {}, pagination: PaginationParams = {}): Promise<Selectable<AuditLogTable>[]> {
    let query = this.db.selectFrom('audit_log').selectAll();

    if (filters.user_id) {
      query = query.where('user_id', '=', filters.user_id);
    }

    if (filters.action) {
      query = query.where('action', '=', filters.action);
    }

    if (filters.resource_type) {
      query = query.where('resource_type', '=', filters.resource_type);
    }

    if (filters.resource_id) {
      query = query.where('resource_id', '=', filters.resource_id);
    }

    if (filters.since) {
      query = query.where('created_at', '>=', filters.since);
    }

    if (filters.until) {
      query = query.where('created_at', '<=', filters.until);
    }

    if (pagination.limit) {
      query = query.limit(pagination.limit);
    }

    if (pagination.offset) {
      query = query.offset(pagination.offset);
    }

    return await query.orderBy('created_at', 'desc').execute();
  }

  // Saved Queries
  async createSavedQuery(queryData: Insertable<SavedQueriesTable>): Promise<SavedQuery> {
    const [result] = await this.db
      .insertInto('saved_queries')
      .values({
        user_id: queryData.user_id,
        name: queryData.name,
        description: queryData.description ?? null,
        query_config: queryData.query_config,
        is_public: queryData.is_public ?? false,
        tags: queryData.tags ?? [],
      })
      .returningAll()
      .execute();

    return result;
  }

  async getSavedQuery(id: string): Promise<SavedQuery | undefined> {
    return await this.db
      .selectFrom('saved_queries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async updateSavedQuery(id: string, updates: SavedQueryUpdate): Promise<SavedQuery | undefined> {
    return await this.db
      .updateTable('saved_queries')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async getUserSavedQueries(userId: string): Promise<SavedQuery[]> {
    return await this.db
      .selectFrom('saved_queries')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async deleteSavedQuery(id: string): Promise<void> {
    await this.db
      .deleteFrom('saved_queries')
      .where('id', '=', id)
      .execute();
  }

  // Health checks and stats
  async getHealthStats(): Promise<{
    total_users: number;
    active_users: number;
    total_log_sources: number;
    active_log_sources: number;
    healthy_sources: number;
  }> {
    const [stats] = await this.db
      .selectFrom('users')
      .leftJoin('log_sources', 'users.id', 'log_sources.user_id')
      .leftJoin('source_health', 'log_sources.id', 'source_health.source_id')
      .select([
        eb => eb.fn.count('users.id').distinct().as('total_users'),
        eb => eb.fn.count('users.id').filterWhere('users.is_active', '=', true).distinct().as('active_users'),
        eb => eb.fn.count('log_sources.id').distinct().as('total_log_sources'),
        eb => eb.fn.count('log_sources.id').filterWhere('log_sources.is_active', '=', true).distinct().as('active_log_sources'),
        eb => eb.fn.count('source_health.id').filterWhere('source_health.status', '=', 'healthy').distinct().as('healthy_sources'),
      ])
      .execute();

    return {
      total_users: Number(stats.total_users) || 0,
      active_users: Number(stats.active_users) || 0,
      total_log_sources: Number(stats.total_log_sources) || 0,
      active_log_sources: Number(stats.active_log_sources) || 0,
      healthy_sources: Number(stats.healthy_sources) || 0,
    };
  }
} 