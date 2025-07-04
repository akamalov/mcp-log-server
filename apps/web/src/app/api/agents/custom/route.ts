import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    // For now, return empty array since custom agents aren't implemented in backend yet
    // TODO: Connect to actual backend endpoint when implemented
    return NextResponse.json([]);
  } catch (error) {
    console.error('Error fetching custom agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom agents', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.logPaths || body.logPaths.length === 0) {
      return NextResponse.json(
        { error: 'Name and at least one log path are required' },
        { status: 400 }
      );
    }

    // For now, return a mock success response
    // TODO: Connect to actual backend endpoint when implemented
    const mockAgent = {
      id: `custom-${Date.now()}`,
      user_id: 'user-1',
      name: body.name,
      type: body.type || 'custom',
      config: {},
      is_active: body.enabled ?? true,
      auto_discovery: false,
      log_paths: body.logPaths.filter((path: string) => path.trim()),
      format_type: body.logFormat || 'text',
      filters: body.filters || ['info', 'warn', 'error'],
      metadata: { ...body.metadata, createdBy: 'user' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(mockAgent, { status: 201 });
  } catch (error) {
    console.error('Error creating custom agent:', error);
    return NextResponse.json(
      { error: 'Failed to create custom agent', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}