import { Router } from 'express';
import { DatabaseService, CustomAgentInput } from '../services/database.service.js';
import { AgentDiscoveryService } from '../services/agent-discovery.service.js';
import { LogWatcherService } from '../services/log-watcher.service.js';

const router = Router();

// Initialize services (these will be injected from main server)
let databaseService: DatabaseService;
let agentDiscoveryService: AgentDiscoveryService;
let logWatcherService: LogWatcherService;

// Middleware to inject services
export function injectServices(
  db: DatabaseService,
  discovery: AgentDiscoveryService,
  logWatcher: LogWatcherService
) {
  databaseService = db;
  agentDiscoveryService = discovery;
  logWatcherService = logWatcher;
}

// GET /api/agents - Get all agents (discovered + custom)
router.get('/', async (req, res) => {
  try {
    const agents = await agentDiscoveryService.discoverAgents();
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/agents/custom - Get only custom agents
router.get('/custom', async (req, res) => {
  try {
    if (!databaseService) {
      return res.status(503).json({ error: 'Database service not available' });
    }
    
    const customAgents = await databaseService.getCustomAgents();
    res.json(customAgents);
  } catch (error) {
    console.error('Error fetching custom agents:', error);
    res.status(500).json({ error: 'Failed to fetch custom agents' });
  }
});

// POST /api/agents/custom - Create a new custom agent
router.post('/custom', async (req, res) => {
  try {
    if (!databaseService) {
      return res.status(503).json({ error: 'Database service not available' });
    }
    
    const agentData: CustomAgentInput = req.body;
    
    // Validate required fields
    if (!agentData.name || !agentData.type || !agentData.logPaths || agentData.logPaths.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, type, and logPaths are required' 
      });
    }
    
    // Validate log paths exist
    const { promises: fs } = await import('fs');
    const validPaths = [];
    const invalidPaths = [];
    
    for (const logPath of agentData.logPaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isFile() || stat.isDirectory()) {
          validPaths.push(logPath);
        } else {
          invalidPaths.push(logPath);
        }
      } catch {
        invalidPaths.push(logPath);
      }
    }
    
    if (validPaths.length === 0) {
      return res.status(400).json({ 
        error: 'No valid log paths found',
        invalidPaths 
      });
    }
    
    // Create the custom agent
    const customAgent = await databaseService.createCustomAgent({
      ...agentData,
      logPaths: validPaths
    });
    
    // Restart log watcher to pick up new agent
    try {
      await logWatcherService.restart();
    } catch (error) {
      console.warn('Failed to restart log watcher:', error);
    }
    
    res.status(201).json({
      success: true,
      agent: customAgent,
      validPaths,
      invalidPaths: invalidPaths.length > 0 ? invalidPaths : undefined
    });
  } catch (error) {
    console.error('Error creating custom agent:', error);
    res.status(500).json({ error: 'Failed to create custom agent' });
  }
});

// PUT /api/agents/custom/:id - Update a custom agent
router.put('/custom/:id', async (req, res) => {
  try {
    if (!databaseService) {
      return res.status(503).json({ error: 'Database service not available' });
    }
    
    const { id } = req.params;
    const agentData: Partial<CustomAgentInput> = req.body;
    
    // Validate log paths if provided
    if (agentData.logPaths && agentData.logPaths.length > 0) {
      const { promises: fs } = await import('fs');
      const validPaths = [];
      const invalidPaths = [];
      
      for (const logPath of agentData.logPaths) {
        try {
          const stat = await fs.stat(logPath);
          if (stat.isFile() || stat.isDirectory()) {
            validPaths.push(logPath);
          } else {
            invalidPaths.push(logPath);
          }
        } catch {
          invalidPaths.push(logPath);
        }
      }
      
      if (validPaths.length === 0) {
        return res.status(400).json({ 
          error: 'No valid log paths found',
          invalidPaths 
        });
      }
      
      agentData.logPaths = validPaths;
    }
    
    const updatedAgent = await databaseService.updateCustomAgent(id, agentData);
    
    if (!updatedAgent) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }
    
    // Restart log watcher to pick up changes
    try {
      await logWatcherService.restart();
    } catch (error) {
      console.warn('Failed to restart log watcher:', error);
    }
    
    res.json({
      success: true,
      agent: updatedAgent
    });
  } catch (error) {
    console.error('Error updating custom agent:', error);
    res.status(500).json({ error: 'Failed to update custom agent' });
  }
});

// DELETE /api/agents/custom/:id - Delete a custom agent
router.delete('/custom/:id', async (req, res) => {
  try {
    if (!databaseService) {
      return res.status(503).json({ error: 'Database service not available' });
    }
    
    const { id } = req.params;
    
    const deleted = await databaseService.deleteCustomAgent(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }
    
    // Restart log watcher to remove the agent
    try {
      await logWatcherService.restart();
    } catch (error) {
      console.warn('Failed to restart log watcher:', error);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom agent:', error);
    res.status(500).json({ error: 'Failed to delete custom agent' });
  }
});

// POST /api/agents/custom/:id/log-paths - Add log paths to existing agent
router.post('/custom/:id/log-paths', async (req, res) => {
  try {
    if (!databaseService) {
      return res.status(503).json({ error: 'Database service not available' });
    }
    
    const { id } = req.params;
    const { logPaths }: { logPaths: string[] } = req.body;
    
    if (!logPaths || logPaths.length === 0) {
      return res.status(400).json({ error: 'logPaths array is required' });
    }
    
    // Validate log paths
    const { promises: fs } = await import('fs');
    const validPaths = [];
    const invalidPaths = [];
    
    for (const logPath of logPaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isFile() || stat.isDirectory()) {
          validPaths.push(logPath);
        } else {
          invalidPaths.push(logPath);
        }
      } catch {
        invalidPaths.push(logPath);
      }
    }
    
    if (validPaths.length === 0) {
      return res.status(400).json({ 
        error: 'No valid log paths found',
        invalidPaths 
      });
    }
    
    const updatedAgent = await databaseService.addLogPaths(id, validPaths);
    
    if (!updatedAgent) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }
    
    // Restart log watcher to pick up new paths
    try {
      await logWatcherService.restart();
    } catch (error) {
      console.warn('Failed to restart log watcher:', error);
    }
    
    res.json({
      success: true,
      agent: updatedAgent,
      addedPaths: validPaths,
      invalidPaths: invalidPaths.length > 0 ? invalidPaths : undefined
    });
  } catch (error) {
    console.error('Error adding log paths:', error);
    res.status(500).json({ error: 'Failed to add log paths' });
  }
});

// DELETE /api/agents/custom/:id/log-paths - Remove log paths from existing agent
router.delete('/custom/:id/log-paths', async (req, res) => {
  try {
    if (!databaseService) {
      return res.status(503).json({ error: 'Database service not available' });
    }
    
    const { id } = req.params;
    const { logPaths }: { logPaths: string[] } = req.body;
    
    if (!logPaths || logPaths.length === 0) {
      return res.status(400).json({ error: 'logPaths array is required' });
    }
    
    const updatedAgent = await databaseService.removeLogPaths(id, logPaths);
    
    if (!updatedAgent) {
      return res.status(404).json({ error: 'Custom agent not found' });
    }
    
    // Restart log watcher to remove the paths
    try {
      await logWatcherService.restart();
    } catch (error) {
      console.warn('Failed to restart log watcher:', error);
    }
    
    res.json({
      success: true,
      agent: updatedAgent,
      removedPaths: logPaths
    });
  } catch (error) {
    console.error('Error removing log paths:', error);
    res.status(500).json({ error: 'Failed to remove log paths' });
  }
});

// GET /api/agents/discovered - Get only system-discovered agents
router.get('/discovered', async (req, res) => {
  try {
    const agents = await agentDiscoveryService.discoverAgents();
    const discoveredAgents = agents.filter(agent => !agent.metadata?.isCustom);
    res.json(discoveredAgents);
  } catch (error) {
    console.error('Error fetching discovered agents:', error);
    res.status(500).json({ error: 'Failed to fetch discovered agents' });
  }
});

// POST /api/agents/refresh - Refresh agent discovery
router.post('/refresh', async (req, res) => {
  try {
    const agents = await agentDiscoveryService.discoverAgents();
    
    // Restart log watcher to pick up any changes
    try {
      await logWatcherService.restart();
    } catch (error) {
      console.warn('Failed to restart log watcher:', error);
    }
    
    res.json({
      success: true,
      agents,
      count: agents.length
    });
  } catch (error) {
    console.error('Error refreshing agents:', error);
    res.status(500).json({ error: 'Failed to refresh agents' });
  }
});

export default router; 