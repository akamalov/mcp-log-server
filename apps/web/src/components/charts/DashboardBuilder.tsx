'use client';

import React, { useState, useCallback, useMemo } from 'react';

import { 
  Plus, X, Settings, Save, RotateCcw, Layout, BarChart3, PieChart, 
  TrendingUp, Activity, Grid, Maximize2, Minimize2, Copy, Trash2 
} from 'lucide-react';
import InteractiveAnalyticsChart from './InteractiveAnalyticsChart';

interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'alert';
  chartType?: 'line' | 'area' | 'bar' | 'pie' | 'treemap' | 'scatter' | 'radar';
  title: string;
  dataSource: string;
  filters: Record<string, any>;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
}

interface DashboardLayout {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  layout: 'grid' | 'masonry' | 'flex';
  created: Date;
  modified: Date;
}

interface DashboardBuilderProps {
  onSave?: (dashboard: DashboardLayout) => void;
  onLoad?: (dashboardId: string) => Promise<DashboardLayout>;
  initialDashboard?: DashboardLayout;
}

const WIDGET_TEMPLATES = [
  { 
    type: 'chart', 
    chartType: 'line', 
    title: 'Log Volume Over Time', 
    icon: TrendingUp,
    dataSource: 'logs',
    defaultSize: { w: 6, h: 4 }
  },
  { 
    type: 'chart', 
    chartType: 'pie', 
    title: 'Log Levels Distribution', 
    icon: PieChart,
    dataSource: 'analytics',
    defaultSize: { w: 4, h: 4 }
  },
  { 
    type: 'chart', 
    chartType: 'bar', 
    title: 'Agent Activity', 
    icon: BarChart3,
    dataSource: 'agents',
    defaultSize: { w: 6, h: 3 }
  },
  { 
    type: 'metric', 
    title: 'Key Metrics', 
    icon: Activity,
    dataSource: 'summary',
    defaultSize: { w: 3, h: 2 }
  },
  { 
    type: 'table', 
    title: 'Recent Patterns', 
    icon: Grid,
    dataSource: 'patterns',
    defaultSize: { w: 12, h: 4 }
  },
  { 
    type: 'alert', 
    title: 'Active Alerts', 
    icon: Activity,
    dataSource: 'anomalies',
    defaultSize: { w: 4, h: 3 }
  }
];

export default function DashboardBuilder({ 
  onSave, 
  onLoad, 
  initialDashboard 
}: DashboardBuilderProps) {
  const [dashboard, setDashboard] = useState<DashboardLayout>(
    initialDashboard || {
      id: `dashboard-${Date.now()}`,
      name: 'Custom Analytics Dashboard',
      widgets: [],
      layout: 'grid',
      created: new Date(),
      modified: new Date()
    }
  );

  const [isEditing, setIsEditing] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [gridSize, setGridSize] = useState({ cols: 12, rows: 8 });

  // Mock data for charts - in production, this would come from props or API
  const [chartData] = useState([
    { timestamp: '2024-01-01T00:00:00Z', count: 100, level: 'info', agent: 'agent-1' },
    { timestamp: '2024-01-01T01:00:00Z', count: 150, level: 'warn', agent: 'agent-2' },
    { timestamp: '2024-01-01T02:00:00Z', count: 200, level: 'error', agent: 'agent-1' },
    { timestamp: '2024-01-01T03:00:00Z', count: 120, level: 'info', agent: 'agent-3' },
  ]);

  const addWidget = useCallback((template: any) => {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type: template.type,
      chartType: template.chartType,
      title: template.title,
      dataSource: template.dataSource,
      filters: {},
      position: {
        x: 0,
        y: 0,
        w: template.defaultSize.w,
        h: template.defaultSize.h
      },
      config: {}
    };

    // Find available position
    const occupiedPositions = dashboard.widgets.map(w => w.position);
    let x = 0, y = 0;
    let positionFound = false;

    for (let row = 0; row < gridSize.rows && !positionFound; row++) {
      for (let col = 0; col <= gridSize.cols - newWidget.position.w && !positionFound; col++) {
        const isOverlapping = occupiedPositions.some(pos => 
          col < pos.x + pos.w && col + newWidget.position.w > pos.x &&
          row < pos.y + pos.h && row + newWidget.position.h > pos.y
        );
        
        if (!isOverlapping) {
          x = col;
          y = row;
          positionFound = true;
        }
      }
    }

    newWidget.position.x = x;
    newWidget.position.y = y;

    setDashboard(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
      modified: new Date()
    }));

    setShowWidgetPicker(false);
  }, [dashboard.widgets, gridSize]);

  const removeWidget = useCallback((widgetId: string) => {
    setDashboard(prev => ({
      ...prev,
      widgets: prev.widgets.filter(w => w.id !== widgetId),
      modified: new Date()
    }));
    setSelectedWidget(null);
  }, []);

  const updateWidget = useCallback((widgetId: string, updates: Partial<DashboardWidget>) => {
    setDashboard(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => 
        w.id === widgetId ? { ...w, ...updates } : w
      ),
      modified: new Date()
    }));
  }, []);

  const duplicateWidget = useCallback((widgetId: string) => {
    const widget = dashboard.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    const newWidget: DashboardWidget = {
      ...widget,
      id: `widget-${Date.now()}`,
      title: `${widget.title} (Copy)`,
      position: {
        ...widget.position,
        x: Math.min(widget.position.x + 1, gridSize.cols - widget.position.w),
        y: widget.position.y + 1
      }
    };

    setDashboard(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
      modified: new Date()
    }));
  }, [dashboard.widgets, gridSize]);

  // Drag and drop functionality removed for simplicity

  const saveDashboard = useCallback(() => {
    if (onSave) {
      onSave(dashboard);
    }
    setIsEditing(false);
  }, [dashboard, onSave]);

  const resetDashboard = useCallback(() => {
    setDashboard({
      id: `dashboard-${Date.now()}`,
      name: 'Custom Analytics Dashboard',
      widgets: [],
      layout: 'grid',
      created: new Date(),
      modified: new Date()
    });
  }, []);

  const renderWidget = (widget: DashboardWidget) => {
    const gridStyle = {
      gridColumn: `span ${widget.position.w}`,
      gridRow: `span ${widget.position.h}`,
      minHeight: `${widget.position.h * 60}px`
    };

    switch (widget.type) {
      case 'chart':
        return (
          <div 
            key={widget.id}
            style={gridStyle}
            className={`relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            <InteractiveAnalyticsChart
              data={chartData}
              title={widget.title}
              type={widget.chartType || 'line'}
              height={widget.position.h * 60 - 40}
              showControls={false}
            />
            {isEditing && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateWidget(widget.id); }}
                    className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    title="Duplicate"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}
                    className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'metric':
        return (
          <div 
            key={widget.id}
            style={gridStyle}
            className={`bg-white rounded-lg shadow p-4 relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            <h3 className="text-lg font-semibold mb-4">{widget.title}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">1,247</p>
                <p className="text-sm text-gray-600">Total Logs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">98.5%</p>
                <p className="text-sm text-gray-600">Uptime</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">2.1%</p>
                <p className="text-sm text-gray-600">Error Rate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">3</p>
                <p className="text-sm text-gray-600">Active Agents</p>
              </div>
            </div>
            {isEditing && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateWidget(widget.id); }}
                    className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}
                    className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'alert':
        return (
          <div 
            key={widget.id}
            style={gridStyle}
            className={`bg-white rounded-lg shadow p-4 relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            <h3 className="text-lg font-semibold mb-4">{widget.title}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-sm">High error rate detected</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-sm">Agent response time increased</span>
              </div>
            </div>
            {isEditing && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateWidget(widget.id); }}
                    className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}
                    className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return (
          <div 
            key={widget.id}
            style={gridStyle}
            className="bg-gray-100 rounded-lg p-4 flex items-center justify-center"
          >
            <p>Unknown widget type: {widget.type}</p>
          </div>
        );
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Layout className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Dashboard Builder</h1>
              <p className="text-sm text-gray-600">Create and customize your analytics dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Edit Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowWidgetPicker(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Widget
                </button>
                <button
                  onClick={saveDashboard}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={resetDashboard}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="p-6">
        {dashboard.widgets.length === 0 ? (
          <div className="text-center py-12">
            <Layout className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 mb-2">No widgets yet</h2>
            <p className="text-gray-500 mb-6">Start building your dashboard by adding widgets</p>
            <button
              onClick={() => setShowWidgetPicker(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              Add Your First Widget
            </button>
          </div>
        ) : (
          <div 
            className="grid gap-4"
            style={{ 
              gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`,
              gridAutoRows: '60px'
            }}
          >
            {dashboard.widgets.map(renderWidget)}
          </div>
        )}
      </div>

      {/* Widget Picker Modal */}
      {showWidgetPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full m-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add Widget</h2>
              <button
                onClick={() => setShowWidgetPicker(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {WIDGET_TEMPLATES.map((template, index) => (
                <button
                  key={index}
                  onClick={() => addWidget(template)}
                  className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <template.icon className="w-5 h-5 text-blue-600" />
                    <h3 className="font-medium">{template.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600">
                    {template.type === 'chart' ? `${template.chartType} chart` : template.type} widget
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Size: {template.defaultSize.w}x{template.defaultSize.h}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
