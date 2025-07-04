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

  const loadAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents/custom');
      if (!response.ok) throw new Error('Failed to load custom agents');
      const data = await response.json();
      setAgents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
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
    if (!formData.name.trim()) {
      setError('Agent name is required');
      return;
    }
    if (formData.logPaths.every(path => !path.trim())) {
      setError('At least one log path is required');
      return;
    }

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

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      });

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
      logPaths: agent.log_paths,
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
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Manager</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="w-4 h-4" />
            Add Custom Agent
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center gap-2">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {AGENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LOG_FORMATS.map(format => (
                    <option key={format.value} value={format.value}>
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <span className="text-sm capitalize">{level}</span>
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

      {/* Agents List */}
      <div className="space-y-6">
        {/* Custom Agents */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Custom Agents ({agents.length})
          </h2>
          {agents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No custom agents configured. Click "Add Custom Agent" to get started.
            </div>
          ) : (
            <div className="grid gap-4">
              {agents.map(agent => (
                <div key={agent.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{agent.name}</h3>
                      <p className="text-sm text-gray-500">
                        {agent.type} • {agent.format_type} • {agent.log_paths.length} paths
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDetails(showDetails === agent.id ? null : agent.id)}
                        className="p-2 text-gray-500 hover:text-gray-700"
                      >
                        {showDetails === agent.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleEdit(agent)}
                        className="p-2 text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(agent.id)}
                        className="p-2 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      agent.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span>Filters: {agent.filters.join(', ')}</span>
                    <span>Created: {new Date(agent.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Detailed View */}
                  {showDetails === agent.id && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Log Paths:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {agent.log_paths.map((path, index) => (
                          <li key={index} className="font-mono">{path}</li>
                        ))}
                      </ul>
                      {agent.metadata && Object.keys(agent.metadata).length > 0 && (
                        <>
                          <h4 className="font-medium text-gray-900 mt-3 mb-2">Metadata:</h4>
                          <pre className="text-sm text-gray-600 bg-white p-2 rounded border">
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
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Discovered Agents ({discoveredAgents.length})
          </h2>
          {discoveredAgents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No agents discovered automatically.
            </div>
          ) : (
            <div className="grid gap-4">
              {discoveredAgents.map(agent => (
                <div key={agent.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{agent.name}</h3>
                      <p className="text-sm text-gray-500">
                        {agent.type} • {agent.logFormat} • {agent.logPaths?.length || 0} paths
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowDetails(showDetails === agent.id ? null : agent.id)}
                        className="p-2 text-blue-600 hover:text-blue-800"
                        title="View discovered paths"
                      >
                        {showDetails === agent.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        Auto-discovered
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <span>Status: {agent.metadata?.status || 'unknown'}</span>
                    <span>Confidence: {((agent.metadata?.confidence || 0) * 100).toFixed(0)}%</span>
                    <span>Last discovered: {new Date(agent.metadata?.lastDiscovered || Date.now()).toLocaleDateString()}</span>
                  </div>

                  {/* Detailed View for Discovered Agents */}
                  {showDetails === agent.id && (
                    <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
                      <h4 className="font-medium text-gray-900 mb-2">Auto-discovered Log Paths:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {agent.logPaths?.map((path, index) => (
                          <li key={index} className="font-mono">{path}</li>
                        )) || <li className="text-gray-400">No paths available</li>}
                      </ul>
                      
                      {agent.metadata && (
                        <>
                          <h4 className="font-medium text-gray-900 mt-3 mb-2">Discovery Metadata:</h4>
                          <div className="text-sm text-gray-600 bg-white p-2 rounded border">
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
  );
} 