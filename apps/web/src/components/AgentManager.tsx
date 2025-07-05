'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Settings, FolderOpen, X, Save, RefreshCw, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';

interface CustomAgent {
  id: string;
  user_id?: string;
  name: string;
  type: string;
  config: any;
  is_active: boolean;
  auto_discovery: boolean;
  log_paths: string[];
  format_type: string;
  filters: string[];
  metadata: any;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
}

interface AgentFormData {
  name: string;
  type: string;
  logPaths: string[];
  logFormat: string;
  enabled: boolean;
  filters: string[];
  metadata: any;
}

const DEFAULT_FORM_DATA: AgentFormData = {
  name: '',
  type: 'custom',
  logPaths: [''],
  logFormat: 'text',
  enabled: true,
  filters: ['info', 'warn', 'error'],
  metadata: {}
};

const LOG_FORMATS = [
  { value: 'text', label: 'Plain Text' },
  { value: 'json', label: 'JSON' },
  { value: 'structured', label: 'Structured' },
  { value: 'vscode-extension', label: 'VS Code Extension' },
  { value: 'claude-mcp-json', label: 'Claude MCP JSON' }
];

const AGENT_TYPES = [
  { value: 'custom', label: 'Custom Agent' },
  { value: 'custom-text', label: 'Custom Text Logs' },
  { value: 'custom-json', label: 'Custom JSON Logs' },
  { value: 'custom-structured', label: 'Custom Structured Logs' },
  { value: 'custom-claude', label: 'Custom Claude Logs' },
  { value: 'custom-vscode', label: 'Custom VS Code Logs' },
  { value: 'custom-cursor', label: 'Custom Cursor Logs' }
];

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];

export default function AgentManager() {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [discoveredAgents, setDiscoveredAgents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<CustomAgent | null>(null);
  const [formData, setFormData] = useState<AgentFormData>(DEFAULT_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [editingDiscoveredAgent, setEditingDiscoveredAgent] = useState<any | null>(null);
  const [discoveredAgentForm, setDiscoveredAgentForm] = useState<{
    logPaths: string[];
    logFormat: string;
    enabled: boolean;
    filters: string[];
  }>({
    logPaths: [],
    logFormat: 'text',
    enabled: true,
    filters: ['info', 'warn', 'error']
  });

  const loadAgents = async () => {
    try {
      setLoading(true);
      
      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch('/api/agents/custom', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error('Failed to load custom agents');
      const data = await response.json();
      // Filter out invalid agents (empty objects or agents without required properties)
      const validAgents = Array.isArray(data) ? data.filter(agent => agent && agent.id && agent.name) : [];
      setAgents(validAgents);
      setError(null); // Clear any previous errors on success
    } catch (err) {
      console.warn('Failed to load custom agents:', err);
      // Don't show error to user for now, just log it and show empty list
      setAgents([]);
      // setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoveredAgents = async () => {
    try {
      const response = await fetch('/api/agents/discovered');
      if (!response.ok) throw new Error('Failed to load discovered agents');
      const data = await response.json();
      setDiscoveredAgents(data);
    } catch (err) {
      console.warn('Failed to load discovered agents:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    
    if (!formData.name.trim()) {
      setError('Agent name is required');
      return;
    }
    if (formData.logPaths.every(path => !path.trim())) {
      setError('At least one log path is required');
      return;
    }
    
    console.log('Validation passed, submitting...');

    try {
      setLoading(true);
      setError(null);
      
      const agentData = {
        ...formData,
        logPaths: formData.logPaths.filter(path => path.trim()),
        metadata: { ...formData.metadata, createdBy: 'user' }
      };

      const url = editingAgent ? `/api/agents/custom/${editingAgent.id}` : '/api/agents/custom';
      const method = editingAgent ? 'PUT' : 'POST';

      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save agent');
      }

      const result = await response.json();
      setSuccess(editingAgent ? 'Agent updated successfully' : 'Agent created successfully');
      
      if (result.invalidPaths && result.invalidPaths.length > 0) {
        setError(`Warning: Some paths were invalid: ${result.invalidPaths.join(', ')}`);
      }

      // Reset form and reload agents
      setFormData(DEFAULT_FORM_DATA);
      setEditingAgent(null);
      setShowForm(false);
      loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (agent: CustomAgent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      type: agent.type,
      logPaths: agent.config?.logPaths || agent.log_paths || [''],
      logFormat: agent.format_type,
      enabled: agent.is_active,
      filters: agent.filters,
      metadata: agent.metadata
    });
    setShowForm(true);
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/agents/custom/${agentId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete agent');
      
      setSuccess('Agent deleted successfully');
      loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents/refresh', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh agents');
      
      setSuccess('Agents refreshed successfully');
      loadAgents();
      loadDiscoveredAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh agents');
    } finally {
      setLoading(false);
    }
  };

  const addLogPath = () => {
    setFormData(prev => ({ ...prev, logPaths: [...prev.logPaths, ''] }));
  };

  const removeLogPath = (index: number) => {
    setFormData(prev => ({ 
      ...prev, 
      logPaths: prev.logPaths.filter((_, i) => i !== index) 
    }));
  };

  const updateLogPath = (index: number, value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      logPaths: prev.logPaths.map((path, i) => i === index ? value : path)
    }));
  };

  const toggleFilter = (filter: string) => {
    setFormData(prev => ({
      ...prev,
      filters: prev.filters.includes(filter)
        ? prev.filters.filter(f => f !== filter)
        : [...prev.filters, filter]
    }));
  };

  const resetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setEditingAgent(null);
    setShowForm(false);
    setError(null);
  };

  const handleEditDiscoveredAgent = (agent: any) => {
    setEditingDiscoveredAgent(agent);
    setDiscoveredAgentForm({
      logPaths: agent.logPaths && agent.logPaths.length > 0 ? [...agent.logPaths] : [''],
      logFormat: agent.logFormat || 'text',
      enabled: true,
      filters: ['info', 'warn', 'error']
    });
  };

  const handleSaveDiscoveredAgent = async () => {
    if (!editingDiscoveredAgent) return;

    try {
      setLoading(true);
      setError(null);

      // Convert discovered agent to custom agent with updated paths
      const customAgentData = {
        name: editingDiscoveredAgent.name,
        type: editingDiscoveredAgent.type || 'custom',
        logPaths: discoveredAgentForm.logPaths.filter(path => path.trim()),
        logFormat: discoveredAgentForm.logFormat,
        enabled: discoveredAgentForm.enabled,
        filters: discoveredAgentForm.filters,
        metadata: {
          ...editingDiscoveredAgent.metadata,
          convertedFrom: 'discovered',
          originalDiscoveredAt: editingDiscoveredAgent.metadata?.lastDiscovered,
          createdBy: 'user'
        }
      };

      const response = await fetch('/api/agents/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customAgentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save agent');
      }

      const result = await response.json();
      setSuccess('Discovered agent converted to custom agent successfully');
      
      if (result.invalidPaths && result.invalidPaths.length > 0) {
        setError(`Warning: Some paths were invalid: ${result.invalidPaths.join(', ')}`);
      }

      // Reset form and reload agents
      setEditingDiscoveredAgent(null);
      setDiscoveredAgentForm({
        logPaths: [],
        logFormat: 'text',
        enabled: true,
        filters: ['info', 'warn', 'error']
      });
      loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setLoading(false);
    }
  };

  const addDiscoveredLogPath = () => {
    setDiscoveredAgentForm(prev => ({ 
      ...prev, 
      logPaths: [...prev.logPaths, ''] 
    }));
  };

  const removeDiscoveredLogPath = (index: number) => {
    setDiscoveredAgentForm(prev => ({ 
      ...prev, 
      logPaths: prev.logPaths.filter((_, i) => i !== index) 
    }));
  };

  const updateDiscoveredLogPath = (index: number, value: string) => {
    setDiscoveredAgentForm(prev => ({ 
      ...prev, 
      logPaths: prev.logPaths.map((path, i) => i === index ? value : path)
    }));
  };

  const toggleDiscoveredFilter = (filter: string) => {
    setDiscoveredAgentForm(prev => ({
      ...prev,
      filters: prev.filters.includes(filter)
        ? prev.filters.filter(f => f !== filter)
        : [...prev.filters, filter]
    }));
  };

  const resetDiscoveredForm = () => {
    setEditingDiscoveredAgent(null);
    setDiscoveredAgentForm({
      logPaths: [],
      logFormat: 'text',
      enabled: true,
      filters: ['info', 'warn', 'error']
    });
    setError(null);
  };

  // Only load agents after component is mounted on client
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      loadAgents();
      loadDiscoveredAgents();
    }
  }, []);

  // Don't render anything until mounted on client
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-300">Loading agent manager...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Manager</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Manage custom agents and view auto-discovered agents</p>
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex justify-end gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Custom Agent
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {success}
            <button onClick={() => setSuccess(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Agent Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  {editingAgent ? 'Edit Agent' : 'Add Custom Agent'}
                </h2>
                <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Agent Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white placeholder-gray-400"
                    placeholder="My Custom Agent"
                    required
                  />
                </div>

                {/* Agent Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
                  >
                    {AGENT_TYPES.map(type => (
                      <option key={type.value} value={type.value} className="text-black bg-white">
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Log Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Format
                  </label>
                  <select
                    value={formData.logFormat}
                    onChange={(e) => setFormData(prev => ({ ...prev, logFormat: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
                  >
                    {LOG_FORMATS.map(format => (
                      <option key={format.value} value={format.value} className="text-black bg-white">
                        {format.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Log Paths */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Paths *
                  </label>
                  <div className="space-y-2">
                    {formData.logPaths.map((path, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={path}
                          onChange={(e) => updateLogPath(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white placeholder-gray-400"
                          placeholder="/path/to/log/file.log or /path/to/log/directory"
                        />
                        <button
                          type="button"
                          onClick={() => removeLogPath(index)}
                          className="px-3 py-2 text-red-600 hover:text-red-800"
                          disabled={formData.logPaths.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addLogPath}
                      className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="w-4 h-4" />
                      Add Log Path
                    </button>
                  </div>
                </div>

                {/* Log Level Filters */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Level Filters
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {LOG_LEVELS.map(level => (
                      <label key={level} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.filters.includes(level)}
                          onChange={() => toggleFilter(level)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm capitalize text-gray-900 font-medium">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Enable Agent
                    </span>
                  </label>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {editingAgent ? 'Update Agent' : 'Create Agent'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Discovered Agent Edit Modal */}
        {editingDiscoveredAgent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  Edit & Convert Discovered Agent: {editingDiscoveredAgent.name}
                </h2>
                <button onClick={resetDiscoveredForm} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Editing this discovered agent will convert it to a custom agent that you can fully manage.
                  The original auto-discovered agent will remain unchanged.
                </p>
              </div>

              <div className="space-y-4">
                {/* Log Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Format
                  </label>
                  <select
                    value={discoveredAgentForm.logFormat}
                    onChange={(e) => setDiscoveredAgentForm(prev => ({ ...prev, logFormat: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
                  >
                    {LOG_FORMATS.map(format => (
                      <option key={format.value} value={format.value} className="text-black bg-white">
                        {format.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Log Paths */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Paths *
                  </label>
                  <div className="space-y-2">
                    {discoveredAgentForm.logPaths.map((path, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={path}
                          onChange={(e) => updateDiscoveredLogPath(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white placeholder-gray-400"
                          placeholder="/path/to/log/file.log or /path/to/log/directory"
                        />
                        <button
                          type="button"
                          onClick={() => removeDiscoveredLogPath(index)}
                          className="px-3 py-2 text-red-600 hover:text-red-800"
                          disabled={discoveredAgentForm.logPaths.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addDiscoveredLogPath}
                      className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="w-4 h-4" />
                      Add Log Path
                    </button>
                  </div>
                </div>

                {/* Log Level Filters */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Level Filters
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {LOG_LEVELS.map(level => (
                      <label key={level} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={discoveredAgentForm.filters.includes(level)}
                          onChange={() => toggleDiscoveredFilter(level)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm capitalize text-gray-900 font-medium">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={discoveredAgentForm.enabled}
                      onChange={(e) => setDiscoveredAgentForm(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Enable Agent
                    </span>
                  </label>
                </div>

                {/* Original Discovery Info */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Original Discovery Info:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <div><strong>Source:</strong> {editingDiscoveredAgent.metadata?.source}</div>
                    <div><strong>Confidence:</strong> {((editingDiscoveredAgent.metadata?.confidence || 0) * 100).toFixed(1)}%</div>
                    <div><strong>Type:</strong> {editingDiscoveredAgent.type}</div>
                    <div><strong>Original Paths:</strong> {editingDiscoveredAgent.logPaths?.length || 0}</div>
                  </div>
                  {editingDiscoveredAgent.logPaths && editingDiscoveredAgent.logPaths.length > 0 && (
                    <div className="mt-2">
                      <strong className="text-gray-700">Original discovered paths:</strong>
                      <ul className="list-disc list-inside text-xs text-gray-600 mt-1">
                        {editingDiscoveredAgent.logPaths.slice(0, 3).map((path, index) => (
                          <li key={index} className="font-mono truncate">{path}</li>
                        ))}
                        {editingDiscoveredAgent.logPaths.length > 3 && (
                          <li className="text-gray-500">... and {editingDiscoveredAgent.logPaths.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSaveDiscoveredAgent}
                    disabled={loading || discoveredAgentForm.logPaths.every(path => !path.trim())}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Convert to Custom Agent
                  </button>
                  <button
                    type="button"
                    onClick={resetDiscoveredForm}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agents List */}
        <div className="space-y-6">
          {/* Custom Agents */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Custom Agents ({agents.length})
            </h2>
            {agents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No custom agents configured. Click "Add Custom Agent" to get started.
              </div>
            ) : (
              <div className="grid gap-4">
                {agents.map(agent => (
                  <div key={agent.id} className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {agent.type} • {agent.format_type} • {(agent.config?.logPaths || agent.log_paths || []).length} paths
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDetails(showDetails === agent.id ? null : agent.id)}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                          {showDetails === agent.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(agent)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(agent.id)}
                          className="p-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        agent.is_active 
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400' 
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-300'
                      }`}>
                        {agent.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span>Filters: {agent.filters.join(', ')}</span>
                      <span>Created: {new Date(agent.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Detailed View */}
                    {showDetails === agent.id && (
                      <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Log Paths:</h4>
                        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                          {(agent.config?.logPaths || agent.log_paths || []).length > 0 ? (
                            (agent.config?.logPaths || agent.log_paths || []).map((path, index) => (
                              <li key={index} className="font-mono">{path}</li>
                            ))
                          ) : (
                            <li className="text-gray-400 dark:text-gray-500">No log paths configured</li>
                          )}
                        </ul>
                        {agent.metadata && Object.keys(agent.metadata).length > 0 && (
                          <>
                            <h4 className="font-medium text-gray-900 dark:text-white mt-3 mb-2">Metadata:</h4>
                            <pre className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-600 overflow-auto">
                              {JSON.stringify(agent.metadata, null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discovered Agents */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Discovered Agents ({discoveredAgents.length})
            </h2>
            {discoveredAgents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No agents discovered automatically.
              </div>
            ) : (
              <div className="grid gap-4">
                {discoveredAgents.map(agent => (
                  <div key={agent.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {agent.type} • {agent.logFormat} • {agent.logPaths?.length || 0} paths
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowDetails(showDetails === agent.id ? null : agent.id)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                          title="View discovered paths"
                        >
                          {showDetails === agent.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEditDiscoveredAgent(agent)}
                          className="p-2 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
                          title="Edit and convert to custom agent"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800/30 text-blue-800 dark:text-blue-300 text-xs rounded-full">
                          Auto-discovered
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        (agent.metadata?.status || 'unknown') === 'active'
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400' 
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-300'
                      }`}>
                        {(agent.metadata?.status || 'unknown') === 'active' ? 'Active' : 'Inactive'}
                      </span>
                      <span>Confidence: {((agent.metadata?.confidence || 0) * 100).toFixed(0)}%</span>
                      <span>Last discovered: {new Date(agent.metadata?.lastDiscovered || Date.now()).toLocaleDateString()}</span>
                    </div>

                    {/* Detailed View for Discovered Agents */}
                    {showDetails === agent.id && (
                      <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-600">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Auto-discovered Log Paths:</h4>
                        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                          {agent.logPaths?.map((path, index) => (
                            <li key={index} className="font-mono">{path}</li>
                          )) || <li className="text-gray-400 dark:text-gray-500">No paths available</li>}
                        </ul>
                        
                        {agent.metadata && (
                          <>
                            <h4 className="font-medium text-gray-900 dark:text-white mt-3 mb-2">Discovery Metadata:</h4>
                            <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-600">
                              <div className="grid grid-cols-2 gap-2">
                                <div><strong>Source:</strong> {agent.metadata.source}</div>
                                <div><strong>Confidence:</strong> {((agent.metadata.confidence || 0) * 100).toFixed(1)}%</div>
                                <div><strong>Status:</strong> {agent.metadata.status}</div>
                                <div><strong>Log Format:</strong> {agent.logFormat}</div>
                              </div>
                              {agent.metadata.lastDiscovered && (
                                <div className="mt-2">
                                  <strong>Last Discovered:</strong> {new Date(agent.metadata.lastDiscovered).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 