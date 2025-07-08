"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Filter, Calendar, Regex, Save, RotateCcw, ChevronDown, ChevronUp, X, Download, Play, Pause, Wifi, WifiOff } from "lucide-react";
import { config, getWebSocketUrl } from '@/lib/config';
import { useWebSocket } from '@/hooks/useWebSocket';

type LogEntry = {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  agentType?: string;
  sessionId?: string;
  context?: any;
  metadata?: any;
  raw?: string;
};

type Agent = {
  id: string;
  name?: string;
  available?: boolean;
};

type FilterPreset = {
  id: string;
  name: string;
  filters: FilterState;
  created: Date;
};

type FilterState = {
  search: string;
  useRegex: boolean;
  levels: string[];
  sources: string[];
  timeRange: {
    start: string;
    end: string;
  };
};

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
const PAGE_SIZE_OPTIONS = [20, 30, 40];
const DEFAULT_PAGE_SIZE = 20;

const LOG_LEVEL_COLORS = {
  trace: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  debug: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  info: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  warn: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  fatal: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
};

const DEFAULT_FILTER_STATE: FilterState = {
  search: "",
  useRegex: false,
  levels: [],
  sources: [],
  timeRange: {
    start: "",
    end: ""
  }
};

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [regexError, setRegexError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isClient, setIsClient] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveLogCount, setLiveLogCount] = useState(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load filter presets from localStorage
  useEffect(() => {
    if (!isClient) return;
    const saved = localStorage.getItem('log-viewer-presets');
    if (saved) {
      try {
        setFilterPresets(JSON.parse(saved));
      } catch {}
    }
  }, [isClient]);

  // Fetch agents for source dropdown
  useEffect(() => {
    if (!isClient) return;
    async function fetchAgents() {
      try {
        const res = await fetch(`${config.backendUrl}/api/agents`);
        const data = await res.json();
        setAgents(Array.isArray(data.agents) ? data.agents : []);
      } catch {}
    }
    fetchAgents();
  }, [isClient]);

  // Reset to page 1 when filters or page size change
  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  // Validate regex when regex mode is enabled
  useEffect(() => {
    if (filters.useRegex && filters.search) {
      try {
        new RegExp(filters.search);
        setRegexError(null);
      } catch (e) {
        setRegexError(`Invalid regex: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    } else {
      setRegexError(null);
    }
  }, [filters.search, filters.useRegex]);

  // Apply quick filters
  const applyQuickFilter = useCallback((type: string) => {
    const now = new Date();
    const updates: Partial<FilterState> = {};

    switch (type) {
      case 'errors-only':
        updates.levels = ['error', 'fatal'];
        break;
      case 'last-hour':
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        updates.timeRange = {
          start: oneHourAgo.toISOString().slice(0, 16),
          end: now.toISOString().slice(0, 16)
        };
        break;
      case 'last-24h':
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        updates.timeRange = {
          start: oneDayAgo.toISOString().slice(0, 16),
          end: now.toISOString().slice(0, 16)
        };
        break;
      case 'no-debug':
        updates.levels = LOG_LEVELS.filter(level => level !== 'debug' && level !== 'trace');
        break;
    }

    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  // Save filter preset
  const savePreset = useCallback(() => {
    if (!presetName.trim()) return;

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
      created: new Date()
    };

    const updated = [...filterPresets, newPreset];
    setFilterPresets(updated);
    localStorage.setItem('log-viewer-presets', JSON.stringify(updated));
    setPresetName("");
  }, [presetName, filters, filterPresets]);

  // Load filter preset
  const loadPreset = useCallback((preset: FilterPreset) => {
    setFilters(preset.filters);
  }, []);

  // Delete filter preset
  const deletePreset = useCallback((presetId: string) => {
    const updated = filterPresets.filter(p => p.id !== presetId);
    setFilterPresets(updated);
    localStorage.setItem('log-viewer-presets', JSON.stringify(updated));
  }, [filterPresets]);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTER_STATE);
  }, []);

  // WebSocket handlers for live mode
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'log-entry' && message.data) {
      const newLog = message.data;
      
      // Apply filters to determine if this log should be shown
      const matchesSearch = !filters.search || 
        newLog.message?.toLowerCase().includes(filters.search.toLowerCase()) ||
        newLog.source?.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesLevel = filters.levels.length === 0 || filters.levels.includes(newLog.level);
      const matchesSource = filters.sources.length === 0 || filters.sources.includes(newLog.source);
      
      if (matchesSearch && matchesLevel && matchesSource) {
        setLogs(prevLogs => {
          // Add new log to the beginning and keep only pageSize logs for performance
          const updated = [newLog, ...prevLogs].slice(0, pageSize * 2);
          return updated;
        });
        setLiveLogCount(prev => prev + 1);
      }
    }
  }, [filters.search, filters.levels, filters.sources, pageSize]);

  const handleWebSocketConnect = useCallback(() => {
    console.log('📡 Connected to live log stream');
  }, []);

  const handleWebSocketDisconnect = useCallback(() => {
    console.log('📡 Disconnected from live log stream');
  }, []);

  const handleWebSocketError = useCallback((error: any) => {
    console.warn('⚠️ Live log stream connection failed:', error);
  }, []);

  // Toggle live mode
  const toggleLiveMode = useCallback(() => {
    setIsLiveMode(prev => {
      const newLiveMode = !prev;
      if (newLiveMode) {
        setLiveLogCount(0); // Reset count when enabling
        setPage(1); // Reset to first page
      }
      return newLiveMode;
    });
  }, []);

  // WebSocket connection for live logs
  const { isConnected, isConnecting } = useWebSocket({
    url: getWebSocketUrl('/ws/logs'),
    onMessage: handleWebSocketMessage,
    onConnect: handleWebSocketConnect,
    onDisconnect: handleWebSocketDisconnect,
    onError: handleWebSocketError,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 3000
  });

  // Fetch logs with filters and pagination
  useEffect(() => {
    if (!isClient) return;
    
    // Skip fetching in live mode - logs come from WebSocket
    if (isLiveMode) {
      setLoading(false);
      return;
    }
    
    async function fetchLogs() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        
        // Handle search with regex support
        if (filters.search) {
          if (filters.useRegex && !regexError) {
            params.append('searchRegex', filters.search);
          } else if (!filters.useRegex) {
            params.append('search', filters.search);
          }
        }
        
        // Apply level filters
        if (filters.levels.length > 0) {
          params.append('levels', filters.levels.join(','));
        }
        
        // Apply source filters
        if (filters.sources.length > 0) {
          params.append('sources', filters.sources.join(','));
        }
        
        // Apply time range filters
        if (filters.timeRange.start) {
          params.append('from', filters.timeRange.start);
        }
        if (filters.timeRange.end) {
          params.append('to', filters.timeRange.end);
        }
        
        params.append('limit', pageSize.toString());
        params.append('offset', ((page - 1) * pageSize).toString());
        
        const res = await fetch(`${config.backendUrl}/api/logs?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`API returned status ${res.status}`);
        }
        const data = await res.json();
        const logs: LogEntry[] = Array.isArray(data) ? data : [];
        const hasMore = logs.length === pageSize;
        
        setLogs(logs);
        setHasMore(hasMore);
      } catch (e) {
        setError(`Failed to load logs: ${e instanceof Error ? e.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [isClient, filters, page, pageSize, regexError, isLiveMode]);

  // Export filtered logs
  const exportLogs = useCallback(async () => {
    try {
      const body: any = { limit: 10000 }; // Export more logs
      
      if (filters.search) {
        if (filters.useRegex && !regexError) {
          body.searchRegex = filters.search;
        } else if (!filters.useRegex) {
          body.search = filters.search;
        }
      }
      
      if (filters.levels.length > 0) body.levels = filters.levels;
      if (filters.sources.length > 0) body.sources = filters.sources;
      if (filters.timeRange.start) body.from = filters.timeRange.start;
      if (filters.timeRange.end) body.to = filters.timeRange.end;
      
      const params = new URLSearchParams();
      if (body.query) params.append('search', body.query);
      params.append('limit', '10000'); // Large limit for export
      if (body.levels) params.append('levels', body.levels.join(','));
      if (body.sources) params.append('sources', body.sources.join(','));
      if (body.from) params.append('from', body.from);
      if (body.to) params.append('to', body.to);
      
      const res = await fetch(`${config.backendUrl}/api/logs?${params}`);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        const logs = data;
        const csv = [
          'Timestamp,Level,Source,Agent Type,Session ID,Message',
          ...logs.map((log: LogEntry) => 
            `"${log.timestamp}","${log.level}","${log.source}","${log.agentType || ''}","${log.sessionId || ''}","${log.message.replace(/"/g, '""')}"`
          )
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, [filters, regexError]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.levels.length > 0) count++;
    if (filters.sources.length > 0) count++;
    if (filters.timeRange.start || filters.timeRange.end) count++;
    return count;
  }, [filters]);

  if (!isClient) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Enhanced Log Viewer</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Advanced log filtering with regex support</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Live Mode Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
              {isConnected && isLiveMode ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">Live</span>
                  {liveLogCount > 0 && (
                    <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs">
                      +{liveLogCount}
                    </span>
                  )}
                </>
              ) : isLiveMode && isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-yellow-600 dark:text-yellow-400">Connecting...</span>
                </>
              ) : isLiveMode ? (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-red-600 dark:text-red-400">Disconnected</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400">Static</span>
                </>
              )}
            </div>

            {/* Live Mode Toggle */}
            <button
              onClick={toggleLiveMode}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                isLiveMode 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLiveMode ? (
                <>
                  <Pause className="w-4 h-4" />
                  Stop Live
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Go Live
                </>
              )}
            </button>

            <button
              onClick={exportLogs}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* Quick Filter Bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => applyQuickFilter('errors-only')}
          className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm hover:bg-red-200 transition"
        >
          Errors Only
        </button>
        <button
          onClick={() => applyQuickFilter('last-hour')}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition"
        >
          Last Hour
        </button>
        <button
          onClick={() => applyQuickFilter('last-24h')}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition"
        >
          Last 24h
        </button>
        <button
          onClick={() => applyQuickFilter('no-debug')}
          className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm hover:bg-gray-200 transition"
        >
          No Debug/Trace
        </button>
        <button
          onClick={resetFilters}
          className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm hover:bg-gray-200 transition flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      {/* Main Search and Filter Toggle */}
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          {/* Search Input */}
          <div className="flex-1 relative">
            <div className="relative flex items-center">
              <div className="absolute left-3 pointer-events-none z-10">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={filters.useRegex ? "Enter regex pattern..." : "Search message..."}
                value={filters.search}
                onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className={`pl-14 pr-16 py-2.5 w-full rounded border ${
                  regexError 
                    ? 'border-red-300 focus:ring-red-500' 
                    : 'border-gray-300 dark:border-gray-700 focus:ring-blue-500'
                } bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2`}
              />
              <div className="absolute right-3">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, useRegex: !prev.useRegex }))}
                  className={`p-1.5 rounded ${
                    filters.useRegex 
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' 
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                  title={filters.useRegex ? "Disable regex" : "Enable regex"}
                >
                  <Regex className="w-4 h-4" />
                </button>
              </div>
            </div>
            {regexError && (
              <p className="text-red-500 text-xs mt-1">{regexError}</p>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${
              showAdvancedFilters 
                ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300'
                : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.5rem] text-center">
                {activeFilterCount}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Log Levels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Log Levels
                </label>
                <div className="relative">
                  <select
                    multiple
                    value={filters.levels}
                    onChange={e => {
                      const newLevels = Array.from(e.target.selectedOptions, option => option.value);
                      setFilters(prev => ({ ...prev, levels: newLevels }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    style={{ height: '120px' }}
                  >
                    {LOG_LEVELS.map(level => (
                      <option key={level} value={level} className="py-1">
                        {level.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Hold Ctrl/Cmd to select multiple levels
                  </div>
                  {filters.levels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {filters.levels.map(level => (
                        <span key={level} className={`text-xs px-2 py-1 rounded font-medium ${LOG_LEVEL_COLORS[level as keyof typeof LOG_LEVEL_COLORS]}`}>
                          {level}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sources/Agents */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Sources/Agents
                </label>
                <div className="relative">
                  <select
                    multiple
                    value={filters.sources}
                    onChange={e => {
                      const newSources = Array.from(e.target.selectedOptions, option => option.value);
                      setFilters(prev => ({ ...prev, sources: newSources }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    style={{ height: '120px' }}
                  >
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id} className="py-1">
                        {agent.name || agent.id}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Hold Ctrl/Cmd to select multiple sources
                  </div>
                  {filters.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {filters.sources.map(sourceId => {
                        const agent = agents.find(a => a.id === sourceId);
                        return (
                          <span key={sourceId} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 rounded font-medium">
                            {agent?.name || sourceId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Time Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Time Range
                </label>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={filters.timeRange.start}
                    onChange={e => setFilters(prev => ({ 
                      ...prev, 
                      timeRange: { ...prev.timeRange, start: e.target.value }
                    }))}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="Start time"
                  />
                  <input
                    type="datetime-local"
                    value={filters.timeRange.end}
                    onChange={e => setFilters(prev => ({ 
                      ...prev, 
                      timeRange: { ...prev.timeRange, end: e.target.value }
                    }))}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="End time"
                  />
                </div>
              </div>
            </div>

            {/* Filter Presets */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Filter Presets</h3>
                  <div className="flex flex-wrap gap-2">
                    {filterPresets.map(preset => (
                      <div key={preset.id} className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <button
                          onClick={() => loadPreset(preset)}
                          className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-l-lg"
                        >
                          {preset.name}
                        </button>
                        <button
                          onClick={() => deletePreset(preset.id)}
                          className="px-2 py-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded-r-lg"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Preset name"
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={savePreset}
                    disabled={!presetName.trim()}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Split Pane Layout */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Top Pane - Log Table */}
        <div className={`${selectedLog ? 'h-80' : 'h-96'} flex flex-col ${selectedLog ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">Loading logs...</div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-red-500">{error}</div>
          ) : regexError ? (
            <div className="h-full flex items-center justify-center text-red-500 text-center">
              <div>
                <p>Cannot search with invalid regex pattern.</p>
                <p className="text-sm mt-2">{regexError}</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-center">
              <div>
                <p>No logs found matching your filters.</p>
                <button
                  onClick={resetFilters}
                  className="mt-2 text-blue-600 hover:text-blue-800 text-sm underline"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <div className="w-full">
                  <table className="w-full table-fixed text-sm border-collapse">
                  <colgroup>
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '70px' }} />
                    <col style={{ width: '180px' }} />
                    <col style={{ width: 'calc(100% - 440px)' }} />
                    <col style={{ width: '50px' }} />
                  </colgroup>
                  <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-gray-200 text-sm">Timestamp</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-gray-200 text-sm">Level</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-gray-200 text-sm">Source</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-gray-200 text-sm">Message</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 dark:text-gray-200 text-sm">
                        <span className="sr-only">Expand</span>
                        ↕️
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {logs.map((log, index) => (
                      <tr
                        key={`${log.id}-${index}-${log.timestamp}`}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer border-l-4 ${
                          selectedLog?.id === log.id 
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' 
                            : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                        onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                        title="Click to view details"
                      >
                        <td className={`px-4 py-3 whitespace-nowrap font-mono text-xs ${
                          selectedLog?.id === log.id ? 'text-blue-900 dark:text-blue-100' : 'text-gray-600 dark:text-gray-400'
                        }`}>
                          <div className="text-xs">
                            {new Date(log.timestamp).toLocaleDateString()},
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${LOG_LEVEL_COLORS[log.level as keyof typeof LOG_LEVEL_COLORS] || 'bg-gray-100 text-gray-800'}`}>
                            {log.level}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-medium text-sm ${
                          selectedLog?.id === log.id ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          <div className="truncate" title={log.source}>
                            {log.source.replace('.log', '')}
                          </div>
                        </td>
                        <td className={`px-4 py-3 ${
                          selectedLog?.id === log.id ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'
                        }`}>
                          <div className="break-words whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} title={log.message}>
                            {log.message}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center">
                            {selectedLog?.id === log.id ? (
                              <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
              
              {/* Pagination */}
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {logs.length} logs {hasMore && '(more available)'}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {PAGE_SIZE_OPTIONS.map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-600 dark:text-gray-400">per page</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-700 dark:text-gray-300">Page {page}</span>
                  <button
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasMore || loading}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Pane - Log Details */}
        {selectedLog && (
          <div className="h-80 flex flex-col bg-white dark:bg-gray-800">
            {/* Details Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Log Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                title="Close details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Details Content */}
            <div className="flex-1 overflow-auto p-4 bg-white dark:bg-gray-800">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4 min-w-0">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID</label>
                    <p className="text-sm font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded border break-all">{selectedLog.id}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timestamp</label>
                    <p className="text-sm font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded border">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Level</label>
                    <div className="flex items-center">
                      <span className={`px-3 py-1 rounded text-sm font-medium ${LOG_LEVEL_COLORS[selectedLog.level as keyof typeof LOG_LEVEL_COLORS] || 'bg-gray-100 text-gray-800'}`}>
                        {selectedLog.level}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                    <p className="text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded border break-all">{selectedLog.source}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Type</label>
                    <p className="text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded border">{selectedLog.agentType || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Session ID</label>
                    <p className="text-sm font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded border break-all">{selectedLog.sessionId || 'N/A'}</p>
                  </div>
                </div>
                
                <div className="space-y-4 min-w-0">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border text-sm overflow-x-auto">
                      <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 break-words">{selectedLog.message}</pre>
                    </div>
                  </div>
                  {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Metadata</label>
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border text-xs overflow-x-auto">
                        <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 break-words">
                          {JSON.stringify(selectedLog.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Context</label>
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border text-xs overflow-x-auto">
                        <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 break-words">
                          {JSON.stringify(selectedLog.context, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  {selectedLog.raw && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Raw Log</label>
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border text-xs overflow-x-auto">
                        <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 break-words">
                          {selectedLog.raw}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>


    </div>
  );
} 