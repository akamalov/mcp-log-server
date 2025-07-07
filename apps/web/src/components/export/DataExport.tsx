'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface ExportOptions {
  format: 'csv' | 'json' | 'pdf' | 'excel';
  dataType: 'logs' | 'analytics' | 'patterns' | 'health' | 'all';
  timeRange: {
    start: Date;
    end: Date;
  };
  includeMetadata: boolean;
  filterByLevel?: string[];
  filterByAgent?: string[];
}

interface ExportProgress {
  isExporting: boolean;
  stage: string;
  progress: number;
  total: number;
}

export default function DataExport() {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'csv',
    dataType: 'logs',
    timeRange: {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: new Date()
    },
    includeMetadata: true,
    filterByLevel: [],
    filterByAgent: []
  });

  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    isExporting: false,
    stage: '',
    progress: 0,
    total: 0
  });

  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [availableLevels] = useState<string[]>(['info', 'warn', 'error', 'debug']);

  // Fetch available agents on component mount
  useEffect(() => {
    fetch('http://localhost:3005/api/agents')
      .then(res => res.json())
      .then(data => setAvailableAgents(data.agents?.map((a: any) => a.id) || []))
      .catch(console.error);
  }, []);

  const handleExport = useCallback(async () => {
    setExportProgress({
      isExporting: true,
      stage: 'Preparing export...',
      progress: 0,
      total: 100
    });

    try {
      // Step 1: Fetch data based on selected options
      setExportProgress(prev => ({ ...prev, stage: 'Fetching data...', progress: 20 }));
      const data = await fetchExportData(options);
      
      // Step 2: Process data based on format
      setExportProgress(prev => ({ ...prev, stage: 'Processing data...', progress: 40 }));
      const processedData = await processDataForExport(data, options);
      
      // Step 3: Generate file
      setExportProgress(prev => ({ ...prev, stage: 'Generating file...', progress: 60 }));
      const fileContent = await generateExportFile(processedData, options);
      
      // Step 4: Download file
      setExportProgress(prev => ({ ...prev, stage: 'Downloading...', progress: 80 }));
      await downloadFile(fileContent, options);
      
      setExportProgress(prev => ({ ...prev, stage: 'Complete!', progress: 100 }));
      
      // Reset after delay
      setTimeout(() => {
        setExportProgress({ isExporting: false, stage: '', progress: 0, total: 0 });
      }, 2000);
      
    } catch (error) {
      console.error('Export failed:', error);
      setExportProgress({ isExporting: false, stage: 'Export failed', progress: 0, total: 0 });
    }
  }, [options]);

  const fetchExportData = async (options: ExportOptions): Promise<any> => {
    const baseUrl = 'http://localhost:3005/api';
    const params = new URLSearchParams({
      start: options.timeRange.start.toISOString(),
      end: options.timeRange.end.toISOString()
    });

    switch (options.dataType) {
      case 'logs':
        const response = await fetch(`${baseUrl}/logs?${params}`);
        return await response.json();
      
      case 'analytics':
        const analyticsResponse = await fetch(`${baseUrl}/analytics/summary?${params}`);
        return await analyticsResponse.json();
      
      case 'patterns':
        const patternsResponse = await fetch(`${baseUrl}/analytics/patterns?${params}`);
        return await patternsResponse.json();
      
      case 'health':
        const healthResponse = await fetch(`${baseUrl}/analytics/agents`);
        return await healthResponse.json();
      
      case 'all':
        const [logs, analytics, patterns, health] = await Promise.all([
          fetch(`${baseUrl}/logs?${params}`).then(r => r.json()),
          fetch(`${baseUrl}/analytics/summary?${params}`).then(r => r.json()),
          fetch(`${baseUrl}/analytics/patterns?${params}`).then(r => r.json()),
          fetch(`${baseUrl}/analytics/agents`).then(r => r.json())
        ]);
        return { logs, analytics, patterns, health };
      
      default:
        throw new Error(`Unsupported data type: ${options.dataType}`);
    }
  };

  const processDataForExport = async (data: any, options: ExportOptions): Promise<any> => {
    // Apply filters
    let processedData = data;
    
    if (options.dataType === 'logs' && data.logs) {
      processedData.logs = data.logs.filter((log: any) => {
        const levelMatch = options.filterByLevel?.length === 0 || options.filterByLevel?.includes(log.level);
        const agentMatch = options.filterByAgent?.length === 0 || options.filterByAgent?.includes(log.source);
        return levelMatch && agentMatch;
      });
    }
    
    return processedData;
  };

  const generateExportFile = async (data: any, options: ExportOptions): Promise<string | ArrayBuffer> => {
    switch (options.format) {
      case 'csv':
        return generateCSV(data, options);
      
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'pdf':
        return await generatePDF(data, options);
      
      case 'excel':
        return await generateExcel(data, options);
      
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  };

  const generateCSV = (data: any, options: ExportOptions): string => {
    const escapeCSV = (field: any): string => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      if (str.includes('"') || str.includes(',') || str.includes('\\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    if (options.dataType === 'logs') {
      const headers = ['timestamp', 'level', 'source', 'message', 'sessionId'];
      if (options.includeMetadata) headers.push('metadata');
      
      const rows = [headers.join(',')];
      
      (data.logs || []).forEach((log: any) => {
        const row = [
          escapeCSV(log.timestamp),
          escapeCSV(log.level),
          escapeCSV(log.source),
          escapeCSV(log.message),
          escapeCSV(log.sessionId)
        ];
        
        if (options.includeMetadata) {
          row.push(escapeCSV(JSON.stringify(log.metadata || {})));
        }
        
        rows.push(row.join(','));
      });
      
      return rows.join('\n');
    }
    
    // Handle other data types
    return 'CSV export not implemented for this data type';
  };

  const generatePDF = async (data: any, options: ExportOptions): Promise<ArrayBuffer> => {
    return new TextEncoder().encode(`PDF Export\n\nData Type: ${options.dataType}\nTime Range: ${options.timeRange.start.toISOString()} - ${options.timeRange.end.toISOString()}\n\nData:\n${JSON.stringify(data, null, 2)}`);
  };

  const generateExcel = async (data: any, options: ExportOptions): Promise<ArrayBuffer> => {
    return new TextEncoder().encode(`Excel Export\n\nData Type: ${options.dataType}\nTime Range: ${options.timeRange.start.toISOString()} - ${options.timeRange.end.toISOString()}\n\nData:\n${JSON.stringify(data, null, 2)}`);
  };

  const downloadFile = async (content: string | ArrayBuffer, options: ExportOptions): Promise<void> => {
    const filename = `mcp-logs-${options.dataType}-${options.timeRange.start.toISOString().split('T')[0]}.${options.format}`;
    
    let blob: Blob;
    if (typeof content === 'string') {
      blob = new Blob([content], { type: getContentType(options.format) });
    } else {
      blob = new Blob([content], { type: getContentType(options.format) });
    }
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getContentType = (format: string): string => {
    switch (format) {
      case 'csv': return 'text/csv';
      case 'json': return 'application/json';
      case 'pdf': return 'application/pdf';
      case 'excel': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default: return 'text/plain';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Export Data</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Options */}
        <div className="space-y-4">
          {/* Data Type */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Data Type</label>
            <select 
              value={options.dataType} 
              onChange={(e) => setOptions(prev => ({ ...prev, dataType: e.target.value as any }))}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="logs">Logs</option>
              <option value="analytics">Analytics Summary</option>
              <option value="patterns">Pattern Analysis</option>
              <option value="health">Agent Health</option>
              <option value="all">All Data</option>
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Format</label>
            <div className="grid grid-cols-2 gap-2">
              {(['csv', 'json', 'pdf', 'excel'] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => setOptions(prev => ({ ...prev, format }))}
                  className={`p-2 rounded-lg border text-sm font-medium transition-colors ${
                    options.format === format
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Time Range */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Time Range</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={options.timeRange.start.toISOString().slice(0, 16)}
                  onChange={(e) => setOptions(prev => ({
                    ...prev,
                    timeRange: { ...prev.timeRange, start: new Date(e.target.value) }
                  }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">End</label>
                <input
                  type="datetime-local"
                  value={options.timeRange.end.toISOString().slice(0, 16)}
                  onChange={(e) => setOptions(prev => ({
                    ...prev,
                    timeRange: { ...prev.timeRange, end: new Date(e.target.value) }
                  }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={exportProgress.isExporting}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {exportProgress.isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Data
              </>
            )}
          </button>
        </div>

        {/* Progress */}
        <div className="space-y-4">
          {exportProgress.isExporting && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Exporting...</span>
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300 mb-2">{exportProgress.stage}</div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div 
                  className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress.progress}%` }}
                />
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 text-right">
                {exportProgress.progress}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
 