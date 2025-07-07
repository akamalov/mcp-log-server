'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useWebSocket } from '@/hooks/useWebSocket';
import DataExport from '@/components/export/DataExport';
import { config, getWebSocketUrl } from '@/lib/config';

// Color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

interface AnalyticsSummary {
  totalLogs: number;
  totalAgents: number;
  errorRate: number;
  avgResponseTime: number;
  logLevels: Record<string, number>;
  agentDistribution: Record<string, number>;
  recentActivity: Array<{
    timestamp: string;
    count: number;
    level: string;
  }>;
}

interface LogMetrics {
  metrics: {
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByAgent: Record<string, number>;
    logsByHour: Record<string, number>;
    errorRate: number;
    averageLogsPerMinute: number;
  };
  agentHealth: Array<{
    agentId: string;
    agentName: string;
    lastActivity: string;
    logVolume24h: number;
    errorCount24h: number;
    warningCount24h: number;
    healthScore: number;
    status: string;
  }>;
  topPatterns: Array<{
    pattern: string;
    count: number;
    percentage: number;
    severity: string;
  }>;
}

export default function AnalyticsPage() {
  const [analyticsData, setAnalyticsData] = useState<LogMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [newLogCount, setNewLogCount] = useState(0);
  const [realtimeStats, setRealtimeStats] = useState({
    connectedClients: 0,
    logsPerSecond: 0,
    activeAgents: 0
  });

  // Memoized WebSocket event handlers
  const handleWebSocketMessage = useCallback((message: any) => {
    console.log('📡 Real-time message:', message.type, message.data);
    
    switch (message.type) {
      case 'analytics-update':
        setAnalyticsData(message.data);
        setLastUpdate(new Date());
        break;
        
      case 'log-entry':
        setNewLogCount(prev => prev + 1);
        setRealtimeStats(prev => ({
          ...prev,
          logsPerSecond: prev.logsPerSecond + 1
        }));
        break;
        
      case 'agent-status':
        setRealtimeStats(prev => ({
          ...prev,
          activeAgents: message.data.totalAgents
        }));
        break;
        
      case 'health-update':
        // Handle health updates
        break;
        
      case 'pattern-alert':
        console.log('🚨 Pattern alert:', message.data);
        break;
    }
  }, []);

  const handleWebSocketConnect = useCallback(() => {
    console.log('✅ Connected to analytics WebSocket');
    setError(null);
  }, []);

  const handleWebSocketDisconnect = useCallback(() => {
    console.log('🔌 Disconnected from analytics WebSocket');
    setError('Real-time connection lost. Attempting to reconnect...');
  }, []);

  const handleWebSocketReconnect = useCallback(() => {
    console.log('🔄 Attempting to reconnect to analytics WebSocket');
  }, []);

  const handleWebSocketError = useCallback((error: any) => {
    const wsUrl = getWebSocketUrl('/ws/analytics');
    console.error('❌ WebSocket error:', {
      type: error.type,
      target: error.target?.readyState,
      url: wsUrl,
      readyState: error.target?.readyState,
      error: error
    });
    setError(`Real-time connection error: ${error.type || 'Connection failed'} (${wsUrl})`);
  }, []);

  // WebSocket connection for real-time updates
  const { isConnected, isConnecting, reconnectAttempts } = useWebSocket({
    url: getWebSocketUrl('/ws/analytics'),
    onMessage: handleWebSocketMessage,
    onConnect: handleWebSocketConnect,
    onDisconnect: handleWebSocketDisconnect,
    onError: handleWebSocketError,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectInterval: 5000
  });

  // Fallback polling when WebSocket fails
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    
    // If WebSocket is not connected and not attempting to connect, start polling
    if (!isConnected && !isConnecting && reconnectAttempts >= 10) {
      console.log('🔄 WebSocket failed, falling back to polling');
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`${config.backendUrl}/api/analytics/summary`);
          if (response.ok) {
            const data = await response.json();
            setAnalyticsData(data);
            setLastUpdate(new Date());
          }
        } catch (error) {
          console.warn('Polling failed:', error);
        }
      }, 10000); // Poll every 10 seconds
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isConnected, isConnecting, reconnectAttempts]);

  // Check backend health and fetch initial analytics data
  useEffect(() => {
    async function checkBackendHealth() {
      try {
        const healthResponse = await fetch(`${config.backendUrl}/health`);
        if (!healthResponse.ok) {
          throw new Error(`Health check failed: ${healthResponse.status}`);
        }
        const healthData = await healthResponse.json();
        console.log('✅ Backend health check passed:', healthData);
      } catch (error) {
        console.error('❌ Backend health check failed:', error);
        setError('Backend server is not running. Please start the server with "pnpm dev"');
        setLoading(false);
        return;
      }
    }

    async function fetchInitialData() {
      setLoading(true);
      setError(null);
      
      // First check if backend is running
      await checkBackendHealth();
      
      try {
        const response = await fetch(`${config.backendUrl}/api/analytics/summary`);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        const data = await response.json();
        setAnalyticsData(data);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch analytics data:', error);
        setError('Failed to load analytics data. ' + (error instanceof Error ? error.message : 'Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    fetchInitialData();
  }, []);

  // Reset new log count every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setNewLogCount(0);
      setRealtimeStats(prev => ({ ...prev, logsPerSecond: 0 }));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-200 dark:bg-gray-700 h-32 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-200 dark:bg-gray-700 h-64 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !analyticsData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h3 className="text-red-800 dark:text-red-200 font-medium">Error Loading Analytics</h3>
          <p className="text-red-600 dark:text-red-300 mt-1">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const logLevelData = analyticsData ? Object.entries(analyticsData.metrics.logsByLevel).map(([level, count]) => ({
    name: level.charAt(0).toUpperCase() + level.slice(1),
    value: count,
    percentage: ((count / analyticsData.metrics.totalLogs) * 100).toFixed(1)
  })) : [];

  const agentData = analyticsData ? Object.entries(analyticsData.metrics.logsByAgent).map(([agent, count]) => ({
    name: agent.replace('mock-', '').charAt(0).toUpperCase() + agent.replace('mock-', '').slice(1),
    logs: count,
    percentage: ((count / analyticsData.metrics.totalLogs) * 100).toFixed(1)
  })) : [];

  const hourlyData = analyticsData ? Object.entries(analyticsData.metrics.logsByHour).map(([hour, count]) => ({
    time: new Date(hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    logs: count
  })) : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Real-time log analysis and insights</p>
          </div>
        
        <div className="flex items-center space-x-4">
          {/* Real-time Status Indicator */}
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 
              reconnectAttempts >= 3 ? 'bg-yellow-500' : 'bg-red-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'Live' : 
               reconnectAttempts >= 3 ? 'Polling' : 'Disconnected'}
            </span>
          </div>
          
          {/* New Logs Counter */}
          {newLogCount > 0 && (
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              +{newLogCount} new logs
            </div>
          )}
          
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
        </div>
      )}

      {/* Real-time Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">📊</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Logs</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analyticsData?.metrics.totalLogs.toLocaleString() || '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">🤖</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Active Agents</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {realtimeStats.activeAgents || (analyticsData ? Object.keys(analyticsData.metrics.logsByAgent).length : 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">⚠️</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {((analyticsData?.metrics.errorRate || 0) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">⚡</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Logs/Min</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analyticsData?.metrics.averageLogsPerMinute.toFixed(1) || '0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Log Levels Pie Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Log Levels Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={logLevelData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name} (${percentage}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {logLevelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Log Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Hourly Log Activity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="logs" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Agent Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Agent Log Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="logs" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Agent Health Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Agent Health Status</h2>
          <div className="space-y-4">
            {analyticsData?.agentHealth.map((agent, index) => (
              <div key={`${agent.agentId}-${index}`} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">{agent.agentName}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    agent.status === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                  }`}>
                    {agent.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 dark:text-gray-300">Health Score</p>
                    <p className="font-bold text-gray-900 dark:text-white">{agent.healthScore}%</p>
                  </div>
                  <div>
                    <p className="text-gray-600 dark:text-gray-300">24h Logs</p>
                    <p className="font-bold text-gray-900 dark:text-white">{agent.logVolume24h}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 dark:text-gray-300">Errors</p>
                    <p className="font-bold text-red-600 dark:text-red-400">{agent.errorCount24h}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Patterns */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Log Patterns</h2>
        {analyticsData?.topPatterns && analyticsData.topPatterns.length > 0 ? (
          <div className="space-y-3">
            {analyticsData.topPatterns.slice(0, 8).map((pattern, index) => (
              <div key={index} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={pattern.pattern}>
                    {pattern.pattern}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {pattern.count.toLocaleString()} occurrences ({pattern.percentage.toFixed(1)}%)
                  </p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    pattern.severity === 'low' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                    pattern.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' :
                    'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                  }`}>
                    {pattern.severity}
                  </span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded font-mono">
                    {pattern.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No patterns detected yet</p>
            <p className="text-sm mt-1">Patterns will appear as logs are analyzed</p>
          </div>
        )}
      </div>

      {/* Data Export Section */}
      <div className="mt-8">
        <DataExport />
      </div>
    </div>
  );
}
