'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import { 
  Plus, X, Settings, Save, RotateCcw, Layout, BarChart3, PieChart, 
  TrendingUp, Activity, Grid, Maximize2, Minimize2, Copy, Trash2, GripVertical 
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
  const [dashboard, setDashboard] = useState<DashboardLayout>({
    id: `dashboard-${Date.now()}`,
    name: 'Custom Analytics Dashboard',
    widgets: [],
    layout: 'grid',
    created: new Date(),
    modified: new Date()
  });

  const [isEditing, setIsEditing] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [gridSize, setGridSize] = useState({ cols: 12, rows: 12 });
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load initial dashboard when prop changes
  useEffect(() => {
    if (initialDashboard) {
      setDashboard(initialDashboard);
    }
  }, [initialDashboard]);

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

    // Smart grid positioning - place widgets side by side when possible
    const existingWidgets = dashboard.widgets;
    
    if (existingWidgets.length === 0) {
      // First widget goes at top-left
      newWidget.position.x = 0;
      newWidget.position.y = 0;
    } else {
      // Find the best position for the new widget
      const bestPosition = findBestPosition(existingWidgets, newWidget.position.w, newWidget.position.h);
      newWidget.position.x = bestPosition.x;
      newWidget.position.y = bestPosition.y;
    }

    const updatedDashboard = {
      ...dashboard,
      widgets: [...dashboard.widgets, newWidget],
      modified: new Date()
    };

    setDashboard(updatedDashboard);
    
    // Auto-save when widgets are added
    if (onSave) {
      onSave(updatedDashboard);
    }

    setShowWidgetPicker(false);
  }, [dashboard.widgets, gridSize]);

  // Function to find the best position for a new widget
  const findBestPosition = useCallback((existingWidgets: DashboardWidget[], width: number, height: number) => {
    const maxCols = 12;
    const maxRows = 20; // Allow for expansion
    
    // Create a grid to track occupied spaces
    const grid: boolean[][] = Array(maxRows).fill(null).map(() => Array(maxCols).fill(false));
    
    // Mark occupied spaces
    existingWidgets.forEach(widget => {
      for (let y = widget.position.y; y < widget.position.y + widget.position.h; y++) {
        for (let x = widget.position.x; x < widget.position.x + widget.position.w; x++) {
          if (y < maxRows && x < maxCols) {
            grid[y][x] = true;
          }
        }
      }
    });
    
    // Find the first available position that fits the widget
    for (let y = 0; y <= maxRows - height; y++) {
      for (let x = 0; x <= maxCols - width; x++) {
        let canPlace = true;
        
        // Check if the entire widget area is free
        for (let dy = 0; dy < height && canPlace; dy++) {
          for (let dx = 0; dx < width && canPlace; dx++) {
            if (grid[y + dy][x + dx]) {
              canPlace = false;
            }
          }
        }
        
        if (canPlace) {
          return { x, y };
        }
      }
    }
    
    // If no position found, place at the bottom
    const maxY = existingWidgets.length > 0 
      ? Math.max(...existingWidgets.map(w => w.position.y + w.position.h))
      : 0;
    return { x: 0, y: maxY };
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    setDraggedWidget(widgetId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', widgetId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedWidget(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (!draggedWidget) return;

    const draggedIndex = dashboard.widgets.findIndex(w => w.id === draggedWidget);
    if (draggedIndex === -1 || draggedIndex === dropIndex) return;

    const newWidgets = [...dashboard.widgets];
    const [draggedItem] = newWidgets.splice(draggedIndex, 1);
    
    // Recalculate positions for all widgets after reordering
    const reorderedWidgets = [...newWidgets];
    reorderedWidgets.splice(dropIndex, 0, draggedItem);
    
    // Recalculate positions for the new order
    const repositionedWidgets = reorderedWidgets.map((widget, index) => {
      if (index === 0) {
        return { ...widget, position: { ...widget.position, x: 0, y: 0 } };
      } else {
        const prevWidgets = reorderedWidgets.slice(0, index);
        const newPos = findBestPosition(prevWidgets, widget.position.w, widget.position.h);
        return { ...widget, position: { ...widget.position, x: newPos.x, y: newPos.y } };
      }
    });

    const updatedDashboard = {
      ...dashboard,
      widgets: repositionedWidgets,
      modified: new Date()
    };

    setDashboard(updatedDashboard);
    
    // Auto-save when widgets are reordered
    if (onSave) {
      onSave(updatedDashboard);
    }

    setDraggedWidget(null);
    setDragOverIndex(null);
  }, [draggedWidget, dashboard.widgets, findBestPosition]);

  const removeWidget = useCallback((widgetId: string) => {
    const updatedDashboard = {
      ...dashboard,
      widgets: dashboard.widgets.filter(w => w.id !== widgetId),
      modified: new Date()
    };

    setDashboard(updatedDashboard);
    
    // Auto-save when widgets are removed
    if (onSave) {
      onSave(updatedDashboard);
    }
    
    setSelectedWidget(null);
  }, [dashboard, onSave]);

  const updateWidget = useCallback((widgetId: string, updates: Partial<DashboardWidget>) => {
    const updatedDashboard = {
      ...dashboard,
      widgets: dashboard.widgets.map(w => 
        w.id === widgetId ? { ...w, ...updates } : w
      ),
      modified: new Date()
    };

    setDashboard(updatedDashboard);
    
    // Auto-save when widgets are updated
    if (onSave) {
      onSave(updatedDashboard);
    }
  }, [dashboard, onSave]);

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

    const updatedDashboard = {
      ...dashboard,
      widgets: [...dashboard.widgets, newWidget],
      modified: new Date()
    };

    setDashboard(updatedDashboard);
    
    // Auto-save when widgets are duplicated
    if (onSave) {
      onSave(updatedDashboard);
    }
  }, [dashboard.widgets, gridSize, dashboard, onSave]);

  // Drag and drop functionality removed for simplicity

  const saveDashboard = useCallback(() => {
    const dashboardToSave = {
      ...dashboard,
      modified: new Date()
    };
    
    if (onSave) {
      onSave(dashboardToSave);
    }
    
    // Update local state with saved dashboard
    setDashboard(dashboardToSave);
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
    setSelectedWidget(null);
  }, []);

  const optimizeLayout = useCallback(() => {
    const optimizedWidgets = dashboard.widgets.map((widget, index) => {
      if (index === 0) {
        return { ...widget, position: { ...widget.position, x: 0, y: 0 } };
      } else {
        const prevWidgets = dashboard.widgets.slice(0, index);
        const newPos = findBestPosition(prevWidgets, widget.position.w, widget.position.h);
        return { ...widget, position: { ...widget.position, x: newPos.x, y: newPos.y } };
      }
    });

    const updatedDashboard = {
      ...dashboard,
      widgets: optimizedWidgets,
      modified: new Date()
    };

    setDashboard(updatedDashboard);
    
    // Auto-save when layout is optimized
    if (onSave) {
      onSave(updatedDashboard);
    }
  }, [dashboard.widgets, findBestPosition, dashboard, onSave]);

  const renderWidget = (widget: DashboardWidget, index: number) => {
    // CSS Grid will handle sizing based on gridColumn and gridRow spans
    const containerStyle = {
      minHeight: `${widget.position.h * 60}px`
    };

    switch (widget.type) {
      case 'chart':
        return (
          <div 
            key={widget.id}
            style={containerStyle}
            className={`relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''} bg-gray-800 rounded-lg shadow`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            {isEditing && (
              <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 bg-gray-800 dark:bg-gray-700 rounded px-2 py-1">
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                  <span className="text-xs text-gray-300">Drag to move</span>
                </div>
              </div>
            )}
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
            style={containerStyle}
            className={`bg-gray-800 rounded-lg shadow p-4 relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            {isEditing && (
              <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 bg-gray-800 dark:bg-gray-700 rounded px-2 py-1">
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                  <span className="text-xs text-gray-300">Drag to move</span>
                </div>
              </div>
            )}
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{widget.title}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">1,247</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Total Logs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">98.5%</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Uptime</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">2.1%</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Error Rate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">3</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Active Agents</p>
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
            style={containerStyle}
            className={`bg-gray-800 rounded-lg shadow p-4 relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            {isEditing && (
              <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 bg-gray-800 dark:bg-gray-700 rounded px-2 py-1">
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                  <span className="text-xs text-gray-300">Drag to move</span>
                </div>
              </div>
            )}
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{widget.title}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-sm text-gray-700 dark:text-gray-200">High error rate detected</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-sm text-gray-700 dark:text-gray-200">Agent response time increased</span>
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

      case 'table':
        return (
          <div 
            key={widget.id}
            style={containerStyle}
            className={`bg-gray-800 rounded-lg shadow p-4 relative group ${selectedWidget === widget.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedWidget(widget.id)}
          >
            {isEditing && (
              <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 bg-gray-800 dark:bg-gray-700 rounded px-2 py-1">
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                  <span className="text-xs text-gray-300">Drag to move</span>
                </div>
              </div>
            )}
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{widget.title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-600">
                    <th className="text-left py-2 text-gray-700 dark:text-gray-300">Pattern</th>
                    <th className="text-left py-2 text-gray-700 dark:text-gray-300">Count</th>
                    <th className="text-left py-2 text-gray-700 dark:text-gray-300">Severity</th>
                    <th className="text-left py-2 text-gray-700 dark:text-gray-300">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-gray-100">Connection timeout</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">23</td>
                    <td className="py-2">
                      <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded text-xs">High</span>
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">2 min ago</td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-gray-100">Rate limit exceeded</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">15</td>
                    <td className="py-2">
                      <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded text-xs">Medium</span>
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">5 min ago</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-900 dark:text-gray-100">Memory usage warning</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">8</td>
                    <td className="py-2">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs">Low</span>
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">10 min ago</td>
                  </tr>
                </tbody>
              </table>
            </div>
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

      default:
        return (
          <div 
            key={widget.id}
            style={containerStyle}
            className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-center"
          >
            <p className="text-gray-600 dark:text-gray-300">Unknown widget type: {widget.type}</p>
          </div>
        );
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Layout className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Builder</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Create and customize your analytics dashboard</p>
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
                  onClick={optimizeLayout}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                >
                  <Grid className="w-4 h-4" />
                  Optimize Layout
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
      </header>

      {/* Dashboard Content */}
      <div>
        {dashboard.widgets.length === 0 ? (
          <div className="text-center py-12">
            <Layout className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">No widgets yet</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Start building your dashboard by adding widgets</p>
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
              gridTemplateColumns: `repeat(12, 1fr)`,
              gridAutoRows: 'minmax(60px, auto)'
            }}
          >
            {dashboard.widgets.map((widget, index) => (
              <div
                key={widget.id}
                draggable={isEditing}
                onDragStart={(e) => handleDragStart(e, widget.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                className={`
                  ${draggedWidget === widget.id ? 'opacity-50' : ''}
                  ${dragOverIndex === index ? 'ring-2 ring-blue-500' : ''}
                  ${isEditing ? 'cursor-move' : ''}
                `}
                style={{
                  gridColumn: `span ${widget.position.w}`,
                  gridRow: `span ${widget.position.h}`,
                  minHeight: `${widget.position.h * 60}px`
                }}
              >
                {renderWidget(widget, index)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Widget Picker Modal */}
      {showWidgetPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full m-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add Widget</h2>
              <button
                onClick={() => setShowWidgetPicker(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {WIDGET_TEMPLATES.map((template, index) => (
                <button
                  key={index}
                  onClick={() => addWidget(template)}
                  className="p-4 border dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    {React.createElement(template.icon, { className: "w-5 h-5 text-blue-600" })}
                    <h3 className="font-medium text-gray-900 dark:text-white">{template.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {template.type === 'chart' ? `${template.chartType} chart` : template.type} widget
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
