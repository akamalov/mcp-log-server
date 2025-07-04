import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock pattern data demonstrating our intelligent pattern detection
    const patterns = [
      { 
        pattern: 'AI Model Operations', 
        count: 2847, 
        percentage: 18.5, 
        trend: 'up',
        examples: ['model completion', 'prompt processing', 'inference request'],
        severity: 'info'
      },
      { 
        pattern: 'Error Messages', 
        count: 1923, 
        percentage: 12.5, 
        trend: 'down',
        examples: ['connection timeout', 'API rate limit', 'parsing error'],
        severity: 'error'
      },
      { 
        pattern: 'WSL Operations', 
        count: 1456, 
        percentage: 9.5, 
        trend: 'stable',
        examples: ['file system access', 'path translation', 'mount operations'],
        severity: 'info'
      },
      { 
        pattern: 'Connection Issues', 
        count: 892, 
        percentage: 5.8, 
        trend: 'down',
        examples: ['network timeout', 'DNS resolution', 'TLS handshake'],
        severity: 'warning'
      },
      { 
        pattern: 'Performance Issues', 
        count: 634, 
        percentage: 4.1, 
        trend: 'stable',
        examples: ['slow query', 'memory usage', 'high latency'],
        severity: 'warning'
      },
      { 
        pattern: 'Authentication', 
        count: 456, 
        percentage: 3.0, 
        trend: 'up',
        examples: ['token refresh', 'login attempt', 'permission check'],
        severity: 'info'
      },
      { 
        pattern: 'Cache Operations', 
        count: 234, 
        percentage: 1.5, 
        trend: 'up',
        examples: ['cache hit', 'cache miss', 'cache invalidation'],
        severity: 'debug'
      }
    ];

    // Calculate trend indicators
    const trendCounts = {
      up: patterns.filter(p => p.trend === 'up').length,
      down: patterns.filter(p => p.trend === 'down').length,
      stable: patterns.filter(p => p.trend === 'stable').length
    };

    const response = {
      patterns,
      totalPatterns: patterns.length,
      totalOccurrences: patterns.reduce((sum, p) => sum + p.count, 0),
      trendSummary: trendCounts,
      topPattern: patterns[0],
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch pattern analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pattern analytics' },
      { status: 500 }
    );
  }
} 