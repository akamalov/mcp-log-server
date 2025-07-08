'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { config } from '@/lib/config';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

// Color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC0CB', '#DDA0DD'];

interface EnhancedAnalytics {
  performanceMetrics: {
    responseTimeDistribution: Array<{ time: string; avg: number; p95: number; p99: number }>;
    throughputTrends: Array<{ timestamp: string; logsPerSecond: number; agentCount: number }>;
    errorAnalysis: Array<{ hour: string; errors: number; warnings: number; info: number }>;
  };
  agentBehaviorAnalysis: {
    agentPerformance: Array<{ 
      agentId: string; 
      name: string; 
      efficiency: number; 
      reliability: number; 
      activity: number; 
    }>;
    correlationMatrix: Array<{ 
      metric1: string; 
      metric2: string; 
      correlation: number; 
    }>;
  };
  predictiveInsights: {
    logVolumeProjection: Array<{ date: string; actual: number; predicted: number }>;
    anomalyScores: Array<{ timestamp: string; score: number; threshold: number }>;
    capacityAnalysis: { currentUtilization: number; projectedPeak: number; recommendations: string[] };
  };
  patternAnalysis: {
    sequencePatterns: Array<{ pattern: string; frequency: number; avgDuration: number }>;
    seasonalTrends: Array<{ period: string; pattern: string; strength: number }>;
    emergingPatterns: Array<{ pattern: string; growthRate: number; significance: number }>;
  };
}

let intervalIdCounter = 0;

// Global interval tracking for debugging
if (typeof window !== 'undefined' && !window.__enhancedLogIntervalId) {
  window.__enhancedLogIntervalId = null;
}

export default function EnhancedAnalyticsPage() {
  const [analyticsData, setAnalyticsData] = useState<EnhancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [selectedView, setSelectedView] = useState('performance');
  const [mode, setMode] = useState<'live' | 'manual'>('manual');
  const [modeSwitching, setModeSwitching] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logPage, setLogPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const LOGS_PAGE_SIZE = 25;

  const fetchEnhancedAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const healthResponse = await fetch(`${config.backendUrl}/health`);
      if (!healthResponse.ok) throw new Error('Backend is not healthy');
      const response = await fetch(`${config.backendUrl}/api/analytics/enhanced?timeRange=${selectedTimeRange}`);
      if (!response.ok) {
        setAnalyticsData(generateMockEnhancedData());
      } else {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (error) {
      setAnalyticsData(generateMockEnhancedData());
      setError('Using mock data - enhanced analytics endpoint not implemented yet');
    } finally {
      setLoading(false);
    }
  };

  const fetchPaginatedLogs = async (page = 0) => {
    setLogsLoading(true);
    try {
      const response = await fetch(`${config.backendUrl}/api/analytics/enhanced/logs?limit=${LOGS_PAGE_SIZE}&offset=${page * LOGS_PAGE_SIZE}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      } else {
        setLogs([]);
      }
    } catch (err) {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  // Dedicated effect for interval management
  useEffect(() => {
    if (mode === 'live') {
      if (!intervalRef.current) {
        fetchEnhancedAnalytics();
        window.__enhancedLogIntervalId = setInterval(() => {
          fetchEnhancedAnalytics();
          console.log('Live interval tick, id:', window.__enhancedLogIntervalId);
        }, 5000);
        intervalRef.current = window.__enhancedLogIntervalId;
        console.log('Interval created for Live mode, id:', window.__enhancedLogIntervalId);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('Interval cleared because mode is not live, id:', intervalRef.current);
        intervalRef.current = null;
        window.__enhancedLogIntervalId = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('Interval cleared on unmount, id:', intervalRef.current);
        intervalRef.current = null;
        window.__enhancedLogIntervalId = null;
      }
    };
  }, [mode]);

  // Always clear interval on every render if not live
  useEffect(() => {
    if (mode !== 'live') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('Interval forcibly cleared on render, id:', intervalRef.current);
        intervalRef.current = null;
        window.__enhancedLogIntervalId = null;
      }
    }
  });

  // Fetch analytics data once on mode or time range change
  useEffect(() => {
    if (mode === 'manual') {
      console.log('fetchEnhancedAnalytics called in manual mode');
      fetchEnhancedAnalytics();
    } else if (mode === 'live') {
      console.log('fetchEnhancedAnalytics called in live mode (effect)');
      fetchEnhancedAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTimeRange]);

  // Only fetch logs when requested in manual mode
  useEffect(() => {
    if (mode === 'manual') {
      setLogs([]);
      setLogPage(0);
    }
  }, [mode]);

  // Generate mock data for enhanced analytics
  const generateMockEnhancedData = (): EnhancedAnalytics => {
    const now = Date.now();
    const hours = Array.from({ length: 24 }, (_, i) => {
      const time = new Date(now - (23 - i) * 60 * 60 * 1000);
      return time.toISOString().slice(11, 16);
    });

    return {
      performanceMetrics: {
        responseTimeDistribution: hours.map(time => ({
          time,
          avg: Math.random() * 100 + 50,
          p95: Math.random() * 200 + 150,
          p99: Math.random() * 300 + 250
        })),
        throughputTrends: hours.map((_, i) => ({
          timestamp: hours[i],
          logsPerSecond: Math.random() * 50 + 10,
          agentCount: Math.floor(Math.random() * 5) + 3
        })),
        errorAnalysis: hours.map(hour => ({
          hour,
          errors: Math.floor(Math.random() * 10),
          warnings: Math.floor(Math.random() * 25) + 5,
          info: Math.floor(Math.random() * 100) + 50
        }))
      },
      agentBehaviorAnalysis: {
        agentPerformance: [
          { agentId: 'claude-cli', name: 'Claude CLI', efficiency: 85, reliability: 92, activity: 78 },
          { agentId: 'cursor', name: 'Cursor', efficiency: 78, reliability: 88, activity: 82 },
          { agentId: 'vscode', name: 'VS Code', efficiency: 82, reliability: 85, activity: 75 },
          { agentId: 'gemini', name: 'Gemini CLI', efficiency: 79, reliability: 87, activity: 68 }
        ],
        correlationMatrix: [
          { metric1: 'Log Volume', metric2: 'Response Time', correlation: -0.65 },
          { metric1: 'Error Rate', metric2: 'Throughput', correlation: -0.78 },
          { metric1: 'Agent Activity', metric2: 'System Load', correlation: 0.82 }
        ]
      },
      predictiveInsights: {
        logVolumeProjection: Array.from({ length: 7 }, (_, i) => {
          const date = new Date(now + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const base = 1000 + Math.sin(i) * 200;
          return {
            date,
            actual: i < 3 ? base + Math.random() * 100 : 0,
            predicted: base + Math.random() * 100
          };
        }),
        anomalyScores: hours.map(timestamp => ({
          timestamp,
          score: Math.random() * 100,
          threshold: 80
        })),
        capacityAnalysis: {
          currentUtilization: 67,
          projectedPeak: 85,
          recommendations: [
            'Scale horizontally during peak hours',
            'Optimize log processing pipeline',
            'Implement log retention policies'
          ]
        }
      },
      patternAnalysis: {
        sequencePatterns: [
          { pattern: 'Connect → Authenticate → Process → Disconnect', frequency: 245, avgDuration: 1250 },
          { pattern: 'Error → Retry → Success', frequency: 89, avgDuration: 3400 },
          { pattern: 'Idle → Active → Processing → Idle', frequency: 156, avgDuration: 2100 }
        ],
        seasonalTrends: [
          { period: 'Morning (6-12)', pattern: 'High activity', strength: 0.85 },
          { period: 'Afternoon (12-18)', pattern: 'Peak usage', strength: 0.92 },
          { period: 'Evening (18-24)', pattern: 'Declining activity', strength: 0.73 }
        ],
        emergingPatterns: [
          { pattern: 'Multi-agent coordination', growthRate: 0.23, significance: 0.78 },
          { pattern: 'Error burst cascades', growthRate: 0.15, significance: 0.65 },
          { pattern: 'Periodic batch processing', growthRate: 0.31, significance: 0.82 }
        ]
      }
    };
  };

  const renderPerformanceView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Response Time Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Response Time Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analyticsData?.performanceMetrics.responseTimeDistribution || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="avg" stroke="#0088FE" name="Average" />
            <Line type="monotone" dataKey="p95" stroke="#00C49F" name="95th Percentile" />
            <Line type="monotone" dataKey="p99" stroke="#FF8042" name="99th Percentile" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Throughput Trends */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Throughput & Agent Activity</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={analyticsData?.performanceMetrics.throughputTrends || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="logsPerSecond" stackId="1" stroke="#8884d8" fill="#8884d8" name="Logs/sec" />
            <Area type="monotone" dataKey="agentCount" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Active Agents" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Error Analysis */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 lg:col-span-2">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Error Analysis by Hour</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analyticsData?.performanceMetrics.errorAnalysis || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="errors" fill="#FF8042" name="Errors" />
            <Bar dataKey="warnings" fill="#FFBB28" name="Warnings" />
            <Bar dataKey="info" fill="#00C49F" name="Info" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderBehaviorView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Agent Performance Radar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Agent Performance Profile</h3>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={analyticsData?.agentBehaviorAnalysis.agentPerformance || []}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis domain={[0, 100]} />
            <Radar name="Efficiency" dataKey="efficiency" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            <Radar name="Reliability" dataKey="reliability" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
            <Radar name="Activity" dataKey="activity" stroke="#ffc658" fill="#ffc658" fillOpacity={0.6} />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Correlation Matrix */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Metric Correlations</h3>
        <div className="space-y-4">
          {analyticsData?.agentBehaviorAnalysis.correlationMatrix.map((corr, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {corr.metric1} ↔ {corr.metric2}
              </span>
              <div className="flex items-center">
                <div className={`w-16 h-2 rounded mr-2 ${corr.correlation > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                     style={{opacity: Math.abs(corr.correlation)}}></div>
                <span className={`text-sm font-bold ${corr.correlation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {corr.correlation.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPredictiveView = () => (
    <div className="space-y-6">
      {/* Log Volume Projection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Log Volume Projection</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analyticsData?.predictiveInsights.logVolumeProjection || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="actual" stroke="#0088FE" name="Actual" strokeWidth={2} />
            <Line type="monotone" dataKey="predicted" stroke="#FF8042" strokeDasharray="5 5" name="Predicted" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Anomaly Detection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Anomaly Detection</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart data={analyticsData?.predictiveInsights.anomalyScores || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Scatter dataKey="score" fill="#8884d8" />
              <Line type="monotone" dataKey="threshold" stroke="#ff0000" strokeDasharray="3 3" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Capacity Analysis */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Capacity Analysis</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-300">Current Utilization</span>
                <span className="font-medium">{analyticsData?.predictiveInsights.capacityAnalysis.currentUtilization}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" 
                     style={{width: `${analyticsData?.predictiveInsights.capacityAnalysis.currentUtilization}%`}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-300">Projected Peak</span>
                <span className="font-medium">{analyticsData?.predictiveInsights.capacityAnalysis.projectedPeak}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-orange-500 h-2 rounded-full" 
                     style={{width: `${analyticsData?.predictiveInsights.capacityAnalysis.projectedPeak}%`}}></div>
              </div>
            </div>
            <div className="mt-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Recommendations:</h4>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                {analyticsData?.predictiveInsights.capacityAnalysis.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPatternView = () => (
    <div className="space-y-6">
      {/* Sequence Patterns */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Common Sequence Patterns</h3>
        <div className="space-y-3">
          {analyticsData?.patternAnalysis.sequencePatterns.map((pattern, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">{pattern.pattern}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Avg Duration: {pattern.avgDuration}ms</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-blue-600 dark:text-blue-400">{pattern.frequency}</div>
                <div className="text-xs text-gray-500">occurrences</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Seasonal Trends */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Seasonal Trends</h3>
          <div className="space-y-3">
            {analyticsData?.patternAnalysis.seasonalTrends.map((trend, index) => (
              <div key={index} className="p-3 border border-gray-200 dark:border-gray-600 rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">{trend.period}</span>
                  <span className="text-sm font-bold text-blue-600">{(trend.strength * 100).toFixed(0)}%</span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{trend.pattern}</div>
                <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                  <div className="bg-blue-600 h-1 rounded-full" style={{width: `${trend.strength * 100}%`}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emerging Patterns */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Emerging Patterns</h3>
          <div className="space-y-3">
            {analyticsData?.patternAnalysis.emergingPatterns.map((pattern, index) => (
              <div key={index} className="p-3 border border-gray-200 dark:border-gray-600 rounded">
                <div className="font-medium text-gray-900 dark:text-white mb-1">{pattern.pattern}</div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Growth: {(pattern.growthRate * 100).toFixed(1)}%</span>
                  <span className="text-gray-600 dark:text-gray-400">Significance: {(pattern.significance * 100).toFixed(0)}%</span>
                </div>
                <div className="flex space-x-2 mt-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-1">
                    <div className="bg-green-500 h-1 rounded-full" style={{width: `${pattern.growthRate * 100}%`}}></div>
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full h-1">
                    <div className="bg-purple-500 h-1 rounded-full" style={{width: `${pattern.significance * 100}%`}}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderLogsTable = () => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Logs (Manual Pull, 25 per page)</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Timestamp</th>
              <th className="px-2 py-1">Level</th>
              <th className="px-2 py-1">Source</th>
              <th className="px-2 py-1">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !logsLoading && (
              <tr><td colSpan={4} className="text-center py-2 text-gray-500">No logs to display</td></tr>
            )}
            {logs.map((log, idx) => (
              <tr key={log.id || idx}>
                <td className="px-2 py-1 whitespace-nowrap">{log.timestamp}</td>
                <td className="px-2 py-1">{log.level}</td>
                <td className="px-2 py-1">{log.source}</td>
                <td className="px-2 py-1 max-w-xs truncate" title={log.message}>{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4">
        <button
          className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          onClick={() => { if (logPage > 0) { setLogPage(logPage - 1); fetchPaginatedLogs(logPage - 1); } }}
          disabled={logPage === 0 || logsLoading}
        >
          Previous
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-300">Page {logPage + 1}</span>
        <button
          className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          onClick={() => { setLogPage(logPage + 1); fetchPaginatedLogs(logPage + 1); }}
          disabled={logs.length < LOGS_PAGE_SIZE || logsLoading}
        >
          Next
        </button>
      </div>
      {logsLoading && <div className="mt-2 text-blue-600">Loading logs...</div>}
    </div>
  );

  const killAllIntervals = () => {
    for (let i = 1; i < 1000000; i++) {
      clearInterval(i);
    }
    if (intervalRef.current) intervalRef.current = null;
    if (typeof window !== 'undefined') window.__enhancedLogIntervalId = null;
    console.log('All intervals killed by debug button');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-300">Loading enhanced analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Debug Panel */}
        <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded text-xs flex items-center gap-4">
          <div>
            <strong>Debug:</strong> mode = {mode}, intervalRef.current = {String(intervalRef.current)}, window.__enhancedLogIntervalId = {String(typeof window !== 'undefined' ? window.__enhancedLogIntervalId : 'N/A')}
          </div>
          <button className="ml-2 px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700" onClick={killAllIntervals}>
            Kill All Intervals
          </button>
        </div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Enhanced Analytics</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Advanced insights and predictive analytics for your AI agents</p>
          
          {error && (
            <div className="mt-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
              {error}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Range:</label>
            <select 
              value={selectedTimeRange} 
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mode:</label>
            {mode === 'live' ? (
              <>
                <button
                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setMode('manual')}
                  disabled={modeSwitching}
                >
                  Stop
                </button>
                <span className="ml-2 px-2 py-1 rounded bg-green-200 text-green-800 text-xs">Live</span>
              </>
            ) : (
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white"
                disabled
              >
                Manual Pull
              </button>
            )}
            {mode === 'manual' && (
              <button
                className="ml-2 px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                onClick={fetchEnhancedAnalytics}
                disabled={loading}
              >
                Refresh
              </button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">View:</label>
            <div className="flex space-x-1">
              {[
                { key: 'performance', label: 'Performance' },
                { key: 'behavior', label: 'Behavior' },
                { key: 'predictive', label: 'Predictive' },
                { key: 'patterns', label: 'Patterns' }
              ].map((view) => (
                <button
                  key={view.key}
                  onClick={() => setSelectedView(view.key)}
                  className={`px-3 py-1 text-sm rounded ${
                    selectedView === view.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {selectedView === 'performance' && renderPerformanceView()}
          {selectedView === 'behavior' && renderBehaviorView()}
          {selectedView === 'predictive' && renderPredictiveView()}
          {selectedView === 'patterns' && renderPatternView()}
          {/* Manual Pull Logs Table */}
          {mode === 'manual' && (
            <div>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 mt-4"
                onClick={() => fetchPaginatedLogs(logPage)}
                disabled={logsLoading}
              >
                Fetch Logs
              </button>
              {renderLogsTable()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 