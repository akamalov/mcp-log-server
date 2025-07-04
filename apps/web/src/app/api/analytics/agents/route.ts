import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock agent health data demonstrating our WSL-aware system
    const agents = [
      { 
        agentId: 'cursor-001', 
        agentName: 'Cursor AI (WSL)', 
        healthScore: 95, 
        status: 'healthy', 
        logVolume24h: 4521, 
        errorCount24h: 12,
        lastActivity: new Date().toISOString(),
        environment: 'WSL',
        version: '0.42.3'
      },
      { 
        agentId: 'claude-001', 
        agentName: 'Claude AI', 
        healthScore: 87, 
        status: 'warning', 
        logVolume24h: 3876, 
        errorCount24h: 45,
        lastActivity: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        environment: 'Cloud',
        version: '3.5-sonnet'
      },
      { 
        agentId: 'vscode-001', 
        agentName: 'VS Code (WSL)', 
        healthScore: 92, 
        status: 'healthy', 
        logVolume24h: 2943, 
        errorCount24h: 8,
        lastActivity: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        environment: 'WSL',
        version: '1.85.0'
      },
      { 
        agentId: 'test-001', 
        agentName: 'Test Agent', 
        healthScore: 78, 
        status: 'warning', 
        logVolume24h: 1234, 
        errorCount24h: 23,
        lastActivity: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
        environment: 'Mock',
        version: '1.0.0'
      }
    ];

    const response = {
      agents,
      totalAgents: agents.length,
      healthyAgents: agents.filter(a => a.status === 'healthy').length,
      warningAgents: agents.filter(a => a.status === 'warning').length,
      criticalAgents: agents.filter(a => a.status === 'critical').length,
      averageHealthScore: Math.round(agents.reduce((sum, a) => sum + a.healthScore, 0) / agents.length),
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch agent analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent analytics' },
      { status: 500 }
    );
  }
} 