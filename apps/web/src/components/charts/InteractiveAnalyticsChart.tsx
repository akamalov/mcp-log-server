import React, { useState, useCallback, useMemo } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  TreeMap, ScatterChart, Scatter, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Activity, ZoomIn, Download, Settings } from 'lucide-react';

interface ChartData {
  timestamp: string;
  count: number;
  level: string;
  agent: string;
  pattern?: string;
  severity?: string;
  metadata?: Record<string, any>;
}

interface DrillDownData {
  level: 'overview' | 'agent' | 'pattern' | 'timeframe';
  filters: Record<string, any>;
  title: string;
  breadcrumb: string[];
}

interface InteractiveAnalyticsChartProps {
  data: ChartData[];
  title: string;
  type: 'line' | 'area' | 'bar' | 'pie' | 'treemap' | 'scatter' | 'radar' | 'heatmap';
  height?: number;
  showControls?: boolean;
  onDrillDown?: (data: DrillDownData) => void;
  onExport?: (data: any) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C'];

export default function InteractiveAnalyticsChart({
  data,
  title,
  type,
  height = 400,
  showControls = true,
  onDrillDown,
  onExport
}: InteractiveAnalyticsChartProps) {
  const [drillDownState, setDrillDownState] = useState<DrillDownData>({
    level: 'overview',
    filters: {},
    title: title,
    breadcrumb: [title]
  });

  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('24h');
  const [selectedMetric, setSelectedMetric] = useState<string>('count');

  // Process data based on drill-down state and filters
  const processedData = useMemo(() => {
    let filtered = data;

    // Apply filters from drill-down state
    Object.entries(drillDownState.filters).forEach(([key, value]) => {
      filtered = filtered.filter(item => item[key as keyof ChartData] === value);
    });

    // Process based on chart type
    switch (type) {
      case 'pie':
        return processPieData(filtered);
      case 'treemap':
        return processTreeMapData(filtered);
      case 'scatter':
        return processScatterData(filtered);
      case 'radar':
        return processRadarData(filtered);
      case 'heatmap':
        return processHeatmapData(filtered);
      default:
        return processTimeSeriesData(filtered);
    }
  }, [data, drillDownState, type]);

  const processPieData = (data: ChartData[]) => {
    const grouped = data.reduce((acc, item) => {
      const key = item.level || 'unknown';
      acc[key] = (acc[key] || 0) + item.count;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({
      name,
      value,
      percentage: ((value / data.reduce((sum, item) => sum + item.count, 0)) * 100).toFixed(1)
    }));
  };

  const processTreeMapData = (data: ChartData[]) => {
    const grouped = data.reduce((acc, item) => {
      const key = `${item.agent}-${item.level}`;
      acc[key] = (acc[key] || 0) + item.count;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, size]) => ({
      name,
      size,
      agent: name.split('-')[0],
      level: name.split('-')[1]
    }));
  };

  const processScatterData = (data: ChartData[]) => {
    return data.map(item => ({
      x: new Date(item.timestamp).getTime(),
      y: item.count,
      z: item.level === 'error' ? 100 : item.level === 'warn' ? 50 : 25,
      level: item.level,
      agent: item.agent
    }));
  };

  const processRadarData = (data: ChartData[]) => {
    const agents = [...new Set(data.map(item => item.agent))];
    const levels = ['info', 'warn', 'error', 'debug'];
    
    return agents.map(agent => {
      const agentData = data.filter(item => item.agent === agent);
      const result: any = { agent };
      
      levels.forEach(level => {
        result[level] = agentData
          .filter(item => item.level === level)
          .reduce((sum, item) => sum + item.count, 0);
      });
      
      return result;
    });
  };

  const processHeatmapData = (data: ChartData[]) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const agents = [...new Set(data.map(item => item.agent))];
    
    return hours.map(hour => {
      const result: any = { hour };
      agents.forEach(agent => {
        result[agent] = data
          .filter(item => {
            const itemHour = new Date(item.timestamp).getHours();
            return itemHour === hour && item.agent === agent;
          })
          .reduce((sum, item) => sum + item.count, 0);
      });
      return result;
    });
  };

  const processTimeSeriesData = (data: ChartData[]) => {
    const grouped = data.reduce((acc, item) => {
      const key = item.timestamp.split('T')[0]; // Group by date
      if (!acc[key]) acc[key] = { timestamp: key, count: 0, levels: {} };
      acc[key].count += item.count;
      
      const levelKey = item.level || 'unknown';
      acc[key].levels[levelKey] = (acc[key].levels[levelKey] || 0) + item.count;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).sort((a: any, b: any) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  };

  const handleChartClick = useCallback((data: any) => {
    if (!onDrillDown) return;

    // Determine drill-down action based on chart type and clicked data
    let newDrillDown: DrillDownData;

    switch (type) {
      case 'pie':
        newDrillDown = {
          level: 'agent',
          filters: { level: data.name },
          title: `${data.name} Logs by Agent`,
          breadcrumb: [...drillDownState.breadcrumb, data.name]
        };
        break;
      
      case 'bar':
        newDrillDown = {
          level: 'pattern',
          filters: { timestamp: data.timestamp },
          title: `Patterns on ${data.timestamp}`,
          breadcrumb: [...drillDownState.breadcrumb, data.timestamp]
        };
        break;
      
      default:
        newDrillDown = {
          level: 'timeframe',
          filters: { timestamp: data.timestamp },
          title: `Details for ${data.timestamp}`,
          breadcrumb: [...drillDownState.breadcrumb, data.timestamp]
        };
    }

    setDrillDownState(newDrillDown);
    onDrillDown(newDrillDown);
  }, [type, drillDownState, onDrillDown]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const newBreadcrumb = drillDownState.breadcrumb.slice(0, index + 1);
    setDrillDownState({
      level: index === 0 ? 'overview' : 'agent',
      filters: {},
      title: newBreadcrumb[newBreadcrumb.length - 1],
      breadcrumb: newBreadcrumb
    });
  }, [drillDownState]);

  const renderChart = () => {
    const commonProps = {
      width: '100%',
      height,
      data: processedData,
      onClick: handleChartClick
    };

    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer {...commonProps}>
            <LineChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer {...commonProps}>
            <AreaChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="count" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer {...commonProps}>
            <BarChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer {...commonProps}>
            <PieChart>
              <Pie
                data={processedData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name} (${percentage}%)`}
                outerRadius={Math.min(height * 0.3, 120)}
                fill="#8884d8"
                dataKey="value"
              >
                {processedData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer {...commonProps}>
            <ScatterChart>
              <CartesianGrid />
              <XAxis type="number" dataKey="x" name="time" />
              <YAxis type="number" dataKey="y" name="count" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Logs" data={processedData} fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'radar':
        return (
          <ResponsiveContainer {...commonProps}>
            <RadarChart data={processedData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="agent" />
              <PolarRadiusAxis />
              <Radar name="Info" dataKey="info" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
              <Radar name="Warn" dataKey="warn" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
              <Radar name="Error" dataKey="error" stroke="#ffc658" fill="#ffc658" fillOpacity={0.6} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        );

      default:
        return <div>Unsupported chart type</div>;
    }
  };

  const getMetricSummary = () => {
    const totalCount = processedData.reduce((sum: number, item: any) => sum + (item.count || item.value || 0), 0);
    const avgCount = totalCount / processedData.length;
    const trend = processedData.length > 1 ? 
      (processedData[processedData.length - 1]?.count || 0) - (processedData[0]?.count || 0) : 0;
    
    return { totalCount, avgCount, trend };
  };

  const { totalCount, avgCount, trend } = getMetricSummary();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-900">{drillDownState.title}</h2>
          {showControls && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExport && onExport(processedData)}
                className="p-2 text-gray-600 hover:text-blue-600 rounded-lg hover:bg-gray-100"
                title="Export Chart Data"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="p-2 text-gray-600 hover:text-blue-600 rounded-lg hover:bg-gray-100"
                title="Chart Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        {/* Metric Summary */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span className="text-gray-600">Total:</span>
            <span className="font-bold text-gray-900">{totalCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Avg:</span>
            <span className="font-bold text-gray-900">{avgCount.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-2">
            {trend > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-600" />
            ) : trend < 0 ? (
              <TrendingDown className="w-4 h-4 text-red-600" />
            ) : (
              <Activity className="w-4 h-4 text-gray-600" />
            )}
            <span className="text-gray-600">Trend:</span>
            <span className={`font-bold ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {trend > 0 ? '+' : ''}{trend}
            </span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      {drillDownState.breadcrumb.length > 1 && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          {drillDownState.breadcrumb.map((crumb, index) => (
            <React.Fragment key={index}>
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className={`${index === drillDownState.breadcrumb.length - 1 
                  ? 'text-blue-600 font-medium' 
                  : 'text-gray-500 hover:text-blue-600'}`}
              >
                {crumb}
              </button>
              {index < drillDownState.breadcrumb.length - 1 && (
                <span className="text-gray-300">/</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="mb-4">
        {renderChart()}
      </div>

      {/* Data Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-4 border-t">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Data Points</h4>
          <p className="text-2xl font-bold text-blue-600">{processedData.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium text-green-900 mb-2">Peak Value</h4>
          <p className="text-2xl font-bold text-green-600">
            {Math.max(...processedData.map((item: any) => item.count || item.value || 0))}
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <h4 className="font-medium text-purple-900 mb-2">Time Range</h4>
          <p className="text-sm font-medium text-purple-600">
            {processedData.length > 0 ? `${processedData.length} periods` : 'No data'}
          </p>
        </div>
      </div>
    </div>
  );
}
