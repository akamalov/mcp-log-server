import WebSocket from 'ws';

const WEBSOCKET_URL = 'ws://localhost:3005/ws/analytics';

console.log(`Attempting to connect to WebSocket at: ${WEBSOCKET_URL}`);

const ws = new WebSocket(WEBSOCKET_URL);

let connectionInterval;
let messageCounter = 0;

ws.on('open', function open() {
  console.log('✅ [SUCCESS] WebSocket connection established.');
  console.log('---');
  console.log('This script will now monitor the connection for 5 minutes.');
  console.log('It will listen for "ping" messages from the server and send "pong" responses.');
  console.log('It will also send its own "ping" to the server every 30 seconds.');
  console.log('---');

  // Check connection status every 5 seconds
  connectionInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`[${new Date().toLocaleTimeString()}] Connection remains OPEN. State: ${ws.readyState}`);
    } else {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Connection is NO LONGER OPEN. State: ${ws.readyState}`);
    }
  }, 10000); // Check every 10 seconds

  // Send a ping every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const pingMessage = JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() });
      console.log(`[CLIENT -> SERVER] Sending ping: ${pingMessage}`);
      ws.send(pingMessage);
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);
});

ws.on('message', function incoming(data) {
  messageCounter++;
  const message = JSON.parse(data.toString());
  console.log(`[SERVER -> CLIENT] Message received (#${messageCounter}):`, message);

  // Respond to server pings
  if (message.type === 'ping') {
    const pongMessage = JSON.stringify({ type: 'pong', timestamp: new Date().toISOString(), data: 'pong from backend test' });
    console.log(`[CLIENT -> SERVER] Responding with pong: ${pongMessage}`);
    ws.send(pongMessage);
  }
});

ws.on('close', function close(code, reason) {
  console.error(`❌ [CLOSED] WebSocket connection closed.`);
  console.error(`  Code: ${code}`);
  console.error(`  Reason: ${reason.toString() || 'No reason provided'}`);
  console.log('---');
  clearInterval(connectionInterval);
});

ws.on('error', function error(err) {
  console.error('❌ [ERROR] An error occurred with the WebSocket connection:');
  console.error(err);
  console.log('---');
  clearInterval(connectionInterval);
});

// Keep the script running for 5 minutes for observation
setTimeout(() => {
  console.log('---');
  console.log('Test duration (5 minutes) is over. Closing connection.');
  ws.close(1000, 'Test script finished.');
  clearInterval(connectionInterval);
  // Allow time for close message to be logged
  setTimeout(() => process.exit(0), 1000);
}, 300000); // 5 minutes 