import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3005';

export async function GET(request: NextRequest) {
  try {
    // For now, return mock discovered agents for testing
    // TODO: Connect to actual backend when MCP discovery is fully implemented
    const mockDiscoveredAgents = [
      {
        id: 'claude-desktop-auto',
        name: 'Claude Desktop',
        type: 'auto-discovered',
        logFormat: 'claude-mcp-json',
        logPaths: [
          '/mnt/c/Users/akama/AppData/Roaming/Claude/logs/main.log',
          '/mnt/c/Users/akama/AppData/Roaming/Claude/logs/mcp.log'
        ],
        metadata: {
          lastDiscovered: new Date().toISOString(),
          source: 'auto-discovery',
          status: 'active',
          confidence: 0.95
        }
      },
      {
        id: 'vscode-auto',
        name: 'VS Code',
        type: 'auto-discovered',
        logFormat: 'vscode-extension',
        logPaths: [
          '/mnt/c/Users/akama/AppData/Roaming/Code/logs/20250701T134330/main.log',
          '/mnt/c/Users/akama/AppData/Roaming/Code/logs/20250701T134330/window1/exthost/exthost.log'
        ],
        metadata: {
          lastDiscovered: new Date(Date.now() - 86400000).toISOString(),
          source: 'auto-discovery',
          status: 'active',
          confidence: 0.95
        }
      },
      {
        id: 'cursor-auto',
        name: 'Cursor',
        type: 'auto-discovered',
        logFormat: 'mixed',
        logPaths: [
          '/mnt/c/Users/akama/AppData/Roaming/Cursor/logs/main.log',
          '/mnt/c/Users/akama/AppData/Roaming/Cursor/logs/window.log'
        ],
        metadata: {
          lastDiscovered: new Date(Date.now() - 3600000).toISOString(),
          source: 'auto-discovery',
          status: 'active',
          confidence: 0.95
        }
      },
      {
        id: 'gemini-cli-auto',
        name: 'Gemini CLI',
        type: 'auto-discovered',
        logFormat: 'structured',
        logPaths: [
          '/mnt/c/Users/akama/.local/share/gemini-cli/projects/mcp-log-server/session.log',
          '/mnt/c/Users/akama/.local/share/gemini-cli/debug.log'
        ],
        metadata: {
          lastDiscovered: new Date(Date.now() - 1800000).toISOString(),
          source: 'auto-discovery',
          status: 'active',
          confidence: 0.95
        }
      }
    ];
    
    return NextResponse.json(mockDiscoveredAgents);
  } catch (error) {
    console.error('Error fetching discovered agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discovered agents', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper function to determine log format based on agent type
function getLogFormatForAgent(agentId: string): string {
  if (agentId.includes('claude')) return 'claude-mcp-json';
  if (agentId.includes('gemini')) return 'structured';
  if (agentId.includes('cursor')) return 'mixed';
  if (agentId.includes('vscode')) return 'vscode-extension';
  return 'structured';
}

// Helper function to get typical log paths based on agent type
function getLogPathsForAgent(agentId: string): string[] {
  if (agentId.includes('claude')) return ['~/.cache/claude-cli-nodejs', '~/Library/Logs/Claude'];
  if (agentId.includes('gemini')) return ['~/.local/share/gemini-cli/projects', '~/Library/Application Support/Gemini CLI'];
  if (agentId.includes('cursor')) return ['~/.cursor/logs', '~/Library/Application Support/Cursor/logs'];
  if (agentId.includes('vscode')) return ['~/.vscode/logs', '~/Library/Application Support/Code/logs'];
  return [];
}