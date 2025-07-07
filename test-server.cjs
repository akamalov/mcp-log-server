#!/usr/bin/env node

/**
 * Minimal test server to verify basic functionality
 */

const http = require('http');
const { URL } = require('url');

// Mock log data
const mockLogs = [
  {
    id: "test-1",
    timestamp: "2025-07-07 12:00:00.000",
    level: "info",
    message: "Test log message 1",
    source: "test-agent",
    agentType: "custom",
    sessionId: "session-1",
    context: {},
    metadata: { test: true },
    raw: "Test log message 1"
  },
  {
    id: "test-2", 
    timestamp: "2025-07-07 12:01:00.000",
    level: "error",
    message: "Test error message",
    source: "test-agent",
    agentType: "custom",
    sessionId: "session-1",
    context: {},
    metadata: { test: true },
    raw: "Test error message"
  }
];

// Mock analytics data
const mockAnalytics = {
  metrics: {
    totalLogs: 593062,
    logsByLevel: { info: 400000, warn: 100000, error: 80000, debug: 13062 },
    logsByAgent: { "claude-code": 300000, "cursor": 150000, "vscode": 143062 },
    logsByHour: {},
    errorRate: 0.135,
    averageLogsPerMinute: 150.5
  },
  agentHealth: [
    {
      agentId: "claude-code",
      agentName: "Claude Code CLI", 
      lastActivity: new Date().toISOString(),
      logVolume24h: 50000,
      errorCount24h: 500,
      warningCount24h: 1200,
      healthScore: 85,
      status: "healthy"
    },
    {
      agentId: "cursor",
      agentName: "Cursor",
      lastActivity: new Date().toISOString(), 
      logVolume24h: 30000,
      errorCount24h: 200,
      warningCount24h: 800,
      healthScore: 92,
      status: "healthy"
    }
  ],
  topPatterns: [],
  lastUpdated: new Date().toISOString()
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:3001`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  console.log(`${req.method} ${url.pathname}`);
  
  // Routes
  if (url.pathname === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
  }
  else if (url.pathname === '/api/logs') {
    res.writeHead(200);
    res.end(JSON.stringify(mockLogs));
  }
  else if (url.pathname === '/api/analytics/summary') {
    res.writeHead(200);
    res.end(JSON.stringify(mockAnalytics));
  }
  else if (url.pathname === '/api/agents') {
    res.writeHead(200);
    res.end(JSON.stringify([
      { id: "claude-code", name: "Claude Code CLI", available: true, type: "claude-code" },
      { id: "cursor", name: "Cursor", available: true, type: "cursor" }
    ]));
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
  console.log(`🔍 Test endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   GET  http://localhost:${PORT}/api/logs`);
  console.log(`   GET  http://localhost:${PORT}/api/analytics/summary`);
  console.log(`   GET  http://localhost:${PORT}/api/agents`);
});