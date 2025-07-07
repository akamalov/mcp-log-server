import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${config.backendUrl}/api/agents/discovered`, {
      method: 'GET',
      headers: {
        // ... existing code ...
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch discovered agents');
    }

    const data = await response.json();
    return NextResponse.json(data);
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