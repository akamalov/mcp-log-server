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

  // Log final summary
  const realCount = agents.filter(a => !a.metadata?.isMock && !a.metadata?.isCustom).length;
  const mockCount = agents.filter(a => a.metadata?.isMock).length;
  const customCount = agents.filter(a => a.metadata?.isCustom).length;
  
  console.log(`📊 Agent discovery summary:`);
  console.log(`   Real agents: ${realCount}`);
  console.log(`   Mock agents: ${mockCount}`);
  console.log(`   Custom agents: ${customCount}`);
  console.log(`   Total agents: ${agents.length}`);
  console.log(`   Mixed mode: ${finalConfig.mixedMode ? 'enabled' : 'disabled'}`);

  return agents;
}

/**
 * Detect Claude Code agent
 */
async function detectClaudeAgent(): Promise<AgentConfig | null> {
  try {
    const results: AgentConfig[] = [];
    
    // Define comprehensive paths for all platforms based on official Claude documentation
    const basePaths = {
      linux: [
        // Claude CLI/MCP logs (primary for Linux/WSL)
        join(homedir(), '.cache', 'claude-cli-nodejs'),
        // VS Code extension logs (secondary)
        join(homedir(), '.vscode-server', 'data', 'logs'),
        join(homedir(), '.vscode', 'logs'),
        // Alternative locations
        join(homedir(), '.claude', 'logs'),
        join(homedir(), '.config', 'claude', 'logs'),
        '/var/log/claude'
      ],
      macos: [
        // Claude Desktop app logs (primary for Mac)
        join(homedir(), 'Library', 'Logs', 'Claude'),
        // Alternative Claude app locations
        join(homedir(), 'Library', 'Application Support', 'Claude', 'logs'),
        // Claude CLI/MCP logs
        join(homedir(), '.cache', 'claude-cli-nodejs'),
        // VS Code extension logs
        join(homedir(), 'Library', 'Application Support', 'Code', 'logs'),
        join(homedir(), 'Library', 'Logs', 'Code'),
        // Alternative locations
        join(homedir(), '.claude', 'logs')
      ],
      windows: [
        // Claude Desktop app logs (primary for Windows)
        join(homedir(), 'AppData', 'Roaming', 'Claude', 'logs'),
        // Alternative Claude app locations
        join(homedir(), 'AppData', 'Local', 'Claude', 'logs'),
        // Claude CLI/MCP logs
        join(homedir(), '.cache', 'claude-cli-nodejs'),
        // VS Code extension logs
        join(homedir(), 'AppData', 'Roaming', 'Code', 'logs'),
        join(homedir(), 'AppData', 'Local', 'Code', 'logs'),
        // Alternative locations
        join(homedir(), '.claude', 'logs')
      ]
    };
    
    const possiblePaths = await generateAgentPaths(basePaths);
    console.log(`🔍 Checking ${possiblePaths.length} potential Claude paths...`);
    
    // 1. Check for Claude Desktop app logs (highest priority - official Claude app)
    const claudeDesktopPaths = possiblePaths.filter(path => 
      (path.includes('/Claude/logs') || path.includes('\\Claude\\logs')) && 
      !path.includes('Code') && !path.includes('claude-cli-nodejs')
    );
    
    for (const logPath of claudeDesktopPaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isDirectory()) {
          console.log(`✅ Found Claude Desktop logs at: ${logPath}`);
          results.push({
            id: 'claude-desktop',
            name: 'Claude Desktop',
            type: 'claude-desktop',
            enabled: true,
            logPaths: [logPath],
            logFormat: 'structured',
            filters: ['debug', 'info', 'warn', 'error'],
            metadata: {
              version: '1.0.0',
              lastDiscovered: new Date().toISOString(),
              detectedPath: logPath,
              isWSL: await isWSL()
            }
          });
        }
      } catch {
        continue;
      }
    }
    
    // 2. Check for Claude CLI MCP logs (second priority - MCP servers)
    const claudeCliPaths = possiblePaths.filter(path => path.includes('claude-cli-nodejs'));
    
    for (const claudeCliPath of claudeCliPaths) {
      try {
        const stat = await fs.stat(claudeCliPath);
        if (stat.isDirectory()) {
          console.log(`📁 Found Claude CLI cache at: ${claudeCliPath}`);
          
          const mcpLogPaths = await findClaudeMCPLogs(claudeCliPath);
          if (mcpLogPaths.length > 0) {
            console.log(`✅ Found ${mcpLogPaths.length} Claude MCP log directories`);
            results.push({
              id: 'claude-mcp-cli',
              name: `Claude MCP (${mcpLogPaths.length} servers)`,
              type: 'claude-mcp',
              enabled: true,
              logPaths: mcpLogPaths,
              logFormat: 'claude-mcp-json',
              filters: ['info', 'warn', 'error'],
              metadata: {
                version: '1.0.0',
                lastDiscovered: new Date().toISOString(),
                detectedPath: claudeCliPath,
                mcpLogCount: mcpLogPaths.length,
                isWSL: await isWSL()
              }
            });
          }
        }
      } catch (error) {
        console.log(`⚠️  Could not access Claude CLI cache at ${claudeCliPath}: ${error.message}`);
      }
    }
    
    // 3. Check for VS Code Claude extension logs (third priority - extension logs)
    const vscodeLogDirs = possiblePaths.filter(path => 
      path.includes('.vscode-server') || path.includes('.vscode') || path.includes('Code')
    );
    
    for (const logDir of vscodeLogDirs) {
      try {
        const stat = await fs.stat(logDir);
        if (stat.isDirectory()) {
          const claudeLogPath = await findClaudeExtensionLogs(logDir);
          if (claudeLogPath) {
            console.log(`✅ Found Claude Code extension logs at: ${claudeLogPath}`);
            results.push({
              id: 'claude-code-extension',
              name: 'Claude Code (VS Code Extension)',
              type: 'claude-code',
              enabled: true,
              logPaths: [claudeLogPath],
              logFormat: 'vscode-extension',
              filters: ['debug', 'info', 'warn', 'error'],
              metadata: {
                version: '1.0.0',
                lastDiscovered: new Date().toISOString(),
                detectedPath: claudeLogPath,
                isVSCodeExtension: true,
                isWSL: await isWSL()
              }
            });
          }
        }
      } catch {
        continue;
      }
    }
    
    // Return the best available result with preference for Claude CLI
    if (results.length > 0) {
      // Prefer Claude CLI/MCP if it has significant activity (multiple log directories)
      const claudeCliAgent = results.find(r => r.id === 'claude-mcp-cli' && r.logPaths.length >= 5);
      if (claudeCliAgent) {
        console.log(`🎯 Selected Claude agent: ${claudeCliAgent.name} (${claudeCliAgent.logPaths.length} log paths) - CLI preferred`);
        return claudeCliAgent;
      }
      
      // Otherwise, return the first (highest priority) result
      const chosen = results[0];
      console.log(`🎯 Selected Claude agent: ${chosen.name} (${chosen.logPaths.length} log paths)`);
      return chosen;
    }
    
    console.log('⚠️  No Claude installation found');
  } catch (error) {
    console.warn('Failed to detect Claude agent:', error);
  }
  
  return null;
}

/**
 * Find Claude MCP logs in Claude CLI cache directory
 */
async function findClaudeMCPLogs(claudeCliPath: string): Promise<string[]> {
  const mcpLogPaths: string[] = [];
  
  try {
    // List all project directories in Claude CLI cache
    const projectDirs = await fs.readdir(claudeCliPath);
    
    for (const projectDir of projectDirs) {
      const projectPath = join(claudeCliPath, projectDir);
      
      try {
        const stat = await fs.stat(projectPath);
        if (stat.isDirectory()) {
          // Look for mcp-logs-* directories
          const projectContents = await fs.readdir(projectPath);
          const mcpDirs = projectContents.filter(dir => dir.startsWith('mcp-logs-'));
          
          for (const mcpDir of mcpDirs) {
            const mcpLogDir = join(projectPath, mcpDir);
            
            try {
              const mcpStat = await fs.stat(mcpLogDir);
              if (mcpStat.isDirectory()) {
                // Check if directory contains .txt log files
                const logFiles = await fs.readdir(mcpLogDir);
                const txtFiles = logFiles.filter(file => file.endsWith('.txt'));
                
                if (txtFiles.length > 0) {
                  console.log(`📝 Found MCP logs in: ${mcpLogDir} (${txtFiles.length} files)`);
                  mcpLogPaths.push(mcpLogDir);
                }
              }
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.warn('Failed to scan Claude MCP logs:', error);
  }
  
  return mcpLogPaths;
}

/**
 * Find Claude Code extension logs in VS Code log directory
 */
async function findClaudeExtensionLogs(vscodeLogDir: string): Promise<string | null> {
  try {
    // VS Code creates dated log directories like: 20250619T161147
    const logSessions = await fs.readdir(vscodeLogDir);
    
    // Sort by date (newest first) and look for Claude extension logs
    const sortedSessions = logSessions
      .filter(session => session.match(/^\d{8}T\d{6}$/))
      .sort((a, b) => b.localeCompare(a));
    
    for (const session of sortedSessions) {
      // Check multiple possible extension directory structures
      const possibleClaudeExtPaths = [
        join(vscodeLogDir, session, 'exthost1', 'Anthropic.claude-code'),
        join(vscodeLogDir, session, 'exthost', 'Anthropic.claude-code'),
        join(vscodeLogDir, session, 'extensions', 'Anthropic.claude-code'),
        join(vscodeLogDir, session, 'Anthropic.claude-code')
      ];
      
      for (const claudeExtPath of possibleClaudeExtPaths) {
        try {
          const stat = await fs.stat(claudeExtPath);
          if (stat.isDirectory()) {
            // Check if there are actual log files
            const logFiles = await fs.readdir(claudeExtPath);
            const claudeLogFiles = logFiles.filter(file => 
              (file.includes('Claude') || file.includes('claude')) && file.endsWith('.log')
            );
            
            if (claudeLogFiles.length > 0) {
              // Return the full path to the log file, not just the directory
              const latestLogFile = claudeLogFiles[claudeLogFiles.length - 1];
              return join(claudeExtPath, latestLogFile);
            }
          }
        } catch {
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to find Claude extension logs:', error);
  }
  
  return null;
}

/**
 * Detect Cursor agent
 */
async function detectCursorAgent(): Promise<AgentConfig | null> {
  try {
    const basePaths = {
      linux: [
        join(homedir(), '.cursor', 'logs'),
        join(homedir(), '.config', 'Cursor', 'logs'),
      ],
      macos: [
        join(homedir(), 'Library', 'Application Support', 'Cursor', 'logs'),
        join(homedir(), 'Library', 'Logs', 'Cursor'),
      ],
      windows: [
        join(homedir(), 'AppData', 'Roaming', 'Cursor', 'logs'),
        join(homedir(), 'AppData', 'Local', 'Cursor', 'logs'),
      ]
    };
    
    const possiblePaths = await generateAgentPaths(basePaths);
    console.log(`🔍 Checking ${possiblePaths.length} potential Cursor paths...`);
    
    for (const logPath of possiblePaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isDirectory()) {
          console.log(`📁 Found Cursor logs directory at: ${logPath}`);
          
          // Cursor organizes logs in date-specific subdirectories like VS Code
          const cursorLogFiles = await findCursorLogFiles(logPath);
          
          if (cursorLogFiles.length > 0) {
            console.log(`✅ Found ${cursorLogFiles.length} Cursor log files`);
            return {
              id: 'cursor',
              name: 'Cursor',
              type: 'cursor',
              enabled: true,
              logPaths: cursorLogFiles,
              logFormat: 'mixed',
              filters: ['info', 'warn', 'error'],
              metadata: {
                version: '1.0.0',
                lastDiscovered: new Date().toISOString(),
                detectedPath: logPath,
                logFiles: cursorLogFiles,
                isWSL: await isWSL()
              }
            };
          }
        }
      } catch {
        continue;
      }
    }
    
    console.log('⚠️  No Cursor installation found');
  } catch (error) {
    console.warn('Failed to detect Cursor agent:', error);
  }
  
  return null;
}

/**
 * Find Cursor log files in log directory structure
 */
async function findCursorLogFiles(cursorLogDir: string): Promise<string[]> {
  try {
    const logFiles: string[] = [];
    
    // Cursor creates dated log directories like: 20250703T120659
    const logSessions = await fs.readdir(cursorLogDir);
    
    // Sort by date (newest first) and look for log files
    const sortedSessions = logSessions
      .filter(session => session.match(/^\d{8}T\d{6}$/))
      .sort((a, b) => b.localeCompare(a));
    
    // Check recent sessions for log files
    for (const session of sortedSessions.slice(0, 10)) { // Check last 10 sessions (increased from 5 to find older MCP logs)
      const sessionPath = join(cursorLogDir, session);
      try {
        const stat = await fs.stat(sessionPath);
        if (stat.isDirectory()) {
          // First, add main session log files
          const sessionFiles = await fs.readdir(sessionPath);
          
          for (const file of sessionFiles) {
            if (file.endsWith('.log')) {
              const fullPath = join(sessionPath, file);
              logFiles.push(fullPath);
              console.log(`📝 Found Cursor log: ${file} in session ${session}`);
            }
          }
          
          // Then, check for window subdirectories with MCP extension logs
          const windowDirs = sessionFiles.filter(file => file.startsWith('window'));
          for (const windowDir of windowDirs) {
            const windowPath = join(sessionPath, windowDir);
            try {
              const windowStat = await fs.stat(windowPath);
              if (windowStat.isDirectory()) {
                // Check for exthost directory
                const exthostPath = join(windowPath, 'exthost');
                try {
                  const exthostStat = await fs.stat(exthostPath);
                  if (exthostStat.isDirectory()) {
                    // Look for MCP extension directories (anysphere.*)
                    const exthostContents = await fs.readdir(exthostPath);
                    
                    for (const item of exthostContents) {
                      // Check for anysphere extensions or MCP-related directories
                      if (item.startsWith('anysphere.') || item.includes('mcp') || item.includes('retrieval') || item.includes('memento') || item.includes('review-gate')) {
                        const extensionPath = join(exthostPath, item);
                        try {
                          const extensionStat = await fs.stat(extensionPath);
                          if (extensionStat.isDirectory()) {
                            // Add all log files in this extension directory
                            const extensionFiles = await fs.readdir(extensionPath);
                            for (const extFile of extensionFiles) {
                              if (extFile.endsWith('.log')) {
                                const extLogPath = join(extensionPath, extFile);
                                logFiles.push(extLogPath);
                                console.log(`🔌 Found Cursor MCP extension log: ${item}/${extFile} in session ${session}`);
                              }
                            }
                          }
                        } catch {
                          continue;
                        }
                      }
                    }
                    
                    // Also check general exthost logs that might contain MCP communication
                    const generalExthostFiles = exthostContents.filter(file => file.endsWith('.log'));
                    for (const exthostFile of generalExthostFiles) {
                      const exthostLogPath = join(exthostPath, exthostFile);
                      logFiles.push(exthostLogPath);
                      console.log(`📡 Found Cursor exthost log: ${exthostFile} in session ${session}`);
                    }
                  }
                } catch {
                  // No exthost directory, continue
                }
                
                // Also check window-level logs
                const windowFiles = await fs.readdir(windowPath);
                for (const windowFile of windowFiles) {
                  if (windowFile.endsWith('.log')) {
                    const windowLogPath = join(windowPath, windowFile);
                    logFiles.push(windowLogPath);
                    console.log(`🪟 Found Cursor window log: ${windowFile} in session ${session}`);
                  }
                }
              }
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }
    
    console.log(`📊 Found total of ${logFiles.length} Cursor log files across ${Math.min(sortedSessions.length, 10)} sessions`);
    return logFiles;
  } catch (error) {
    console.warn('Failed to find Cursor log files:', error);
    return [];
  }
}

/**
 * Detect VS Code agent
 */
async function detectVSCodeAgent(): Promise<AgentConfig | null> {
  try {
    const basePaths = {
      linux: [
        join(homedir(), '.vscode', 'logs'),
        join(homedir(), '.config', 'Code', 'logs'),
      ],
      macos: [
        join(homedir(), 'Library', 'Application Support', 'Code', 'logs'),
        join(homedir(), 'Library', 'Logs', 'Code'),
      ],
      windows: [
        join(homedir(), 'AppData', 'Roaming', 'Code', 'logs'),
        join(homedir(), 'AppData', 'Local', 'Code', 'logs'),
      ]
    };
    
    const possiblePaths = await generateAgentPaths(basePaths);
    console.log(`🔍 Checking ${possiblePaths.length} potential VS Code paths...`);
    
    for (const logPath of possiblePaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isDirectory()) {
          console.log(`✅ Found VS Code logs at: ${logPath}`);
          return {
            id: 'vscode',
            name: 'VS Code',
            type: 'vscode-copilot',
            enabled: true,
            logPaths: [logPath],
            logFormat: 'structured',
            filters: ['info', 'warn', 'error'],
            metadata: {
              version: '1.0.0',
              lastDiscovered: new Date().toISOString(),
              detectedPath: logPath,
              isWSL: await isWSL()
            }
          };
        }
      } catch {
        continue;
      }
    }
    
    console.log('⚠️  No VS Code installation found');
  } catch (error) {
    console.warn('Failed to detect VS Code agent:', error);
  }
  
  return null;
}

/**
 * Detect Gemini CLI agent
 */
async function detectGeminiAgent(): Promise<AgentConfig | null> {
  try {
    // Define comprehensive paths for all platforms following XDG Base Directory Specification
    const basePaths = {
      linux: [
        // Following XDG Base Directory Specification  
        join(homedir(), '.local', 'share', 'gemini-cli', 'projects'),
        join(homedir(), '.local', 'share', 'gemini-cli', 'logs'),
        // Alternative locations
        join(homedir(), '.config', 'gemini-cli', 'projects'),
        join(homedir(), '.config', 'gemini-cli', 'logs'),
        join(homedir(), '.gemini-cli', 'projects'),
        join(homedir(), '.gemini-cli', 'logs'),
        '/var/log/gemini-cli'
      ],
      macos: [
        // macOS Application Support directory
        join(homedir(), 'Library', 'Application Support', 'Gemini CLI', 'projects'),
        join(homedir(), 'Library', 'Application Support', 'Gemini CLI', 'logs'),
        // Alternative locations
        join(homedir(), 'Library', 'Logs', 'Gemini CLI'),
        join(homedir(), '.gemini-cli', 'projects'),
        join(homedir(), '.gemini-cli', 'logs')
      ],
      windows: [
        // Windows AppData directories
        join(homedir(), 'AppData', 'Local', 'Gemini CLI', 'projects'),
        join(homedir(), 'AppData', 'Local', 'Gemini CLI', 'logs'),
        join(homedir(), 'AppData', 'Roaming', 'Gemini CLI', 'projects'),
        join(homedir(), 'AppData', 'Roaming', 'Gemini CLI', 'logs'),
        // Alternative locations
        join(homedir(), '.gemini-cli', 'projects'),
        join(homedir(), '.gemini-cli', 'logs')
      ]
    };
    
    const possiblePaths = await generateAgentPaths(basePaths);
    console.log(`🔍 Checking ${possiblePaths.length} potential Gemini CLI paths...`);
    
    const logPaths: string[] = [];
    
    for (const logPath of possiblePaths) {
      try {
        const stat = await fs.stat(logPath);
        if (stat.isDirectory()) {
          console.log(`✅ Found Gemini CLI directory at: ${logPath}`);
          logPaths.push(logPath);
        }
      } catch {
        continue;
      }
    }
    
    if (logPaths.length > 0) {
      console.log(`✅ Found Gemini CLI with ${logPaths.length} log directories`);
      return {
        id: 'gemini-cli',
        name: 'Gemini CLI',
        type: 'gemini-code-assist',
        enabled: true,
        logPaths,
        logFormat: 'structured',
        filters: ['debug', 'info', 'warn', 'error'],
        metadata: {
          version: '1.0.0',
          lastDiscovered: new Date().toISOString(),
          detectedPaths: logPaths,
          pathCount: logPaths.length,
          isWSL: await isWSL()
        }
      };
    }
    
    console.log('⚠️  No Gemini CLI installation found');
  } catch (error) {
    console.warn('Failed to detect Gemini CLI agent:', error);
  }
  
  return null;
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

/**
 * Get agent status
 */
export async function getAgentStatus(agentId: string): Promise<{ available: boolean; lastSeen?: Date }> {
  const agents = await discoverAgents();
  const agent = agents.find(a => a.id === agentId);
  
  if (!agent) {
    return { available: false };
  }
  
  const available = await validateAgentAvailability(agent);
  return {
    available,
    lastSeen: agent.metadata?.lastDiscovered ? new Date(agent.metadata.lastDiscovered as string) : undefined
  };
} 