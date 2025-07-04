import { watch, FSWatcher, promises as fs } from 'fs';
import { join, basename } from 'path';
import { EventEmitter } from 'events';
import type { AgentConfig, LogEntry } from '@mcp-log-server/types';
import { LogsService } from './logs.service.js';

interface WatchedFile {
  agentId: string;
  filePath: string;
  parser: string;
  watcher: FSWatcher;
  isHealthy: boolean;
  errorCount: number;
  lastActivity: Date;
  position: number;
}

export class LogWatcherService extends EventEmitter {
  private watchers = new Map<string, WatchedFile>();
  private logsService: LogsService;
  private isRunning = false;
  private isWSLEnv = false;

  constructor(logsService: LogsService) {
    super();
    this.logsService = logsService;
    this.checkWSLEnvironment();
  }

  /**
   * Check if we're running in WSL environment
   */
  private async checkWSLEnvironment(): Promise<void> {
    try {
      const procVersion = await fs.readFile('/proc/version', 'utf8');
      this.isWSLEnv = procVersion.toLowerCase().includes('microsoft') || procVersion.toLowerCase().includes('wsl');
      
      if (this.isWSLEnv) {
        console.log('🔍 WSL environment detected in log watcher');
      }
    } catch (error) {
      // Not a Linux system or can't read /proc/version
      this.isWSLEnv = false;
    }
  }

  /**
   * Start monitoring log files for the given agents
   */
  async startWatching(agents: AgentConfig[]): Promise<void> {
    if (this.isRunning) {
      console.log('🔍 Log watcher already running');
      return;
    }

    console.log(`🚀 Starting log watcher for ${agents.length} agents...`);
    if (this.isWSLEnv) {
      console.log('⚠️  WSL environment detected - may have reduced performance for Windows filesystem access');
    }
    
    this.isRunning = true;

    for (const agent of agents) {
      await this.watchAgent(agent);
    }

    console.log(`✅ Log watcher started for ${this.watchers.size} log files`);
  }

  /**
   * Stop all file watchers
   */
  async stopWatching(): Promise<void> {
    console.log('🛑 Stopping log watchers...');
    
    for (const [path, watchedFile] of this.watchers) {
      try {
        watchedFile.watcher.close();
        console.log(`✅ Stopped watching: ${path}`);
      } catch (error) {
        console.warn(`❌ Failed to close watcher for ${path}:`, error);
      }
    }

    this.watchers.clear();
    this.isRunning = false;
    console.log('✅ All log watchers stopped');
  }

  /**
   * Set up file watchers for a specific agent
   */
  private async watchAgent(agent: AgentConfig): Promise<void> {
    console.log(`🔍 Setting up watchers for ${agent.name} (${agent.id})...`);

    if (!agent.logPaths || agent.logPaths.length === 0) {
      console.log(`⚠️  No log paths configured for ${agent.name}`);
      return;
    }

    for (const logPath of agent.logPaths) {
      try {
        await this.watchLogPath(logPath, agent);
      } catch (error) {
        console.warn(`❌ Failed to watch ${logPath} for ${agent.name}:`, error);
        
        // In WSL, if watching a Windows path fails, suggest alternatives
        if (this.isWSLEnv && logPath.startsWith('/mnt/')) {
          console.log(`💡 WSL Tip: Windows filesystem access may be limited. Consider copying logs to WSL filesystem for better performance.`);
        }
      }
    }
  }

  /**
   * Watch a specific log path (file or directory) with WSL-aware error handling
   */
  private async watchLogPath(logPath: string, agent: AgentConfig): Promise<void> {
    try {
      const stat = await fs.stat(logPath);
      
      if (stat.isDirectory()) {
        await this.watchLogDirectory(logPath, agent);
      } else if (stat.isFile()) {
        await this.watchLogFile(logPath, agent);
      }
    } catch (error) {
      // Path doesn't exist yet, try to watch parent directory
      console.log(`📁 Path ${logPath} doesn't exist, will monitor for creation...`);
      
      // Special handling for WSL Windows mounts
      if (this.isWSLEnv && logPath.startsWith('/mnt/')) {
        console.log(`🔍 WSL: Attempting to watch Windows path creation: ${logPath}`);
      }
      
      await this.watchForCreation(logPath, agent);
    }
  }

  /**
   * Watch all log files in a directory with WSL considerations
   */
  private async watchLogDirectory(dirPath: string, agent: AgentConfig): Promise<void> {
    try {
      const files = await fs.readdir(dirPath);
      const logFiles = files.filter(file => this.isLogFile(file));

      console.log(`📂 Found ${logFiles.length} log files in ${dirPath}`);

      for (const file of logFiles) {
        const filePath = join(dirPath, file);
        await this.watchLogFile(filePath, agent);
      }

      // Watch for new files in the directory with WSL-aware options
      const watchOptions: any = { persistent: true };
      
      // For WSL Windows mounts, use polling for better reliability
      if (this.isWSLEnv && dirPath.startsWith('/mnt/')) {
        console.log(`🔍 WSL: Using polling mode for Windows directory: ${dirPath}`);
        // Note: fs.watch doesn't support usePolling directly, but we can catch errors gracefully
      }

      const dirWatcher = watch(dirPath, watchOptions, async (eventType, filename) => {
        if (filename && this.isLogFile(filename)) {
          const filePath = join(dirPath, filename);
          console.log(`📝 New log file detected: ${filePath}`);
          
          if (eventType === 'rename') {
            // File created or deleted
            try {
              await fs.access(filePath);
              await this.watchLogFile(filePath, agent);
            } catch {
              // File was deleted, remove watcher
              await this.stopWatchingFile(filePath);
            }
          }
        }
      });

      dirWatcher.on('error', (error) => {
        console.warn(`❌ Directory watcher error for ${dirPath}:`, error);
        if (this.isWSLEnv && dirPath.startsWith('/mnt/')) {
          console.log(`💡 WSL: Consider copying files to native filesystem for more reliable watching`);
        }
      });

      console.log(`👀 Watching directory: ${dirPath}`);
    } catch (error) {
      console.warn(`❌ Failed to watch directory ${dirPath}:`, error);
    }
  }

  /**
   * Watch a specific log file for changes with WSL optimizations
   */
  private async watchLogFile(filePath: string, agent: AgentConfig): Promise<void> {
    if (this.watchers.has(filePath)) {
      console.log(`⚠️  Already watching: ${filePath}`);
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      const position = stat.size; // Start reading from current end

      const watchOptions: any = { persistent: true };

      const watcher = watch(filePath, watchOptions, async (eventType) => {
        if (eventType === 'change') {
          try {
            await this.processLogFileChanges(filePath, agent);
          } catch (error) {
            console.warn(`❌ Error processing log changes for ${filePath}:`, error);
          }
        }
      });

      // Add error handling for WSL scenarios
      watcher.on('error', (error) => {
        console.warn(`❌ File watcher error for ${filePath}:`, error);
        
        if (this.isWSLEnv && filePath.startsWith('/mnt/')) {
          console.log(`💡 WSL: Windows file watching may be unreliable. Consider periodic polling for: ${filePath}`);
          // Could implement fallback polling here
          this.setupPollingFallback(filePath, agent);
        }
      });

      this.watchers.set(filePath, {
        agentId: agent.id,
        filePath,
        parser: 'basic-line-parser',
        watcher,
        isHealthy: true,
        errorCount: 0,
        lastActivity: new Date(),
        position
      });

      console.log(`👀 Watching log file: ${filePath} (from position ${position})`);
      
      // For WSL Windows paths, automatically enable polling fallback for reliability
      if (this.isWSLEnv && filePath.startsWith('/mnt/')) {
        console.log(`🔍 WSL: Watching Windows file - enabling polling fallback for reliability`);
        this.setupPollingFallback(filePath, agent);
      }

      // Process any existing content (but don't await to avoid hanging)
      setImmediate(() => {
        this.processLogFileChanges(filePath, agent).catch(error => {
          console.warn(`❌ Error processing initial log content for ${filePath}:`, error);
        });
      });

    } catch (error) {
      console.warn(`❌ Failed to watch file ${filePath}:`, error);
    }
  }

  /**
   * Setup polling fallback for unreliable WSL file watching
   */
  private setupPollingFallback(filePath: string, agent: AgentConfig): void {
    const pollInterval = 2000; // 2 seconds
    
    const pollingTimer = setInterval(async () => {
      try {
        await this.processLogFileChanges(filePath, agent);
      } catch (error) {
        console.warn(`❌ Polling fallback error for ${filePath}:`, error);
        clearInterval(pollingTimer);
      }
    }, pollInterval);
    
    console.log(`🔄 Started polling fallback for ${filePath} (${pollInterval}ms interval)`);
    
    // Clean up polling when watcher is removed
    const watchedFile = this.watchers.get(filePath);
    if (watchedFile) {
      const originalClose = watchedFile.watcher.close.bind(watchedFile.watcher);
      watchedFile.watcher.close = () => {
        clearInterval(pollingTimer);
        originalClose();
      };
    }
  }

  /**
   * Watch for file/directory creation
   */
  private async watchForCreation(targetPath: string, agent: AgentConfig): Promise<void> {
    const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    
    try {
      await fs.access(parentDir);
      
      const watcher = watch(parentDir, { persistent: true }, async (eventType, filename) => {
        if (filename && targetPath.endsWith(filename)) {
          console.log(`📝 Target path created: ${targetPath}`);
          watcher.close();
          await this.watchLogPath(targetPath, agent);
        }
      });

      console.log(`👀 Watching for creation: ${targetPath}`);
    } catch (error) {
      console.warn(`❌ Cannot watch for creation of ${targetPath}:`, error);
    }
  }

  /**
   * Process new content in a log file
   */
  private async processLogFileChanges(filePath: string, agent: AgentConfig): Promise<void> {
    const watchedFile = this.watchers.get(filePath);
    if (!watchedFile) return;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size <= watchedFile.position) {
        return; // No new content
      }

      // Special handling for Claude MCP JSON files - read entire file
      if (agent.logFormat === 'claude-mcp-json' && agent.type === 'claude-mcp') {
        await this.processClaudeMCPJsonFile(filePath, agent, watchedFile);
        return;
      }

      const fd = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(stat.size - watchedFile.position);
      await fd.read(buffer, 0, buffer.length, watchedFile.position);
      await fd.close();

      const newContent = buffer.toString('utf8');
      const lines = newContent.split('\n').filter(line => line.trim());

      if (lines.length > 0) {
        console.log(`📖 Processing ${lines.length} new log lines from ${basename(filePath)}`);

        for (const line of lines) {
          const logEntry = this.parseLogLine(line, agent, filePath);
          if (logEntry) {
            await this.logsService.ingestLog(logEntry);
            this.emit('log-entry', logEntry);
          }
        }
      }

      // Update position and last activity
      watchedFile.position = stat.size;
      watchedFile.lastActivity = new Date();

    } catch (error) {
      console.warn(`❌ Failed to process log changes for ${filePath}:`, error);
      watchedFile.errorCount++;
      watchedFile.isHealthy = watchedFile.errorCount < 5;
    }
  }

  /**
   * Process Claude MCP JSON files - read entire file as JSON array
   */
  private async processClaudeMCPJsonFile(filePath: string, agent: AgentConfig, watchedFile: any): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Parse as JSON array
      const jsonArray = JSON.parse(content);
      
      if (Array.isArray(jsonArray)) {
        // Process each JSON object in the array
        for (const jsonObj of jsonArray) {
          const logEntry = this.parseClaudeMCPJsonLog(JSON.stringify(jsonObj), agent, filePath);
          if (logEntry) {
            await this.logsService.ingestLog(logEntry);
            this.emit('log-entry', logEntry);
          }
        }
        
        console.log(`📖 Processed ${jsonArray.length} Claude MCP JSON entries from ${basename(filePath)}`);
      } else {
        // Single JSON object
        const logEntry = this.parseClaudeMCPJsonLog(content, agent, filePath);
        if (logEntry) {
          await this.logsService.ingestLog(logEntry);
          this.emit('log-entry', logEntry);
        }
        
        console.log(`📖 Processed 1 Claude MCP JSON entry from ${basename(filePath)}`);
      }
      
      // Update position and last activity
      const stat = await fs.stat(filePath);
      watchedFile.position = stat.size;
      watchedFile.lastActivity = new Date();
      
    } catch (error) {
      console.warn(`❌ Failed to process Claude MCP JSON file ${filePath}:`, error);
      watchedFile.errorCount++;
      watchedFile.isHealthy = watchedFile.errorCount < 5;
    }
  }

  /**
   * Parse a log line into a LogEntry
   */
  private parseLogLine(line: string, agent: AgentConfig, filePath: string): LogEntry | null {
    try {
      // Special handling for Claude MCP JSON logs
      if (agent.logFormat === 'claude-mcp-json' && agent.type === 'claude-mcp') {
        return this.parseClaudeMCPJsonLog(line, agent, filePath);
      }
      
      // Special handling for VS Code extension logs (Claude Code format)
      if ((agent.logFormat === 'vscode-extension' || agent.metadata?.isVSCodeExtension) && 
          (filePath.includes('Anthropic.claude-code') || filePath.includes('Claude Code'))) {
        return this.parseVSCodeExtensionLog(line, agent, filePath);
      }
      
      // Special handling for Cursor MCP extension logs
      if (agent.type === 'cursor' && (filePath.includes('anysphere.') || filePath.includes('exthost'))) {
        return this.parseCursorMCPLog(line, agent, filePath);
      }
      
      // Basic log parsing - can be enhanced per agent type
      const timestamp = new Date().toISOString();
      const logId = `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Try to detect log level
      let level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info';
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('error') || lowerLine.includes('err')) level = 'error';
      else if (lowerLine.includes('warn') || lowerLine.includes('warning')) level = 'warn';
      else if (lowerLine.includes('debug') || lowerLine.includes('trace')) level = 'debug';
      else if (lowerLine.includes('fatal') || lowerLine.includes('critical')) level = 'fatal';

      return {
        id: logId,
        timestamp,
        level,
        message: line.trim(),
        source: `${agent.id}-${basename(filePath)}`,
        agentType: agent.type,
        sessionId: `session-${agent.id}`,
        metadata: {
          filePath,
          agentName: agent.name,
          parser: 'basic-line-parser'
        },
        raw: line
      };

    } catch (error) {
      console.warn(`❌ Failed to parse log line: ${line.substring(0, 100)}...`, error);
      return null;
    }
  }

  /**
   * Parse Claude MCP JSON logs
   * Format: JSON objects with error, timestamp, sessionId, cwd fields
   */
  private parseClaudeMCPJsonLog(line: string, agent: AgentConfig, filePath: string): LogEntry | null {
    try {
      // Parse the JSON content
      const jsonData = JSON.parse(line.trim());
      
      // Extract common fields
      const timestamp = jsonData.timestamp || new Date().toISOString();
      const sessionId = jsonData.sessionId || `claude-mcp-${Date.now()}`;
      const logId = `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Determine log level from content
      let level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info';
      let message = '';
      
      if (jsonData.error) {
        level = 'error';
        message = `Error: ${jsonData.error}`;
      } else if (jsonData.message) {
        message = jsonData.message;
        // Try to detect level from message
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('error')) level = 'error';
        else if (lowerMessage.includes('warn')) level = 'warn';
        else if (lowerMessage.includes('debug')) level = 'debug';
      } else if (jsonData.event) {
        message = `Event: ${jsonData.event}`;
        level = 'info';
      } else {
        message = `MCP Event: ${JSON.stringify(jsonData)}`;
      }
      
      // Extract MCP server name from file path
      const mcpServerMatch = filePath.match(/mcp-logs-([^/]+)/);
      const mcpServer = mcpServerMatch ? mcpServerMatch[1] : 'unknown';
      
      return {
        id: logId,
        timestamp,
        level,
        message: message.trim(),
        source: `claude-mcp-${mcpServer}`,
        agentType: agent.type,
        sessionId,
        metadata: {
          filePath,
          agentName: agent.name,
          parser: 'claude-mcp-json-parser',
          isClaudeMCP: true,
          mcpServer,
          cwd: jsonData.cwd,
          mcpData: jsonData
        },
        raw: line
      };
      
    } catch (error) {
      console.warn(`❌ Failed to parse Claude MCP JSON log: ${line.substring(0, 100)}...`, error);
      
      // If JSON parsing fails, try to treat as regular log line
      return this.parseBasicLogLine(line, agent, filePath);
    }
  }

  /**
   * Parse VS Code extension logs (Claude Code format)
   * Format: 2025-06-19 16:11:50.402 [info] Claude code extension is now active!
   */
  private parseVSCodeExtensionLog(line: string, agent: AgentConfig, filePath: string): LogEntry | null {
    try {
      // Match VS Code extension log format: YYYY-MM-DD HH:MM:SS.mmm [level] message
      const vscodeLogPattern = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(\w+)\] (.+)$/;
      const match = line.match(vscodeLogPattern);
      
      if (match) {
        const [, timestampStr, levelStr, message] = match;
        const timestamp = new Date(timestampStr).toISOString();
        const level = this.mapVSCodeLogLevel(levelStr);
        const logId = `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Extract MCP-specific metadata
        const mcpMetadata = this.extractMCPMetadata(message);

        return {
          id: logId,
          timestamp,
          level,
          message: message.trim(),
          source: `claude-code-extension`,
          agentType: agent.type,
          sessionId: this.extractSessionId(message, agent.id),
          metadata: {
            filePath,
            agentName: agent.name,
            parser: 'vscode-extension-parser',
            isVSCodeExtension: true,
            originalLevel: levelStr,
            ...mcpMetadata
          },
          raw: line
        };
      }
      
      // If it doesn't match the expected format, fall back to basic parsing
      return this.parseBasicLogLine(line, agent, filePath);
      
    } catch (error) {
      console.warn(`❌ Failed to parse VS Code extension log: ${line.substring(0, 100)}...`, error);
      return null;
    }
  }

  /**
   * Map VS Code log levels to our standard levels
   */
  private mapVSCodeLogLevel(vscodeLevel: string): 'debug' | 'info' | 'warn' | 'error' | 'fatal' {
    switch (vscodeLevel.toLowerCase()) {
      case 'trace':
      case 'debug':
        return 'debug';
      case 'info':
        return 'info';
      case 'warn':
      case 'warning':
        return 'warn';
      case 'error':
        return 'error';
      case 'fatal':
      case 'critical':
        return 'fatal';
      default:
        return 'info';
    }
  }

  /**
   * Extract MCP-specific metadata from log messages
   */
  private extractMCPMetadata(message: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // MCP Server port detection
    const portMatch = message.match(/MCP Server running on port (\d+)/);
    if (portMatch) {
      metadata.mcpServerPort = parseInt(portMatch[1], 10);
      metadata.mcpServerStatus = 'running';
    }
    
    // WebSocket connection detection
    if (message.includes('New WS connection') || message.includes('WS client disconnected')) {
      metadata.connectionType = 'websocket';
      metadata.connectionEvent = message.includes('New WS') ? 'connected' : 'disconnected';
    }
    
    // MCP transport detection
    if (message.includes('MCP server connected to transport')) {
      metadata.mcpTransport = 'connected';
    }
    
    // Diagnostic streaming detection
    if (message.includes('DiagnosticStreamManager')) {
      metadata.diagnosticStream = true;
      const clientMatch = message.match(/client_(\d+)/);
      if (clientMatch) {
        metadata.clientId = clientMatch[1];
      }
    }
    
    // Claude command detection
    if (message.includes('run_claude_command')) {
      metadata.claudeCommand = true;
    }
    
    return metadata;
  }

  /**
   * Extract session ID from log messages
   */
  private extractSessionId(message: string, agentId: string): string {
    // Try to extract client ID for session tracking
    const clientMatch = message.match(/client_(\d+)/);
    if (clientMatch) {
      return `${agentId}-client-${clientMatch[1]}`;
    }
    
    return `session-${agentId}`;
  }

  /**
   * Parse Cursor MCP extension logs
   * Format: 2025-07-03 14:46:38.471 [error] user-memento: [INFO] Starting job processing
   */
  private parseCursorMCPLog(line: string, agent: AgentConfig, filePath: string): LogEntry | null {
    try {
      // Match Cursor MCP log format: YYYY-MM-DD HH:MM:SS.mmm [level] mcp-server: [LEVEL] message
      const cursorMCPPattern = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(\w+)\] ([^:]+): (.+)$/;
      const match = line.match(cursorMCPPattern);
      
      if (match) {
        const [, timestampStr, cursorLevel, mcpServer, mcpMessage] = match;
        const timestamp = new Date(timestampStr).toISOString();
        const level = this.mapCursorLogLevel(cursorLevel);
        const logId = `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Extract MCP server-specific metadata
        const mcpMetadata = this.extractCursorMCPMetadata(mcpServer, mcpMessage);

        return {
          id: logId,
          timestamp,
          level,
          message: mcpMessage.trim(),
          source: `cursor-mcp-${mcpServer}`,
          agentType: agent.type,
          sessionId: this.extractMCPSessionId(mcpMessage, mcpServer),
          metadata: {
            filePath,
            agentName: agent.name,
            parser: 'cursor-mcp-parser',
            isCursorMCP: true,
            mcpServer,
            originalLevel: cursorLevel,
            ...mcpMetadata
          },
          raw: line
        };
      }
      
      // Try alternative MCP format: just the MCP server message without timestamp
      const simpleMCPPattern = /^([^:]+): (.+)$/;
      const simpleMatch = line.match(simpleMCPPattern);
      
      if (simpleMatch && (simpleMatch[1].includes('user-') || simpleMatch[1].includes('mcp') || simpleMatch[1].includes('review-gate'))) {
        const [, mcpServer, mcpMessage] = simpleMatch;
        const timestamp = new Date().toISOString();
        const logId = `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Determine level from message content
        let level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info';
        if (mcpMessage.includes('[ERROR]') || mcpMessage.includes('ERROR')) level = 'error';
        else if (mcpMessage.includes('[WARN]') || mcpMessage.includes('WARN')) level = 'warn';
        else if (mcpMessage.includes('[DEBUG]') || mcpMessage.includes('DEBUG')) level = 'debug';
        else if (mcpMessage.includes('[INFO]') || mcpMessage.includes('INFO')) level = 'info';

        const mcpMetadata = this.extractCursorMCPMetadata(mcpServer, mcpMessage);

        return {
          id: logId,
          timestamp,
          level,
          message: mcpMessage.trim(),
          source: `cursor-mcp-${mcpServer}`,
          agentType: agent.type,
          sessionId: this.extractMCPSessionId(mcpMessage, mcpServer),
          metadata: {
            filePath,
            agentName: agent.name,
            parser: 'cursor-mcp-simple',
            isCursorMCP: true,
            mcpServer,
            ...mcpMetadata
          },
          raw: line
        };
      }
      
      // If it doesn't match MCP patterns, fall back to basic parsing
      return this.parseBasicLogLine(line, agent, filePath);
      
    } catch (error) {
      console.warn(`❌ Failed to parse Cursor MCP log: ${line.substring(0, 100)}...`, error);
      return null;
    }
  }

  /**
   * Map Cursor log levels to our standard levels
   */
  private mapCursorLogLevel(cursorLevel: string): 'debug' | 'info' | 'warn' | 'error' | 'fatal' {
    switch (cursorLevel.toLowerCase()) {
      case 'trace':
      case 'debug':
        return 'debug';
      case 'info':
        return 'info';
      case 'warn':
      case 'warning':
        return 'warn';
      case 'error':
        return 'error';
      case 'fatal':
      case 'critical':
        return 'fatal';
      default:
        return 'info';
    }
  }

  /**
   * Extract Cursor MCP-specific metadata from log messages
   */
  private extractCursorMCPMetadata(mcpServer: string, message: string): Record<string, any> {
    const metadata: Record<string, any> = {
      mcpServerType: mcpServer
    };
    
    // Detect MCP server types
    if (mcpServer.includes('memento')) {
      metadata.mcpService = 'memory';
      metadata.mcpFunction = 'memento';
    } else if (mcpServer.includes('review-gate')) {
      metadata.mcpService = 'review';
      metadata.mcpFunction = 'gate';
    } else if (mcpServer.includes('retrieval')) {
      metadata.mcpService = 'retrieval';
      metadata.mcpFunction = 'search';
    }
    
    // Extract JSON data if present
    try {
      const jsonMatch = message.match(/\[([^\[\]]*)\]/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1];
        if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
          const jsonData = JSON.parse(jsonStr);
          metadata.mcpData = jsonData;
        }
      }
    } catch {
      // JSON parsing failed, continue
    }
    
    // MCP heartbeat detection
    if (message.includes('heartbeat') || message.includes('MCP heartbeat')) {
      metadata.mcpHeartbeat = true;
      const heartbeatMatch = message.match(/heartbeat #(\d+)/);
      if (heartbeatMatch) {
        metadata.heartbeatNumber = parseInt(heartbeatMatch[1], 10);
      }
    }
    
    // Job processing detection
    if (message.includes('job processing') || message.includes('Starting job')) {
      metadata.mcpJobProcessing = true;
    }
    
    // Queue status detection
    if (message.includes('queue status') || message.includes('Retrieved queue')) {
      metadata.mcpQueueStatus = true;
    }
    
    return metadata;
  }

  /**
   * Extract session ID from MCP messages
   */
  private extractMCPSessionId(message: string, mcpServer: string): string {
    // Try to extract session/client information
    const sessionMatch = message.match(/session[_-]([a-zA-Z0-9]+)/i);
    if (sessionMatch) {
      return `mcp-${mcpServer}-${sessionMatch[1]}`;
    }
    
    const clientMatch = message.match(/client[_-]([a-zA-Z0-9]+)/i);
    if (clientMatch) {
      return `mcp-${mcpServer}-${clientMatch[1]}`;
    }
    
    // Default session ID
    return `mcp-session-${mcpServer}`;
  }

  /**
   * Basic log line parsing (fallback)
   */
  private parseBasicLogLine(line: string, agent: AgentConfig, filePath: string): LogEntry | null {
    const timestamp = new Date().toISOString();
    const logId = `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Try to detect log level
    let level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info';
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('err')) level = 'error';
    else if (lowerLine.includes('warn') || lowerLine.includes('warning')) level = 'warn';
    else if (lowerLine.includes('debug') || lowerLine.includes('trace')) level = 'debug';
    else if (lowerLine.includes('fatal') || lowerLine.includes('critical')) level = 'fatal';

    return {
      id: logId,
      timestamp,
      level,
      message: line.trim(),
      source: `${agent.id}-${basename(filePath)}`,
      agentType: agent.type,
      sessionId: `session-${agent.id}`,
      metadata: {
        filePath,
        agentName: agent.name,
        parser: 'basic-line-parser'
      },
      raw: line
    };
  }

  /**
   * Stop watching a specific file
   */
  private async stopWatchingFile(filePath: string): Promise<void> {
    const watchedFile = this.watchers.get(filePath);
    if (watchedFile) {
      watchedFile.watcher.close();
      this.watchers.delete(filePath);
      console.log(`✅ Stopped watching: ${filePath}`);
    }
  }

  /**
   * Check if a filename is a log file
   */
  private isLogFile(filename: string): boolean {
    const logExtensions = ['.log', '.txt', '.out', '.err'];
    const logPatterns = ['log', 'debug', 'error', 'trace', 'output'];
    
    const lowerName = filename.toLowerCase();
    
    return logExtensions.some(ext => lowerName.endsWith(ext)) ||
           logPatterns.some(pattern => lowerName.includes(pattern));
  }

  /**
   * Get current watching status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      watchedFiles: Array.from(this.watchers.keys()),
      watcherCount: this.watchers.size
    };
  }

  /**
   * Get the running status of the log watcher
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get all watched files with their status
   */
  public getWatchedFiles(): WatchedFile[] {
    return Array.from(this.watchers.values());
  }

  /**
   * Get watched files count
   */
  public getWatchedFilesCount(): number {
    return this.watchers.size;
  }

  /**
   * Restart the log watcher with current or new agents
   */
  public async restart(agents?: AgentConfig[]): Promise<void> {
    console.log('🔄 Restarting log watcher...');
    
    // Stop existing watchers
    await this.stopWatching();
    
    // If agents provided, use them; otherwise discover agents again
    if (agents) {
      await this.startWatching(agents);
    } else {
      // Re-discover agents and start watching
      const { discoverAgents } = await import('./agent-discovery.js');
      const discoveredAgents = await discoverAgents();
      await this.startWatching(discoveredAgents);
    }
    
    console.log('✅ Log watcher restarted successfully');
  }
} 