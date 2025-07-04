import type { Selectable, Generated, Insertable, Updateable } from 'kysely';

// PostgreSQL Database Types
// Generated from schema.sql for type-safe database operations

export interface Database {
  users: UsersTable;
  log_sources: LogSourcesTable;
  source_health: SourceHealthTable;
  user_preferences: UserPreferencesTable;
  api_tokens: ApiTokensTable;
  saved_queries: SavedQueriesTable;
  system_config: SystemConfigTable;
  schema_migrations: SchemaMigrationsTable;
  audit_log: AuditLogTable;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  username: string;
  password_hash: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_login_at: Date | null;
}

export interface LogSourcesTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  type: string; // 'claude' | 'cursor' | 'vscode' | 'custom'
  config: Record<string, any>; // JSONB
  is_active: boolean;
  auto_discovery: boolean;
  log_path: string | null;
  format_type: string; // 'native-mcp' | 'mixed' | 'structured'
  filters: Array<any>; // JSONB array
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_sync_at: Date | null;
}

export interface SourceHealthTable {
  id: Generated<string>;
  source_id: string;
  status: 'healthy' | 'warning' | 'error' | 'disconnected';
  last_check_at: Date;
  error_message: string | null;
  metrics: Record<string, any> | null; // JSONB
  created_at: Generated<Date>;
}

export interface UserPreferencesTable {
  id: Generated<string>;
  user_id: string;
  preferences: Record<string, any>; // JSONB
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ApiTokensTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  token_hash: string;
  permissions: string[]; // JSONB array
  expires_at: Date | null;
  last_used_at: Date | null;
  is_active: boolean;
  created_at: Generated<Date>;
}

export interface SavedQueriesTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  description: string | null;
  query_config: Record<string, any>; // JSONB
  is_public: boolean;
  tags: string[]; // TEXT array
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SystemConfigTable {
  key: string;
  value: any; // JSONB
  description: string | null;
  is_public: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SchemaMigrationsTable {
  version: string;
  description: string | null;
  applied_at: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<string>;
  user_id: string | null;
  action: 'create' | 'update' | 'delete';
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, any> | null; // JSONB
  new_values: Record<string, any> | null; // JSONB
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}

// Insert/Update types (without auto-generated fields)
export interface NewUser {
  id?: string;
  email: string;
  username: string;
  password_hash: string;
  is_active?: boolean;
  is_admin?: boolean;
  created_at?: Date;
  updated_at?: Date;
  last_login_at?: Date | null;
}

export interface UserUpdate {
  email?: string;
  username?: string;
  password_hash?: string;
  is_active?: boolean;
  is_admin?: boolean;
  last_login_at?: Date | null;
}

export interface NewLogSource {
  id?: string;
  user_id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  is_active?: boolean;
  auto_discovery?: boolean;
  log_path?: string | null;
  format_type?: string;
  filters?: Array<any>;
  created_at?: Date;
  updated_at?: Date;
  last_sync_at?: Date | null;
}

export interface LogSourceUpdate {
  name?: string;
  config?: Record<string, any>;
  is_active?: boolean;
  auto_discovery?: boolean;
  log_path?: string | null;
  format_type?: string;
  filters?: Array<any>;
  last_sync_at?: Date | null;
}

export interface NewSourceHealth {
  id?: string;
  source_id: string;
  status: 'healthy' | 'warning' | 'error' | 'disconnected';
  last_check_at?: Date;
  error_message?: string | null;
  metrics?: Record<string, any> | null;
}

export interface SourceHealthUpdate {
  status?: 'healthy' | 'warning' | 'error' | 'disconnected';
  error_message?: string | null;
  metrics?: Record<string, any> | null;
}

export interface NewUserPreferences {
  id?: string;
  user_id: string;
  preferences: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserPreferencesUpdate {
  preferences: Record<string, any>;
}

export interface NewApiToken {
  id?: string;
  user_id: string;
  name: string;
  token_hash: string;
  permissions?: string[];
  expires_at?: Date | null;
  last_used_at?: Date | null;
  is_active?: boolean;
  created_at?: Date;
}

export interface ApiTokenUpdate {
  name?: string;
  permissions?: string[];
  expires_at?: Date | null;
  last_used_at?: Date | null;
  is_active?: boolean;
}

export interface NewSavedQuery {
  id?: string;
  user_id: string;
  name: string;
  description?: string | null;
  query_config: Record<string, any>;
  is_public?: boolean;
  tags?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export interface SavedQueryUpdate {
  name?: string;
  description?: string | null;
  query_config?: Record<string, any>;
  is_public?: boolean;
  tags?: string[];
}

export interface NewSystemConfig {
  key: string;
  value: any;
  description?: string | null;
  is_public?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface SystemConfigUpdate {
  value?: any;
  description?: string | null;
  is_public?: boolean;
}

export interface NewAuditLog {
  id?: string;
  user_id?: string | null;
  action: 'create' | 'update' | 'delete';
  resource_type: string;
  resource_id?: string | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: Date;
}

// Query helper types
export interface UserWithPreferences extends User {
  preferences: UserPreferences | null;
}

export interface LogSourceWithHealth extends LogSource {
  health: SourceHealthTable | null;
}

export interface LogSourceWithUser extends LogSourcesTable {
  user: Pick<UsersTable, 'id' | 'username' | 'email'>;
}

export interface ApiTokenWithUser extends ApiTokensTable {
  user: Pick<UsersTable, 'id' | 'username' | 'email'>;
}

// Pagination and filtering types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface LogSourceFilters {
  user_id?: string;
  is_active?: boolean;
  type?: 'file' | 'api' | 'agent_claude' | 'agent_cursor' | 'agent_vscode' | 'agent_gemini' | 'database' | 'system' | 'custom';
  name?: string;
}

export interface UserFilters {
  is_active?: boolean;
  is_admin?: boolean;
  email?: string;
  username?: string;
  created_after?: Date;
  created_before?: Date;
}

export interface SourceHealthFilters {
  source_id?: string;
  status?: 'healthy' | 'warning' | 'error' | 'disconnected';
  since?: Date;
}

export interface AuditLogFilters {
  user_id?: string;
  action?: 'create' | 'update' | 'delete';
  resource_type?: string;
  resource_id?: string;
  since?: Date;
  until?: Date;
}

// Create data interfaces for API operations
export interface CreateUserData {
  email: string;
  username: string;
  password_hash: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export interface CreateLogSourceData {
  user_id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  is_active?: boolean;
  auto_discovery?: boolean;
  log_path?: string | null;
  format_type: string;
  filters?: any[];
}

export interface UpdateSourceHealthData {
  status: 'healthy' | 'warning' | 'error' | 'disconnected';
  last_check_at: Date;
  error_message?: string | null;
  metrics?: Record<string, any> | null;
}

export interface CreateApiTokenData {
  user_id: string;
  name: string;
  token_hash: string;
  permissions: string[];
  expires_at?: Date | null;
  last_used_at?: Date | null;
  is_active?: boolean;
}

export interface CreateSystemConfigData {
  key: string;
  value: any;
  description?: string | null;
  is_public?: boolean;
}

export interface CreateAuditLogData {
  user_id?: string | null;
  action: 'create' | 'update' | 'delete';
  resource_type: string;
  resource_id?: string | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface CreateSavedQueryData {
  user_id: string;
  name: string;
  description?: string | null;
  query_config: Record<string, any>;
  is_public?: boolean;
  tags?: string[];
}

// Type aliases to match expectations
export type User = Selectable<UsersTable>;
export type LogSource = Selectable<LogSourcesTable>;
export type UserPreferences = Selectable<UserPreferencesTable>;
export type ApiToken = Selectable<ApiTokensTable>;
export type SystemConfig = Selectable<SystemConfigTable>;
export type SavedQuery = Selectable<SavedQueriesTable>;

// Insert types (for creating new records)
export type InsertUser = Insertable<UsersTable>;
export type InsertLogSource = Insertable<LogSourcesTable>;
export type InsertUserPreferences = Insertable<UserPreferencesTable>;
export type InsertApiToken = Insertable<ApiTokensTable>;
export type InsertSystemConfig = Insertable<SystemConfigTable>;
export type InsertSavedQuery = Insertable<SavedQueriesTable>;

// Update types (for updating existing records)
export type UpdateUser = Updateable<UsersTable>;
export type UpdateLogSource = Updateable<LogSourcesTable>;
export type UpdateUserPreferences = Updateable<UserPreferencesTable>;
export type UpdateApiToken = Updateable<ApiTokensTable>;
export type UpdateSystemConfig = Updateable<SystemConfigTable>;
export type UpdateSavedQuery = Updateable<SavedQueriesTable>; 