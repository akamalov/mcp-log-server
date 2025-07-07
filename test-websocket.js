#!/usr/bin/env node

import WebSocket from 'ws';

console.log('🔗 Testing WebSocket connection to MCP Log Server...');

// Test connection to the analytics WebSocket endpoint
const ws = new WebSocket('ws://localhost:3001/ws/analytics');

ws.on('open', function open() {
  console.log('✅ Connected to WebSocket at ws://localhost:3001/ws/analytics');
  
  // Subscribe to log entries
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['analytics', 'logs']
  }));
  
  console.log('📡 Subscribed to analytics and logs channels');
  console.log('⏳ Listening for real-time messages... (press Ctrl+C to exit)');
});

ws.on('message', function message(data) {
  try {
    const msg = JSON.parse(data.toString());
    console.log(`📨 Received ${msg.type}:`, {
      timestamp: msg.timestamp,
      dataKeys: Object.keys(msg.data || {}),
      sampleData: typeof msg.data === 'object' ? JSON.stringify(msg.data).substring(0, 200) + '...' : msg.data
    });
  } catch (error) {
    console.log('📨 Received raw message:', data.toString().substring(0, 200));
  }
});

ws.on('close', function close() {
  console.log('🔌 WebSocket connection closed');
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
  
  if (err.code === 'ECONNREFUSED') {
    console.log('💡 Server is not running on port 3001. Please start the server with:');
    console.log('   cd apps/server && pnpm dev');
  }
});

// Keep the process alive for 30 seconds to listen for messages
setTimeout(() => {
  console.log('⏰ Test completed, closing connection...');
  ws.close();
  process.exit(0);
}, 30000);