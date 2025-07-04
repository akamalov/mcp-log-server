import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    // Connect to backend to get discovered agents
    const response = await fetch(`${BACKEND_URL}/mcp/tools/get_agent_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract agent status from MCP format
    const agents = data.content?.[0]?.text ? JSON.parse(data.content[0].text) : [];
    
    // Transform backend agents to frontend format
    const discoveredAgents = agents.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      type: 'auto-discovered',
      logFormat: getLogFormatForAgent(agent.id),
      logPaths: getLogPathsForAgent(agent.id),
      metadata: {
        lastDiscovered: agent.lastSeen || new Date().toISOString(),
        source: 'auto-discovery',
        status: agent.status,
        confidence: 0.95
      }
    }));
    
    return NextResponse.json(discoveredAgents);
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