// Elasticsearch Types for Search and Analytics
import type { LogLevel, LogEntry, LogMetadata } from '@mcp-log-server/types';

export interface ElasticsearchConfig {
  node: string;
  indexName?: string;
  auth?: {
    username: string;
    password: string;
  };
  ssl?: {
    rejectUnauthorized: boolean;
  };
  maxRetries?: number;
  requestTimeout?: number;
  pingTimeout?: number;
  sniffOnStart?: boolean;
  sniffInterval?: number;
}

// Index Configuration
export interface IndexConfig {
  name: string;
  mappings: any;
  settings: any;
  aliases?: Record<string, any>;
}

// Document Types
export interface LogDocument {
  '@timestamp': string;
  log_id: string;
  source_id: string;
  level: LogLevel;
  message: string;
  agent_type: string;
  agent_version: string;
  session_id: string;
  file_path: string;
  line_number?: number;
  function_name?: string;
  metadata?: LogMetadata;
  tags?: string[];
  duration_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  error_code?: string;
  error_type?: string;
  stack_trace?: string;
  user_id?: string;
  request_id?: string;
  correlation_id?: string;
  raw_log: string;
  ingested_at: string;
  processed_at?: string;
  
  // Derived fields for search
  message_tokens?: string[];
  error_fingerprint?: string;
  log_signature?: string;
  path_hierarchy?: string[];
}

export interface LogSourceDocument {
  source_id: string;
  user_id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_seen?: string;
  health_status: 'healthy' | 'warning' | 'error' | 'unknown';
  tags?: string[];
  description?: string;
}

export interface ErrorPatternDocument {
  error_hash: string;
  error_type: string;
  normalized_message: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  source_ids: string[];
  agent_types: string[];
  affected_functions?: string[];
  sample_stack_trace?: string;
  sample_metadata: Record<string, any>;
  is_resolved: boolean;
  resolved_at?: string;
  resolution_notes?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
}

// Search Query Types
export interface SearchQuery {
  query?: QueryClause;
  size?: number;
  from?: number;
  sort?: SortClause[];
  _source?: boolean | string | string[];
  highlight?: HighlightConfig;
  aggs?: Record<string, AggregationClause>;
  post_filter?: QueryClause;
  track_total_hits?: boolean | number;
  timeout?: string;
}

export interface QueryClause {
  bool?: BoolQuery;
  match?: Record<string, MatchQuery>;
  match_all?: Record<string, any>;
  match_none?: Record<string, any>;
  multi_match?: MultiMatchQuery;
  query_string?: QueryStringQuery;
  simple_query_string?: SimpleQueryStringQuery;
  term?: Record<string, TermQuery>;
  terms?: Record<string, TermsQuery>;
  range?: Record<string, RangeQuery>;
  exists?: ExistsQuery;
  prefix?: Record<string, PrefixQuery>;
  wildcard?: Record<string, WildcardQuery>;
  regexp?: Record<string, RegexpQuery>;
  fuzzy?: Record<string, FuzzyQuery>;
  ids?: IdsQuery;
  nested?: NestedQuery;
}

export interface BoolQuery {
  must?: QueryClause[];
  should?: QueryClause[];
  must_not?: QueryClause[];
  filter?: QueryClause[];
  minimum_should_match?: number | string;
  boost?: number;
}

export interface MatchQuery {
  query: string;
  operator?: 'and' | 'or';
  minimum_should_match?: number | string;
  fuzziness?: string | number;
  analyzer?: string;
  boost?: number;
}

export interface MultiMatchQuery {
  query: string;
  fields: string[];
  type?: 'best_fields' | 'most_fields' | 'cross_fields' | 'phrase' | 'phrase_prefix' | 'bool_prefix';
  operator?: 'and' | 'or';
  minimum_should_match?: number | string;
  fuzziness?: string | number;
  analyzer?: string;
  boost?: number;
}

export interface QueryStringQuery {
  query: string;
  default_field?: string;
  fields?: string[];
  default_operator?: 'and' | 'or';
  analyzer?: string;
  allow_leading_wildcard?: boolean;
  analyze_wildcard?: boolean;
  boost?: number;
}

export interface SimpleQueryStringQuery {
  query: string;
  fields?: string[];
  default_operator?: 'and' | 'or';
  analyzer?: string;
  flags?: string;
  fuzzy_max_expansions?: number;
  fuzzy_prefix_length?: number;
  fuzzy_transpositions?: boolean;
  boost?: number;
}

export interface TermQuery {
  value: string | number | boolean;
  boost?: number;
  case_insensitive?: boolean;
}

export interface TermsQuery {
  value: (string | number | boolean)[];
  boost?: number;
}

export interface RangeQuery {
  gte?: string | number;
  gt?: string | number;
  lte?: string | number;
  lt?: string | number;
  format?: string;
  time_zone?: string;
  boost?: number;
}

export interface ExistsQuery {
  field: string;
}

export interface PrefixQuery {
  value: string;
  boost?: number;
  case_insensitive?: boolean;
}

export interface WildcardQuery {
  value: string;
  boost?: number;
  case_insensitive?: boolean;
}

export interface RegexpQuery {
  value: string;
  flags?: string;
  case_insensitive?: boolean;
  max_determinized_states?: number;
  boost?: number;
}

export interface FuzzyQuery {
  value: string;
  fuzziness?: string | number;
  max_expansions?: number;
  prefix_length?: number;
  transpositions?: boolean;
  boost?: number;
}

export interface IdsQuery {
  values: string[];
}

export interface NestedQuery {
  path: string;
  query: QueryClause;
  score_mode?: 'avg' | 'max' | 'min' | 'none' | 'sum';
  ignore_unmapped?: boolean;
  boost?: number;
}

// Sort and Highlight
export interface SortClause {
  [field: string]: SortOrder | SortConfig;
}

export interface SortConfig {
  order?: SortOrder;
  missing?: '_first' | '_last' | string | number;
  mode?: 'min' | 'max' | 'sum' | 'avg' | 'median';
  nested?: NestedSortConfig;
  format?: string;
  numeric_type?: 'long' | 'double' | 'date' | 'date_nanos';
}

export interface NestedSortConfig {
  path: string;
  filter?: QueryClause;
  max_children?: number;
}

export type SortOrder = 'asc' | 'desc';

export interface HighlightConfig {
  fields: Record<string, HighlightFieldConfig>;
  pre_tags?: string[];
  post_tags?: string[];
  fragment_size?: number;
  number_of_fragments?: number;
  type?: 'unified' | 'plain' | 'fvh';
  boundary_scanner?: 'chars' | 'sentence' | 'word';
  boundary_chars?: string;
  boundary_max_scan?: number;
  boundary_scanner_locale?: string;
  encoder?: 'default' | 'html';
  fragmenter?: 'simple' | 'span';
  highlight_query?: QueryClause;
  matched_fields?: string[];
  no_match_size?: number;
  order?: 'score';
  phrase_limit?: number;
  require_field_match?: boolean;
  tags_schema?: 'styled';
}

export interface HighlightFieldConfig {
  type?: 'unified' | 'plain' | 'fvh';
  fragment_size?: number;
  number_of_fragments?: number;
  pre_tags?: string[];
  post_tags?: string[];
  no_match_size?: number;
  matched_fields?: string[];
  highlight_query?: QueryClause;
}

// Aggregations
export interface AggregationClause {
  terms?: TermsAggregation;
  date_histogram?: DateHistogramAggregation;
  histogram?: HistogramAggregation;
  range?: RangeAggregation;
  date_range?: DateRangeAggregation;
  filters?: FiltersAggregation;
  nested?: NestedAggregation;
  reverse_nested?: ReverseNestedAggregation;
  cardinality?: CardinalityAggregation;
  value_count?: ValueCountAggregation;
  avg?: MetricAggregation;
  sum?: MetricAggregation;
  min?: MetricAggregation;
  max?: MetricAggregation;
  stats?: MetricAggregation;
  extended_stats?: MetricAggregation;
  percentiles?: PercentilesAggregation;
  percentile_ranks?: PercentileRanksAggregation;
  top_hits?: TopHitsAggregation;
  aggs?: Record<string, AggregationClause>;
}

export interface TermsAggregation {
  field: string;
  size?: number;
  show_term_doc_count_error?: boolean;
  order?: Record<string, SortOrder> | Record<string, SortOrder>[];
  min_doc_count?: number;
  shard_min_doc_count?: number;
  include?: string | string[] | { pattern: string; flags?: string };
  exclude?: string | string[] | { pattern: string; flags?: string };
  missing?: string | number;
  script?: Script;
}

export interface DateHistogramAggregation {
  field: string;
  calendar_interval?: string;
  fixed_interval?: string;
  interval?: string; // deprecated
  time_zone?: string;
  format?: string;
  offset?: string;
  keyed?: boolean;
  min_doc_count?: number;
  extended_bounds?: {
    min: string;
    max: string;
  };
  hard_bounds?: {
    min: string;
    max: string;
  };
  missing?: string;
  order?: Record<string, SortOrder>;
}

export interface HistogramAggregation {
  field: string;
  interval: number;
  min_doc_count?: number;
  extended_bounds?: {
    min: number;
    max: number;
  };
  hard_bounds?: {
    min: number;
    max: number;
  };
  missing?: number;
  keyed?: boolean;
  order?: Record<string, SortOrder>;
}

export interface RangeAggregation {
  field: string;
  ranges: Array<{
    key?: string;
    from?: number;
    to?: number;
  }>;
  keyed?: boolean;
  missing?: number;
  script?: Script;
}

export interface DateRangeAggregation {
  field: string;
  ranges: Array<{
    key?: string;
    from?: string;
    to?: string;
  }>;
  format?: string;
  time_zone?: string;
  keyed?: boolean;
  missing?: string;
}

export interface FiltersAggregation {
  filters: Record<string, QueryClause> | QueryClause[];
  other_bucket?: boolean;
  other_bucket_key?: string;
}

export interface NestedAggregation {
  path: string;
}

export interface ReverseNestedAggregation {
  path?: string;
}

export interface CardinalityAggregation {
  field: string;
  precision_threshold?: number;
  rehash?: boolean;
  missing?: string | number;
  script?: Script;
}

export interface ValueCountAggregation {
  field: string;
  missing?: string | number;
  script?: Script;
}

export interface MetricAggregation {
  field: string;
  missing?: string | number;
  script?: Script;
}

export interface PercentilesAggregation {
  field: string;
  percents?: number[];
  keyed?: boolean;
  tdigest?: {
    compression?: number;
  };
  hdr?: {
    number_of_significant_value_digits?: number;
  };
  missing?: number;
  script?: Script;
}

export interface PercentileRanksAggregation {
  field: string;
  values: number[];
  keyed?: boolean;
  tdigest?: {
    compression?: number;
  };
  hdr?: {
    number_of_significant_value_digits?: number;
  };
  missing?: number;
  script?: Script;
}

export interface TopHitsAggregation {
  from?: number;
  size?: number;
  sort?: SortClause[];
  _source?: boolean | string | string[];
  stored_fields?: string[];
  highlight?: HighlightConfig;
  explain?: boolean;
  script_fields?: Record<string, Script>;
  docvalue_fields?: string[];
  version?: boolean;
  seq_no_primary_term?: boolean;
}

export interface Script {
  source?: string;
  id?: string;
  lang?: string;
  params?: Record<string, any>;
}

// Search Results
export interface SearchResponse<T = any> {
  took: number;
  timed_out: boolean;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  hits: {
    total: {
      value: number;
      relation: 'eq' | 'gte';
    };
    max_score: number | null;
    hits: SearchHit<T>[];
  };
  aggregations?: Record<string, any>;
}

export interface SearchHit<T = any> {
  _index: string;
  _type?: string;
  _id: string;
  _score: number | null;
  _source: T;
  fields?: Record<string, any>;
  highlight?: Record<string, string[]>;
  sort?: any[];
  _explanation?: any;
  matched_queries?: string[];
}

// Search Filters and Options
export interface LogSearchFilters {
  start_time?: string;
  end_time?: string;
  source_ids?: string[];
  agent_types?: string[];
  levels?: LogLevel[];
  session_ids?: string[];
  user_ids?: string[];
  query?: string;
  tags?: string[];
  error_types?: string[];
  file_paths?: string[];
  function_names?: string[];
  correlation_id?: string;
  request_id?: string;
  has_errors?: boolean;
  min_duration?: number;
  max_duration?: number;
}

export interface LogSearchOptions {
  size?: number;
  from?: number;
  sort?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  highlight?: boolean;
  include_raw_log?: boolean;
  include_metadata?: boolean;
  track_total_hits?: boolean;
  timeout?: string;
}

export interface LogAggregationOptions {
  time_interval?: string; // '1m', '5m', '1h', '1d'
  group_by?: string[]; // ['source_id', 'agent_type', 'level']
  metrics?: string[]; // ['count', 'error_rate', 'avg_duration']
  top_terms_size?: number;
  date_format?: string;
  time_zone?: string;
}

// Health and monitoring types
export interface ElasticsearchHealth {
  status: 'green' | 'yellow' | 'red';
  cluster_name: string;
  timed_out: boolean;
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  delayed_unassigned_shards: number;
  number_of_pending_tasks: number;
}

export interface IndexInfo {
  index: string;
  docs_count: number;
  docs_deleted: number;
  store_size_bytes: number;
  segments_count: number;
  segments_memory_bytes: number;
}

export interface IndexStats {
  index: string;
  total: {
    docs: {
      count: number;
      deleted: number;
    };
    store: {
      size_in_bytes: number;
    };
    segments: {
      count: number;
      memory_in_bytes: number;
    };
  };
}

// Constants
export const LOG_INDEX_PREFIX = 'logs';
export const LOG_SOURCE_INDEX = 'log-sources';
export const ERROR_PATTERN_INDEX = 'error-patterns';

export const DEFAULT_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 1,
  refresh_interval: '5s',
  max_result_window: 50000,
} as any;

export const LOG_INDEX_MAPPINGS = {
  dynamic: false,
  properties: {
    '@timestamp': { type: 'date' },
    log_id: { type: 'keyword' },
    source_id: { type: 'keyword' },
    level: { type: 'keyword' },
    message: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    agent_type: { type: 'keyword' },
    agent_version: { type: 'keyword' },
    session_id: { type: 'keyword' },
    file_path: {
      type: 'text',
      analyzer: 'path_analyzer',
      fields: {
        keyword: { type: 'keyword', ignore_above: 512 },
      },
    },
    line_number: { type: 'integer' },
    function_name: { type: 'keyword' },
    metadata: { type: 'object', enabled: false },
    tags: { type: 'keyword' },
    duration_ms: { type: 'float' },
    memory_usage_mb: { type: 'float' },
    cpu_usage_percent: { type: 'float' },
    error_code: { type: 'keyword' },
    error_type: { type: 'keyword' },
    stack_trace: {
      type: 'text',
      analyzer: 'standard',
      index: false,
    },
    user_id: { type: 'keyword' },
    request_id: { type: 'keyword' },
    correlation_id: { type: 'keyword' },
    raw_log: { type: 'text', index: false },
    ingested_at: { type: 'date' },
    processed_at: { type: 'date' },
    message_tokens: { type: 'keyword' },
    error_fingerprint: { type: 'keyword' },
    log_signature: { type: 'keyword' },
    path_hierarchy: { type: 'text', analyzer: 'path_analyzer' },
  },
} as any;

export interface IndexInfo {
  name: string;
  health: 'green' | 'yellow' | 'red';
  status: 'open' | 'close';
  uuid: string;
  primary_shards: number;
  replica_shards: number;
  docs_count: number;
  docs_deleted: number;
  store_size_bytes: number;
  primary_store_size_bytes: number;
} 