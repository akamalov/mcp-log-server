import { NextRequest, NextResponse } from 'next/server';
import { format, subHours } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '24h';
    
    // Generate mock hourly data based on time range
    const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
    
    const hourlyData = Array.from({length: Math.min(hours, 24)}, (_, i) => ({
      hour: format(subHours(new Date(), 23 - i), 'HH:mm'),
      logs: Math.floor(Math.random() * 200) + 50,
      errors: Math.floor(Math.random() * 20) + 2,
      warnings: Math.floor(Math.random() * 30) + 5,
      info: Math.floor(Math.random() * 150) + 30,
      debug: Math.floor(Math.random() * 100) + 10
    }));

    const response = {
      hourlyData,
      timeRange,
      totalDataPoints: hourlyData.length,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch analytics metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics metrics' },
      { status: 500 }
    );
  }
} 