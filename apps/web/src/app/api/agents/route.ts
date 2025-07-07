import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Forward request to backend's direct agents API
    const response = await fetch(`${config.backendUrl}/api/agents`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Return agents directly from the backend API
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 