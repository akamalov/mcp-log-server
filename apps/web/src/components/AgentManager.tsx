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

  useEffect(() => {
    loadAgents();
    loadDiscoveredAgents();
    setMounted(true);
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch('/api/agents/custom', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error('Failed to load custom agents');
      const data = await response.json();
      const validAgents = Array.isArray(data) ? data.filter(agent => agent && agent.id && agent.name) : [];
      setAgents(validAgents);
      setError(null);
    } catch (err) {
      console.warn('Failed to load custom agents:', err);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoveredAgents = async () => {
    try {
      const response = await fetch('/api/agents/discovered');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ details: 'Could not parse error response.' }));
        throw new Error(`Failed to load discovered agents: ${response.status} ${response.statusText}. ${errorData.details || ''}`);
      }
      const data = await response.json();
      
      // De-duplicate the agents list based on agent.id
      const uniqueAgents = Array.from(new Map(data.map((agent: any) => [agent.id, agent])).values());
      
      setDiscoveredAgents(uniqueAgents);
    } catch (err) {
      console.error('Failed to load discovered agents:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(`Could not load discovered agents. ${errorMessage}`);
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
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
      logPaths: prev.logPaths.map((path, i) => (i === index ? value : path))
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
    setEditingAgent(null);
    setFormData(DEFAULT_FORM_DATA);
    setShowForm(false);
  };

  const handleEditDiscoveredAgent = (agent: any) => {
    setEditingDiscoveredAgent(agent);
    setDiscoveredAgentForm({
      logPaths: agent.logPaths || [],
      logFormat: agent.logFormat || 'text',
      enabled: agent.enabled !== false,
      filters: agent.filters || LOG_LEVELS
    });
  };

  const handleSaveDiscoveredAgent = async () => {
    if (!editingDiscoveredAgent) return;
    
    const updatedAgentData = {
      ...editingDiscoveredAgent,
      ...discoveredAgentForm,
      logPaths: discoveredAgentForm.logPaths.filter(p => p.trim())
    };

    try {
      setLoading(true);
      const response = await fetch(`/api/agents/discovered/${editingDiscoveredAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAgentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update discovered agent');
      }

      setSuccess('Discovered agent updated successfully');
      setEditingDiscoveredAgent(null);
      loadDiscoveredAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update discovered agent');
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
      logPaths: prev.logPaths.map((p, i) => i === index ? value : p)
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
  };

  if (!mounted) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Manager</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {showForm ? 'Close Form' : 'Add Custom Agent'}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg relative mb-4 flex items-center gap-2" role="alert">
            <AlertCircle className="w-5 h-5"/>
            <span className="block sm:inline">{error}</span>
            <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
              <X className="w-5 h-5"/>
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-200 px-4 py-3 rounded-lg relative mb-4 flex items-center gap-2" role="alert">
            <CheckCircle className="w-5 h-5"/>
            <span className="block sm:inline">{success}</span>
            <button onClick={() => setSuccess(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
              <X className="w-5 h-5"/>
            </button>
          </div>
        )}

        {showForm && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{editingAgent ? 'Edit' : 'Add'} Custom Agent</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Agent Name</label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., My App Server"
                  />
                </div>
                <div>
                  <label htmlFor="type" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Agent Type</label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {AGENT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Log Paths</label>
                  {formData.logPaths.map((path, index) => (
                    <div key={index} className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={path}
                        onChange={e => updateLogPath(index, e.target.value)}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="/path/to/your/logfile.log"
                      />
                      {formData.logPaths.length > 1 && (
                        <button type="button" onClick={() => removeLogPath(index)} className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addLogPath} className="text-sm text-blue-600 hover:underline dark:text-blue-400">Add another path</button>
                </div>
              </div>
              <div>
                <label htmlFor="logFormat" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Log Format</label>
                <select
                  id="logFormat"
                  value={formData.logFormat}
                  onChange={e => setFormData({ ...formData, logFormat: e.target.value })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {LOG_FORMATS.map(format => (
                    <option key={format.value} value={format.value}>{format.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Enabled Log Levels</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LOG_LEVELS.map(level => (
                    <div key={level} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`filter-${level}`}
                        checked={formData.filters.includes(level)}
                        onChange={() => toggleFilter(level)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`filter-${level}`} className="ml-2 block text-sm text-gray-900 dark:text-gray-300 capitalize">{level}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="enabled" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Enable this agent</label>
              </div>
              <div className="flex justify-end gap-4">
                <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" disabled={loading}>
                  {loading ? (editingAgent ? 'Updating...' : 'Creating...') : (editingAgent ? 'Update Agent' : 'Create Agent')}
                </button>
              </div>
            </form>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Custom Agents ({agents.length})</h2>
          {loading && agents.length === 0 ? (
             <div className="text-center p-4">Loading custom agents...</div>
          ) : agents.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No custom agents configured. Click "Add Custom Agent" to create one.</p>
          ) : (
            <div className="grid gap-4">
              {agents.map((agent) => (
                <div key={agent.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-grow">
                      <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{agent.type} - {agent.is_active ? 'Active' : 'Inactive'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(agent)} className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400">
                        <Edit className="w-5 h-5"/>
                      </button>
                      <button onClick={() => handleDelete(agent.id)} className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400">
                        <Trash2 className="w-5 h-5"/>
                      </button>
                      <button onClick={() => setShowDetails(showDetails === agent.id ? null : agent.id)} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                         {showDetails === agent.id ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}
                      </button>
                    </div>
                  </div>
                  {showDetails === agent.id && (
                    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 text-sm text-gray-600 dark:text-gray-300">
                       <p><strong>Log Paths:</strong> {agent.log_paths.join(', ')}</p>
                       <p><strong>Format:</strong> {agent.format_type}</p>
                       <p><strong>Filters:</strong> {agent.filters.join(', ')}</p>
                       <p><strong>Last Updated:</strong> {new Date(agent.updated_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Discovered Agents ({discoveredAgents.length})</h2>
          {discoveredAgents.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No agents were automatically discovered.</p>
          ) : (
            <div className="grid gap-4">
              {discoveredAgents.map((agent) => (
                <div key={agent.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg shadow-md">
                   <div className="flex justify-between items-start">
                      <div>
                         <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                         <p className="text-sm text-gray-500 dark:text-gray-400">{agent.type}</p>
                         <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            {agent.logPaths && agent.logPaths.length > 0 ? (
                               agent.logPaths.map((path: string, index: number) => <div key={index}>{path}</div>)
                            ) : (
                               <p className="text-yellow-600 dark:text-yellow-400">0 paths found</p>
                            )}
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <button onClick={() => handleEditDiscoveredAgent(agent)} className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400">
                            <Settings className="w-5 h-5"/>
                         </button>
                      </div>
                   </div>
                   {editingDiscoveredAgent && editingDiscoveredAgent.id === agent.id && (
                     <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
                        <div className="space-y-4">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Log Paths</label>
                              {discoveredAgentForm.logPaths.map((path, index) => (
                                <div key={index} className="flex items-center gap-2">
                                   <input
                                     type="text"
                                     value={path}
                                     onChange={(e) => updateDiscoveredLogPath(index, e.target.value)}
                                     className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                   />
                                   {discoveredAgentForm.logPaths.length > 1 && (
                                     <button type="button" onClick={() => removeDiscoveredLogPath(index)} className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400">
                                       <Trash2 className="w-5 h-5"/>
                                     </button>
                                   )}
                                </div>
                              ))}
                              <button type="button" onClick={addDiscoveredLogPath} className="text-sm text-blue-600 hover:underline dark:text-blue-400">Add another path</button>
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Log Format</label>
                              <select
                                 value={discoveredAgentForm.logFormat}
                                 onChange={(e) => setDiscoveredAgentForm(prev => ({ ...prev, logFormat: e.target.value }))}
                                 className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                {LOG_FORMATS.map(format => (
                                  <option key={format.value} value={format.value}>{format.label}</option>
                                ))}
                              </select>
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Enabled Log Levels</label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {LOG_LEVELS.map(level => (
                                  <div key={level} className="flex items-center">
                                     <input
                                       type="checkbox"
                                       id={`discovered-filter-${level}`}
                                       checked={discoveredAgentForm.filters.includes(level)}
                                       onChange={() => toggleDiscoveredFilter(level)}
                                       className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                     />
                                     <label htmlFor={`discovered-filter-${level}`} className="ml-2 block text-sm text-gray-900 dark:text-gray-300 capitalize">{level}</label>
                                  </div>
                                ))}
                              </div>
                           </div>
                           <div className="flex justify-end gap-2">
                              <button onClick={resetDiscoveredForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg">Cancel</button>
                              <button onClick={handleSaveDiscoveredAgent} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Changes</button>
                           </div>
                        </div>
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