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

    // For now, return a mock updated response
    // TODO: Connect to actual backend endpoint when implemented
    const updatedAgent = {
      id,
      user_id: 'user-1',
      name: body.name,
      type: body.type || 'custom',
      config: {},
      is_active: body.enabled ?? true,
      auto_discovery: false,
      log_paths: body.logPaths.filter((path: string) => path.trim()),
      format_type: body.logFormat || 'text',
      filters: body.filters || ['info', 'warn', 'error'],
      metadata: { ...body.metadata, updatedBy: 'user' },
      created_at: new Date('2024-01-01').toISOString(), // Mock created date
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(updatedAgent);
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
    
    // For now, return success response since deletion isn't implemented in backend yet
    // TODO: Connect to actual backend endpoint when implemented
    console.log(`Deleting agent with ID: ${id}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Agent deleted successfully',
      id 
    });
  } catch (error) {
    console.error('Error deleting custom agent:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom agent', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}