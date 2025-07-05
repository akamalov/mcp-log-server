import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.logPaths || body.logPaths.length === 0) {
      return NextResponse.json(
        { error: 'Name and at least one log path are required' },
        { status: 400 }
      );
    }

    // Transform frontend data format to backend format
    const agentData = {
      name: body.name,
      type: body.type || 'custom',
      log_paths: body.logPaths.filter((path: string) => path.trim()),
      format_type: body.logFormat || 'text',
      is_active: body.enabled ?? true,
      filters: body.filters || ['info', 'warn', 'error'],
      metadata: { ...body.metadata, updatedBy: 'user' }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${BACKEND_URL}/api/agents/custom/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error || 'Failed to update custom agent' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating custom agent:', error);
    return NextResponse.json(
      { error: 'Failed to update custom agent', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    console.log('DELETE request for agent ID:', id);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    console.log('Sending DELETE request to backend:', `${BACKEND_URL}/api/agents/custom/${id}`);
    const response = await fetch(`${BACKEND_URL}/api/agents/custom/${id}`, {
      method: 'DELETE',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('Backend DELETE response:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json();
      console.log('Backend DELETE error:', errorData);
      return NextResponse.json(
        { error: errorData.error || 'Failed to delete custom agent' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Backend DELETE success:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deleting custom agent:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom agent', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}