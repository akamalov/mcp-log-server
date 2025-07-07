'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings, Trash2, Wifi, WifiOff, TestTube2, AlertCircle, CheckCircle } from 'lucide-react';

interface SyslogForwarder {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'udp' | 'tcp' | 'tcp-tls';
  facility: number;
  severity: string;
  format: 'rfc3164' | 'rfc5424';
  enabled: boolean;
  filters?: {
    agents?: string[];
    levels?: string[];
    messagePatterns?: string[];
  };
  metadata?: {
    tag?: string;
    hostname?: string;
    appName?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  success: boolean;
  message: string;
  latency?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

export default function ForwardersPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedForwarder, setSelectedForwarder] = useState<SyslogForwarder | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const queryClient = useQueryClient();

  // Simple toast replacement
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Fetch forwarders
  const { data: forwarders = [], isLoading, error } = useQuery({
    queryKey: ['syslog-forwarders'],
    queryFn: async (): Promise<SyslogForwarder[]> => {
      const response = await fetch(`${API_BASE}/api/syslog/forwarders`);
      if (!response.ok) {
        throw new Error('Failed to fetch forwarders');
      }
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Create forwarder mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<SyslogForwarder>) => {
      const response = await fetch(`${API_BASE}/api/syslog/forwarders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create forwarder');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syslog-forwarders'] });
      setIsCreateDialogOpen(false);
      showNotification('success', 'Syslog forwarder created successfully');
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to create forwarder');
    },
  });

  // Update forwarder mutation  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SyslogForwarder> }) => {
      const response = await fetch(`${API_BASE}/api/syslog/forwarders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update forwarder');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syslog-forwarders'] });
      setIsEditDialogOpen(false);
      setSelectedForwarder(null);
      showNotification('success', 'Syslog forwarder updated successfully');
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to update forwarder');
    },
  });

  // Delete forwarder mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_BASE}/api/syslog/forwarders/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete forwarder');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syslog-forwarders'] });
      showNotification('success', 'Syslog forwarder deleted successfully');
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to delete forwarder');
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (config: { host: string; port: number; protocol: string }) => {
      const response = await fetch(`${API_BASE}/api/syslog/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        throw new Error('Failed to test connection');
      }
      return response.json();
    },
    onSuccess: (result, variables) => {
      const key = `${variables.host}:${variables.port}:${variables.protocol}`;
      setTestResults(prev => ({ ...prev, [key]: result }));
      if (result.success) {
        showNotification('success', `Connection test successful (${result.latency}ms)`);
      } else {
        showNotification('error', `Connection test failed: ${result.message}`);
      }
    },
    onError: (error) => {
      showNotification('error', error.message || 'Connection test failed');
    },
  });

  const handleTestConnection = (host: string, port: number, protocol: string) => {
    testConnectionMutation.mutate({ host, port, protocol });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this forwarder?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (forwarder: SyslogForwarder) => {
    setSelectedForwarder(forwarder);
    setIsEditDialogOpen(true);
  };

  const getProtocolBadgeColor = (protocol: string) => {
    switch (protocol) {
      case 'udp': return 'bg-blue-100 text-blue-800';
      case 'tcp': return 'bg-green-100 text-green-800';
      case 'tcp-tls': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTestResult = (host: string, port: number, protocol: string) => {
    const key = `${host}:${port}:${protocol}`;
    return testResults[key];
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h3 className="text-red-800 dark:text-red-200 font-medium">Error Loading Forwarders</h3>
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md shadow-lg ${
          notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Syslog Forwarders</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Configure remote syslog servers to forward logs for centralized logging.
            </p>
          </div>
          
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Forwarder
          </button>
        </div>
      </header>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse">
              <div className="p-6">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
                <div className="space-y-3">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : forwarders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <WifiOff className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No forwarders configured</h3>
            <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
              Get started by creating your first syslog forwarder to send logs to a remote server.
            </p>
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Forwarder
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forwarders.map((forwarder) => {
            const testResult = getTestResult(forwarder.host, forwarder.port, forwarder.protocol);
            
            return (
              <div key={forwarder.id} className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{forwarder.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{forwarder.host}:{forwarder.port}</p>
                    </div>
                    <div className="flex items-center space-x-2 ml-2">
                      {forwarder.enabled ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Protocol:</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getProtocolBadgeColor(forwarder.protocol)}`}>
                        {forwarder.protocol.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Format:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{forwarder.format.toUpperCase()}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        forwarder.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {forwarder.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    {testResult && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Last Test:</span>
                        <div className="flex items-center space-x-1">
                          {testResult.success ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-red-500" />
                          )}
                          <span className={`text-xs ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {testResult.latency ? `${testResult.latency}ms` : testResult.success ? 'OK' : 'Failed'}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <hr className="border-gray-200 dark:border-gray-700" />
                    
                    <div className="flex justify-between items-center pt-2">
                      <button
                        onClick={() => handleTestConnection(forwarder.host, forwarder.port, forwarder.protocol)}
                        disabled={testConnectionMutation.isPending}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
                      >
                        <TestTube2 className="h-3 w-3 mr-1" />
                        Test
                      </button>
                      
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleEdit(forwarder)}
                          className="inline-flex items-center px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        >
                          <Settings className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(forwarder.id)}
                          disabled={deleteMutation.isPending}
                          className="inline-flex items-center px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(isCreateDialogOpen || isEditDialogOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            setSelectedForwarder(null);
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isCreateDialogOpen ? 'Create Syslog Forwarder' : 'Edit Syslog Forwarder'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {isCreateDialogOpen ? 'Configure a new syslog server to forward logs to.' : 'Update the configuration for this syslog forwarder.'}
              </p>
            </div>
            <div className="p-6">
              <ForwarderForm 
                initialData={selectedForwarder || undefined}
                onSubmit={(data) => {
                  if (isCreateDialogOpen) {
                    createMutation.mutate(data);
                  } else if (selectedForwarder) {
                    updateMutation.mutate({ id: selectedForwarder.id, data });
                  }
                }}
                onCancel={() => {
                  setIsCreateDialogOpen(false);
                  setIsEditDialogOpen(false);
                  setSelectedForwarder(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ForwarderFormProps {
  initialData?: Partial<SyslogForwarder>;
  onSubmit: (data: Partial<SyslogForwarder>) => void;
  onCancel: () => void;
}

function ForwarderForm({ initialData, onSubmit, onCancel }: ForwarderFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    host: initialData?.host || '',
    port: initialData?.port || 514,
    protocol: initialData?.protocol || 'udp' as const,
    facility: initialData?.facility || 16,
    severity: initialData?.severity || 'info',
    format: initialData?.format || 'rfc5424' as const,
    enabled: initialData?.enabled ?? true,
    filters: {
      agents: initialData?.filters?.agents || [],
      levels: initialData?.filters?.levels || [],
      messagePatterns: initialData?.filters?.messagePatterns || [],
    },
    metadata: {
      tag: initialData?.metadata?.tag || '',
      hostname: initialData?.metadata?.hostname || '',
      appName: initialData?.metadata?.appName || '',
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleArrayFieldChange = (field: 'agents' | 'levels' | 'messagePatterns', value: string) => {
    const items = value.split(',').map(item => item.trim()).filter(Boolean);
    setFormData(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        [field]: items,
      },
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Configuration */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Basic Configuration</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name *</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Production Syslog Server"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="host" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Host *</label>
            <input
              id="host"
              type="text"
              value={formData.host}
              onChange={(e) => setFormData(prev => ({ ...prev, host: e.target.value }))}
              placeholder="syslog.example.com"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="port" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Port *</label>
            <input
              id="port"
              type="number"
              min="1"
              max="65535"
              value={formData.port}
              onChange={(e) => setFormData(prev => ({ ...prev, port: parseInt(e.target.value) }))}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="protocol" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Protocol *</label>
            <select
              id="protocol"
              value={formData.protocol}
              onChange={(e) => setFormData(prev => ({ ...prev, protocol: e.target.value as 'udp' | 'tcp' | 'tcp-tls' }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
              <option value="tcp-tls">TCP with TLS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Syslog Configuration */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Syslog Configuration</h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label htmlFor="facility" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Facility</label>
            <input
              id="facility"
              type="number"
              min="0"
              max="23"
              value={formData.facility}
              onChange={(e) => setFormData(prev => ({ ...prev, facility: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">0-23 (16 = local use)</p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="severity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Default Severity</label>
            <select
              id="severity"
              value={formData.severity}
              onChange={(e) => setFormData(prev => ({ ...prev, severity: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="emergency">Emergency</option>
              <option value="alert">Alert</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="notice">Notice</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="format" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message Format</label>
            <select
              id="format"
              value={formData.format}
              onChange={(e) => setFormData(prev => ({ ...prev, format: e.target.value as 'rfc3164' | 'rfc5424' }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="rfc3164">RFC 3164 (Legacy)</option>
              <option value="rfc5424">RFC 5424 (Modern)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Metadata</h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label htmlFor="tag" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tag</label>
            <input
              id="tag"
              type="text"
              value={formData.metadata.tag}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                metadata: { ...prev.metadata, tag: e.target.value }
              }))}
              placeholder="mcp-logs"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="hostname" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hostname</label>
            <input
              id="hostname"
              type="text"
              value={formData.metadata.hostname}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                metadata: { ...prev.metadata, hostname: e.target.value }
              }))}
              placeholder="mcp-log-server"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="appName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">App Name</label>
            <input
              id="appName"
              type="text"
              value={formData.metadata.appName}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                metadata: { ...prev.metadata, appName: e.target.value }
              }))}
              placeholder="mcp-log-server"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters (Optional)</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="agents" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Agents (comma-separated)</label>
            <input
              id="agents"
              type="text"
              value={formData.filters.agents.join(', ')}
              onChange={(e) => handleArrayFieldChange('agents', e.target.value)}
              placeholder="cursor, claude, vscode"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="levels" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Log Levels (comma-separated)</label>
            <input
              id="levels"
              type="text"
              value={formData.filters.levels.join(', ')}
              onChange={(e) => handleArrayFieldChange('levels', e.target.value)}
              placeholder="error, warn, info"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="messagePatterns" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message Patterns (comma-separated regex)</label>
            <textarea
              id="messagePatterns"
              value={formData.filters.messagePatterns.join(', ')}
              onChange={(e) => handleArrayFieldChange('messagePatterns', e.target.value)}
              placeholder="error.*, connection.*, timeout.*"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center">
        <input
          id="enabled"
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
        />
        <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
          Enable this forwarder
        </label>
      </div>

      {/* Submit Buttons */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        >
          {initialData ? 'Update' : 'Create'} Forwarder
        </button>
      </div>
    </form>
  );
} 