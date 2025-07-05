import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${BACKEND_URL}/api/agents/custom`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching custom agents, falling back to empty array:', error);
    // Fallback to empty array when backend is not accessible
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Received POST data:', body);
    
    // Validate required fields
    if (!body.name || !body.logPaths || body.logPaths.length === 0) {
      console.log('Validation failed:', { name: body.name, logPaths: body.logPaths });
      return NextResponse.json(
        { error: 'Name and at least one log path are required' },
        { status: 400 }
      );
    }

    // Keep frontend data format - backend expects logPaths not log_paths
    const agentData = {
      name: body.name,
      type: body.type || 'custom',
      logPaths: body.logPaths.filter((path: string) => path.trim()),
      logFormat: body.logFormat || 'text',
      enabled: body.enabled ?? true,
      filters: body.filters || ['info', 'warn', 'error'],
      metadata: { ...body.metadata, createdBy: 'user' }
    };

    console.log('Sending to backend:', agentData);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${BACKEND_URL}/api/agents/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('Backend response:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error || 'Failed to create custom agent' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating custom agent, falling back to mock response:', error);
    // Fallback to mock response when backend is not accessible
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
  }
}