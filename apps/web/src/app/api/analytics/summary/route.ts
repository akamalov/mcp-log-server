import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Fetch real analytics data from the backend service
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || config.backendUrl;
    const response = await fetch(`${backendUrl}/api/analytics/summary`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const analyticsData = await response.json();
    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error('Failed to fetch analytics summary:', error);
    
    // Return fallback data with correct structure if backend is unavailable
    const fallbackData = {
      metrics: {
        totalLogs: 0,
        logsByLevel: { info: 0, warn: 0, error: 0, debug: 0 },
        logsByAgent: {},
        logsByHour: {},
        errorRate: 0,
        averageLogsPerMinute: 0
      },
      agentHealth: [],
      topPatterns: [],
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json(fallbackData);
  }
} 