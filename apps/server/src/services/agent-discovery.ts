import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { AgentConfig } from '@mcp-log-server/types';
// import type { DatabaseService } from './database.service.js';

/**
 * Check if we're running in WSL environment
 */
async function isWSL(): Promise<boolean> {
  try {
    // Check for WSL indicator files
    const wslCheck1 = await fs.access('/proc/version').then(() => {
      return fs.readFile('/proc/version', 'utf8').then(content => 
        content.toLowerCase().includes('microsoft') || content.toLowerCase().includes('wsl')
      );
    }).catch(() => false);

    // Check for Windows mount points
    const wslCheck2 = await fs.access('/mnt/c').then(() => true).catch(() => false);
    
    return wslCheck1 || wslCheck2;
  } catch {
    return false;
  }
}

/**
 * Get potential Windows drive mounts in WSL
 */
async function getWindowsMounts(): Promise<string[]> {
  const mounts: string[] = [];
  const commonDrives = ['c', 'd', 'e', 'f'];
  
  for (const drive of commonDrives) {
    try {
      await fs.access(`/mnt/${drive}`);
      mounts.push(`/mnt/${drive}`);
    } catch {
      // Drive not mounted
    }
  }
  
  return mounts;
}

/**
 * Generate cross-platform and WSL-aware paths
 */
async function generateAgentPaths(basePaths: { [platform: string]: string[] }): Promise<string[]> {
  const allPaths: string[] = [];
  const isWSLEnv = await isWSL();
  
  // Add Linux/Unix paths
  if (basePaths.linux) {
    allPaths.push(...basePaths.linux);
  }
  
  // Add macOS paths
  if (basePaths.macos) {
    allPaths.push(...basePaths.macos);
  }
  
  // Add Windows paths (native)
  if (basePaths.windows) {
    allPaths.push(...basePaths.windows);
  }
  
  // If in WSL, add Windows paths mapped to WSL mounts
  if (isWSLEnv) {
    console.log('🔍 WSL environment detected, checking Windows mounts...');
    const windowsMounts = await getWindowsMounts();
    
    for (const mount of windowsMounts) {
      // Get possible Windows usernames (WSL username might differ from Windows username)
      const wslUsername = process.env.USER || 'user';
      const possibleUsers = [
        wslUsername, 
        'Administrator', 
        'user'
      ];
      
      // Also try to detect actual Windows usernames by checking what exists
      try {
        const usersDir = join(mount, 'Users');
        const actualUsers = await fs.readdir(usersDir);
        // Add real Windows usernames that exist
        possibleUsers.push(...actualUsers.filter(user => 
          !possibleUsers.includes(user) && 
          !['Public', 'Default', 'All Users'].includes(user)
        ));
      } catch {
        // If can't read Users directory, continue with the defaults
      }
      
      console.log(`🔍 Checking Windows usernames: ${possibleUsers.join(', ')}`);
      
      for (const user of possibleUsers) {
        // Claude Desktop app paths in Windows (primary - matches %APPDATA%\Claude\logs)
        allPaths.push(
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Claude', 'logs'),
          join(mount, 'Users', user, 'AppData', 'Local', 'Claude', 'logs'),
          join(mount, 'Users', user, '.claude', 'logs')
        );
        
        // VS Code paths in Windows (more comprehensive)
        allPaths.push(
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Code', 'logs'),
          join(mount, 'Users', user, 'AppData', 'Local', 'Code', 'logs'),
          join(mount, 'Users', user, '.vscode', 'logs'),
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'),
          join(mount, 'Users', user, 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'logs')
        );
        
        // Cursor paths in Windows
        allPaths.push(
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Cursor', 'logs'),
          join(mount, 'Users', user, 'AppData', 'Local', 'Cursor', 'logs'),
          join(mount, 'Users', user, '.cursor', 'logs'),
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage')
        );
        
        // Claude CLI paths in Windows
        allPaths.push(
          join(mount, 'Users', user, '.cache', 'claude-cli-nodejs'),
          join(mount, 'Users', user, 'AppData', 'Local', 'claude-cli-nodejs'),
          join(mount, 'Users', user, 'AppData', 'Roaming', 'claude-cli-nodejs')
        );
        
        // Gemini CLI paths in Windows
        allPaths.push(
          join(mount, 'Users', user, 'AppData', 'Local', 'Gemini CLI', 'projects'),
          join(mount, 'Users', user, 'AppData', 'Local', 'Gemini CLI', 'logs'),
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Gemini CLI', 'projects'),
          join(mount, 'Users', user, 'AppData', 'Roaming', 'Gemini CLI', 'logs'),
          join(mount, 'Users', user, '.gemini-cli', 'projects'),
          join(mount, 'Users', user, '.gemini-cli', 'logs')
        );
        
        // Additional Windows-specific locations
        allPaths.push(
          join(mount, 'ProgramData', 'Claude', 'logs'),
          join(mount, 'ProgramData', 'Cursor', 'logs'),
          join(mount, 'ProgramData', 'Microsoft VS Code', 'logs'),
          join(mount, 'Program Files', 'Microsoft VS Code', 'logs'),
          join(mount, 'Program Files (x86)', 'Microsoft VS Code', 'logs')
        );
      }
    }
    
    console.log(`✅ Added ${windowsMounts.length} Windows mount paths for agent discovery`);
  }
  
  return allPaths;
}

/**
 * Create mock agents for testing purposes
 */
async function createMockAgents(): Promise<AgentConfig[]> {
  const mockAgents: AgentConfig[] = [];
  const mockLogsDir = join(process.cwd(), 'mock-logs');
  
  try {
    // Ensure mock logs directory exists
    await fs.mkdir(mockLogsDir, { recursive: true });
    
    // Create mock log files with sample content
    const mockAgentConfigs = [
      {
        id: 'mock-cursor',
        name: 'Mock Cursor (WSL Test)',
        type: 'cursor',
        logFile: 'cursor-mock.log'
      },
      {
        id: 'mock-claude',
        name: 'Mock Claude (WSL Test)', 
        type: 'claude-code',
        logFile: 'claude-mock.log'
      },
      {
        id: 'mock-vscode',
        name: 'Mock VS Code (WSL Test)',
        type: 'vscode-copilot',
        logFile: 'vscode-mock.log'
      },
      {
        id: 'mock-gemini',
        name: 'Mock Gemini CLI (WSL Test)',
        type: 'gemini-code-assist',
        logFile: 'gemini-mock.log'
      }
    ];
    
    for (const config of mockAgentConfigs) {
      const logFilePath = join(mockLogsDir, config.logFile);
      
      // Create sample log content if file doesn't exist
      try {
        await fs.access(logFilePath);
      } catch {
        const sampleLogs = [
          `[${new Date().toISOString()}] INFO Starting ${config.name}`,
          `[${new Date().toISOString()}] DEBUG Initializing AI capabilities`,
          `[${new Date().toISOString()}] INFO Connected to model service`,
          `[${new Date().toISOString()}] WARN Rate limit approaching`,
          `[${new Date().toISOString()}] INFO Processing user request`,
          `[${new Date().toISOString()}] DEBUG Generating response`,
          `[${new Date().toISOString()}] INFO Response completed`,
        ].join('\n') + '\n';
        
        await fs.writeFile(logFilePath, sampleLogs);
        console.log(`📝 Created mock log file: ${logFilePath}`);
      }
      
      mockAgents.push({
        id: config.id,
        name: config.name,
        type: config.type,
        enabled: true,
        logPaths: [logFilePath],
        logFormat: 'structured',
        filters: ['debug', 'info', 'warn', 'error'],
        metadata: {
          version: '1.0.0',
          lastDiscovered: new Date().toISOString(),
          detectedPath: logFilePath,
          isMock: true,
          isWSL: await isWSL()
        }
      });
    }
    
    console.log(`🎭 Created ${mockAgents.length} mock agents for testing`);
    
  } catch (error) {
    console.warn('❌ Failed to create mock agents:', error);
  }
  
  return mockAgents;
}

/**
 * Configuration for agent discovery
 */
interface AgentDiscoveryConfig {
  enableMockAgents: boolean;
  enableRealAgents: boolean;
  mixedMode: boolean; // Allow both real and mock agents
  forceRealAgents: boolean; // Force real agent detection even if none found
}

const defaultConfig: AgentDiscoveryConfig = {
  enableMockAgents: true,
  enableRealAgents: true,
  mixedMode: false,
  forceRealAgents: false
};

/**
 * Discover available AI agents on the system
 */
export async function discoverAgents(
  config: Partial<AgentDiscoveryConfig> = {},
  databaseService?: any
): Promise<AgentConfig[]> {
  const finalConfig = { ...defaultConfig, ...config };
  const agents: AgentConfig[] = [];

  // Load custom agents from database if available
  if (databaseService) {
    try {
      console.log('📂 Loading custom agents from database...');
      const customLogSources = await databaseService.getCustomAgents();
      const customAgents = customLogSources.map(logSource => 
        databaseService.logSourceToAgentConfig(logSource)
      );
      
      if (customAgents.length > 0) {
        console.log(`✅ Loaded ${customAgents.length} custom agents from database`);
        agents.push(...customAgents);
      }
    } catch (error) {
      console.warn('⚠️ Failed to load custom agents from database:', error);
    }
  }
  
  // Try to detect real agents if enabled
  if (finalConfig.enableRealAgents) {
    console.log('🔍 Scanning for real AI agents on the system...');
    const isWSLEnv = await isWSL();
    console.log(`🏗️  Environment: ${isWSLEnv ? 'WSL' : 'Native'}`);
    
    let realAgentsFound = 0;
    
    try {
      const claudeAgent = await detectClaudeAgent();
      if (claudeAgent) {
        console.log('✅ Found Claude agent at:', claudeAgent.logPaths);
        agents.push(claudeAgent);
        realAgentsFound++;
      }
    } catch (error) {
      console.warn('❌ Claude detection failed:', error);
    }

    try {
      const cursorAgent = await detectCursorAgent();
      if (cursorAgent) {
        console.log('✅ Found Cursor agent at:', cursorAgent.logPaths);
        agents.push(cursorAgent);
        realAgentsFound++;
      }
    } catch (error) {
      console.warn('❌ Cursor detection failed:', error);
    }

    try {
      const vscodeAgent = await detectVSCodeAgent();
      if (vscodeAgent) {
        console.log('✅ Found VS Code agent at:', vscodeAgent.logPaths);
        agents.push(vscodeAgent);
        realAgentsFound++;
      }
    } catch (error) {
      console.warn('❌ VS Code detection failed:', error);
    }

    try {
      const geminiAgent = await detectGeminiAgent();
      if (geminiAgent) {
        console.log('✅ Found Gemini CLI agent at:', geminiAgent.logPaths);
        agents.push(geminiAgent);
        realAgentsFound++;
      }
    } catch (error) {
      console.warn('❌ Gemini CLI detection failed:', error);
    }

    console.log(`🎯 Real agent detection complete: Found ${realAgentsFound} real agents`);
  }

  // Add mock agents if enabled
  if (finalConfig.enableMockAgents) {
    // Create mock agents if no real agents found OR if mixed mode is enabled
    if (agents.length === 0 || finalConfig.mixedMode) {
      console.log('🎭 Adding mock agents for testing...');
      const mockAgents = await createMockAgents();
      agents.push(...mockAgents);
    }
  }

  // Final validation and filtering
  const validatedAgents = await Promise.all(
    agents.map(async (agent) => {
      if (!agent) return null;
      console.log(`[Discovery] Validating agent: ${agent.name}, Initial paths:`, agent.logPaths);
      const validatedAgent = await validateAndFilterLogPaths(agent);
      console.log(`[Discovery] Validated agent: ${agent.name}, Final paths:`, validatedAgent.logPaths);
      return validatedAgent.logPaths.length > 0 ? validatedAgent : null;
    })
  );

  const finalAgents = validatedAgents.filter((agent): agent is AgentConfig => agent !== null);

  console.log(`[Discovery] Total agents after validation: ${finalAgents.length}`);

  // Log final summary
  const realCount = finalAgents.filter(a => !a.metadata?.isMock && !a.metadata?.isCustom).length;
  const mockCount = finalAgents.filter(a => a.metadata?.isMock).length;
  const customCount = finalAgents.filter(a => a.metadata?.isCustom).length;
  const disabledCount = agents.length - finalAgents.length;
  
  console.log(`📊 Agent discovery summary:`);
  console.log(`   Real agents: ${realCount}`);
  console.log(`   Mock agents: ${mockCount}`);
  console.log(`   Custom agents: ${customCount}`);
  console.log(`   Disabled agents: ${disabledCount}`);
  console.log(`   Total valid agents: ${finalAgents.length}`);
  console.log(`   Mixed mode: ${finalConfig.mixedMode ? 'enabled' : 'disabled'}`);

  return finalAgents;
}

/**
 * Detect Claude Code agent
 */
async function detectClaudeAgent(): Promise<AgentConfig | null> {
  const claudePaths = await generateAgentPaths({
    linux: [
      join(homedir(), '.config/claude/logs'),
      join(homedir(), '.claude/logs'),
    ],
    macos: [
      join(homedir(), 'Library/Application Support/Claude/logs'),
      join(homedir(), 'Library/Logs/Claude'),
    ],
    windows: [] // WSL paths are handled in generateAgentPaths
  });

  const allPaths = [...new Set(claudePaths)];
  const logPaths = (await Promise.all(allPaths.map(async (p) => {
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }))).filter((p): p is string => p !== null);

  if (logPaths.length === 0) return null;

  return {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    type: 'claude-code',
    enabled: true,
    logPaths,
    logFormat: 'json',
    filters: ['info', 'warn', 'error'],
    metadata: {
      lastDiscovered: new Date().toISOString(),
      confidence: 80
    },
    auto_discovery: true,
  };
}

/**
 * Detect Cursor agent
 */
async function detectCursorAgent(): Promise<AgentConfig | null> {
  const cursorPaths = await generateAgentPaths({
    linux: [
      join(homedir(), '.config/cursor/logs'),
      join(homedir(), '.cursor/logs'),
    ],
    macos: [
      join(homedir(), 'Library/Application Support/Cursor/logs'),
    ],
    windows: []
  });
  
  const allPaths = [...new Set(cursorPaths)];
  const logPaths = (await Promise.all(allPaths.map(p => findCursorLogFiles(p)))).flat();

  if (logPaths.length === 0) return null;

  return {
    id: 'cursor-ide',
    name: 'Cursor IDE',
    type: 'cursor',
    enabled: true,
    logPaths,
    logFormat: 'structured',
    filters: ['info', 'warn', 'error'],
    metadata: {
      lastDiscovered: new Date().toISOString(),
      confidence: 90
    },
    auto_discovery: true,
  };
}

/**
 * Helper function to find specific Cursor log files or directories.
 * Cursor can have multiple workspace/project specific log folders.
 */
async function findCursorLogFiles(basePath: string): Promise<string[]> {
  const logPaths: string[] = [];
  try {
    await fs.access(basePath);
    // Check for the main log file or directory directly
    logPaths.push(basePath);

    // Also check for workspace-specific storage logs, which is a common pattern
    const workspaceStoragePath = join(basePath, '..', 'User', 'workspaceStorage');
    try {
      await fs.access(workspaceStoragePath);
      const workspaceDirs = await fs.readdir(workspaceStoragePath);
      for (const dir of workspaceDirs) {
        // Look for a cursor-specific log file inside each workspace directory
        const potentialLogPath = join(workspaceStoragePath, dir, 'cursor.log');
        try {
          await fs.access(potentialLogPath);
          logPaths.push(potentialLogPath);
        } catch {
          // Not found in this directory
        }
      }
    } catch {
      // workspaceStoragePath does not exist, which is fine
    }
  } catch {
    // basePath does not exist
  }
  return [...new Set(logPaths)]; // Return unique paths
}

/**
 * Detect VS Code agent
 */
async function detectVSCodeAgent(): Promise<AgentConfig | null> {
  const vscodePaths = await generateAgentPaths({
    linux: [
      join(homedir(), '.config/Code/logs'),
    ],
    macos: [
      join(homedir(), 'Library/Application Support/Code/logs'),
    ],
    windows: []
  });

  const allPaths = [...new Set(vscodePaths)];
  const logPaths: string[] = [];

  for (const p of allPaths) {
    try {
      await fs.access(p);
      // We are interested in extension logs, which are in subdirectories
      const subdirs = await fs.readdir(p);
      for (const subdir of subdirs) {
        if (subdir.startsWith('exthost')) {
          logPaths.push(join(p, subdir));
        }
      }
    } catch {
      // ignore
    }
  }

  if (logPaths.length === 0) return null;

  return {
    id: 'vscode-ide',
    name: 'VS Code IDE',
    type: 'vscode',
    enabled: true,
    logPaths,
    logFormat: 'structured',
    filters: ['info', 'warn', 'error'],
    metadata: {
      lastDiscovered: new Date().toISOString(),
      confidence: 70
    },
    auto_discovery: true,
  };
}

/**
 * Detect Gemini CLI agent
 */
async function detectGeminiAgent(): Promise<AgentConfig | null> {
  const geminiPaths = await generateAgentPaths({
    linux: [
      join(homedir(), '.config/gemini-cli/logs'),
      join(homedir(), '.gemini-cli/logs'),
    ],
    macos: [
      join(homedir(), 'Library/Application Support/gemini-cli/logs'),
    ],
    windows: []
  });

  const allPaths = [...new Set(geminiPaths)];
  const logPaths = (await Promise.all(allPaths.map(async (p) => {
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }))).filter((p): p is string => p !== null);

  if (logPaths.length === 0) return null;

  return {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    type: 'gemini-code-assist',
    enabled: true,
    logPaths,
    logFormat: 'json',
    filters: ['info', 'warn', 'error'],
    metadata: {
      lastDiscovered: new Date().toISOString(),
      confidence: 80
    },
    auto_discovery: true,
  };
}

/**
 * Validate and filter log paths for an agent, removing non-existent paths
 */
export async function validateAndFilterLogPaths(agent: AgentConfig): Promise<AgentConfig> {
  if (!agent.logPaths || agent.logPaths.length === 0) {
    console.log(`⚠️  Agent ${agent.name} has no log paths configured`);
    return { ...agent, logPaths: [] };
  }

  const validPaths: string[] = [];
  const invalidPaths: string[] = [];
  
  console.log(`🔍 Validating ${agent.logPaths.length} log paths for ${agent.name}...`);
  
  for (const logPath of agent.logPaths) {
    try {
      const stat = await fs.stat(logPath);
      if (stat.isDirectory() || stat.isFile()) {
        validPaths.push(logPath);
        console.log(`✅ Valid path: ${logPath}`);
      } else {
        invalidPaths.push(logPath);
        console.log(`❌ Invalid path type: ${logPath}`);
      }
    } catch (error) {
      invalidPaths.push(logPath);
      console.log(`❌ Path does not exist: ${logPath}`);
    }
  }
  
  if (invalidPaths.length > 0) {
    console.log(`⚠️  Removed ${invalidPaths.length} invalid paths for ${agent.name}:`);
    invalidPaths.forEach(path => console.log(`   - ${path}`));
  }
  
  if (validPaths.length === 0) {
    console.log(`❌ No valid log paths found for ${agent.name} - agent will be disabled`);
  } else {
    console.log(`✅ ${validPaths.length} valid paths found for ${agent.name}`);
  }
  
  // Update agent metadata with validation results
  const updatedMetadata = {
    ...agent.metadata,
    lastValidation: new Date().toISOString(),
    validPathCount: validPaths.length,
    invalidPathCount: invalidPaths.length,
    invalidPaths: invalidPaths
  };
  
  return {
    ...agent,
    logPaths: validPaths,
    enabled: validPaths.length > 0 && agent.enabled,
    metadata: updatedMetadata
  };
}

/**
 * Validate agent availability
 */
export async function validateAgentAvailability(agent: AgentConfig): Promise<boolean> {
  try {
    if (!agent.logPaths || agent.logPaths.length === 0) {
      return false;
    }
    
    // Check if at least one log path exists
    for (const logPath of agent.logPaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isDirectory() || stat.isFile()) {
          return true;
        }
      } catch {
        // Continue to next path
        continue;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}