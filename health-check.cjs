#!/usr/bin/env node

/**
 * Comprehensive Health Check System for MCP Log Server
 * 
 * This script performs thorough checks of all system components
 * and provides early warning of potential issues.
 */

const http = require('http');
const { execSync } = require('child_process');

const CHECKS = {
  // Database checks
  databases: {
    clickhouse: {
      name: 'ClickHouse Database',
      check: () => checkClickHouse(),
      critical: true
    },
    postgres: {
      name: 'PostgreSQL Database', 
      check: () => checkPostgreSQL(),
      critical: true
    }
  },
  
  // Service checks
  services: {
    backend: {
      name: 'Backend API Server',
      check: () => checkBackendAPI(),
      critical: true
    },
    frontend: {
      name: 'Frontend Web Server',
      check: () => checkFrontend(),
      critical: false
    }
  },
  
  // API endpoint checks
  apis: {
    health: {
      name: 'Health Endpoint',
      check: () => checkAPIEndpoint('/api/health'),
      critical: true
    },
    logs: {
      name: 'Logs Endpoint',
      check: () => checkAPIEndpoint('/api/logs'),
      critical: true
    },
    analytics: {
      name: 'Analytics Endpoint', 
      check: () => checkAPIEndpoint('/api/analytics/summary'),
      critical: true
    },
    agents: {
      name: 'Agents Endpoint',
      check: () => checkAPIEndpoint('/api/agents'),
      critical: true
    }
  },
  
  // Data integrity checks
  data: {
    logCount: {
      name: 'Log Data Availability',
      check: () => checkLogData(),
      critical: true
    }
  }
};

// Helper function to make HTTP requests
function makeRequest(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: res.statusCode === 200 ? JSON.parse(data) : data
          });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.on('error', reject);
  });
}

// Database checks
async function checkClickHouse() {
  try {
    execSync('clickhouse-client --query "SELECT 1" > /dev/null 2>&1');
    const result = execSync('clickhouse-client --query "SELECT COUNT(*) FROM mcp_logs.log_entries"', { encoding: 'utf-8' });
    const logCount = parseInt(result.trim());
    return {
      status: 'healthy',
      message: `ClickHouse responding, ${logCount} logs available`,
      details: { logCount }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'ClickHouse connection failed',
      error: error.message
    };
  }
}

async function checkPostgreSQL() {
  try {
    execSync('docker exec mcp-postgres pg_isready > /dev/null 2>&1');
    return {
      status: 'healthy',
      message: 'PostgreSQL responding'
    };
  } catch (error) {
    return {
      status: 'unhealthy', 
      message: 'PostgreSQL connection failed',
      error: error.message
    };
  }
}

// Service checks
async function checkBackendAPI() {
  try {
    const ports = [3001, 3005];
    let workingPort = null;
    
    for (const port of ports) {
      try {
        await makeRequest(`http://localhost:${port}/api/health`);
        workingPort = port;
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (workingPort) {
      return {
        status: 'healthy',
        message: `Backend API responding on port ${workingPort}`,
        details: { port: workingPort }
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Backend API not responding on any expected port',
        details: { attemptedPorts: ports }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Backend API check failed',
      error: error.message
    };
  }
}

async function checkFrontend() {
  try {
    const ports = [3000, 3003, 3008];
    let workingPort = null;
    
    for (const port of ports) {
      try {
        await makeRequest(`http://localhost:${port}`);
        workingPort = port;
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (workingPort) {
      return {
        status: 'healthy',
        message: `Frontend responding on port ${workingPort}`,
        details: { port: workingPort }
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Frontend not responding on any expected port',
        details: { attemptedPorts: ports }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Frontend check failed',
      error: error.message
    };
  }
}

// API endpoint checks
async function checkAPIEndpoint(endpoint) {
  try {
    const ports = [3001, 3005];
    let result = null;
    
    for (const port of ports) {
      try {
        result = await makeRequest(`http://localhost:${port}${endpoint}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!result) {
      return {
        status: 'unhealthy',
        message: `${endpoint} not accessible on any port`
      };
    }
    
    if (result.status === 200) {
      return {
        status: 'healthy',
        message: `${endpoint} responding correctly`,
        details: { responseSize: JSON.stringify(result.data).length }
      };
    } else {
      return {
        status: 'unhealthy',
        message: `${endpoint} returned status ${result.status}`
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `${endpoint} check failed`,
      error: error.message
    };
  }
}

// Data integrity checks
async function checkLogData() {
  try {
    const result = await makeRequest('http://localhost:3005/api/analytics/summary');
    if (result.status === 200 && result.data.metrics) {
      const logCount = result.data.metrics.totalLogs;
      if (logCount > 0) {
        return {
          status: 'healthy',
          message: `Log data available: ${logCount} total logs`,
          details: { 
            totalLogs: logCount,
            agentCount: result.data.agentHealth ? result.data.agentHealth.length : 0
          }
        };
      } else {
        return {
          status: 'warning',
          message: 'No log data available in analytics'
        };
      }
    } else {
      return {
        status: 'unhealthy',
        message: 'Analytics endpoint not returning expected data'
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Log data check failed',
      error: error.message
    };
  }
}

// Main health check runner
async function runHealthChecks() {
  console.log('🏥 MCP Log Server Health Check');
  console.log('================================');
  console.log();
  
  const results = {};
  let criticalFailures = 0;
  let warnings = 0;
  
  for (const [category, checks] of Object.entries(CHECKS)) {
    console.log(`📋 ${category.toUpperCase()}`);
    console.log('-'.repeat(40));
    
    results[category] = {};
    
    for (const [checkName, checkConfig] of Object.entries(checks)) {
      process.stdout.write(`  ${checkConfig.name}... `);
      
      try {
        const result = await checkConfig.check();
        results[category][checkName] = result;
        
        if (result.status === 'healthy') {
          console.log('✅ HEALTHY');
          if (result.message) console.log(`     ${result.message}`);
        } else if (result.status === 'warning') {
          console.log('⚠️  WARNING');
          console.log(`     ${result.message}`);
          warnings++;
        } else {
          console.log('❌ UNHEALTHY');
          console.log(`     ${result.message}`);
          if (result.error) console.log(`     Error: ${result.error}`);
          if (checkConfig.critical) criticalFailures++;
        }
      } catch (error) {
        console.log('💥 ERROR');
        console.log(`     ${error.message}`);
        results[category][checkName] = {
          status: 'error',
          message: error.message
        };
        if (checkConfig.critical) criticalFailures++;
      }
    }
    console.log();
  }
  
  // Summary
  console.log('📊 HEALTH CHECK SUMMARY');
  console.log('=======================');
  
  if (criticalFailures === 0 && warnings === 0) {
    console.log('✅ All systems healthy');
    return true;
  } else if (criticalFailures === 0) {
    console.log(`⚠️  System operational with ${warnings} warning(s)`);
    return true;
  } else {
    console.log(`❌ System has ${criticalFailures} critical failure(s) and ${warnings} warning(s)`);
    console.log();
    console.log('🔧 RECOMMENDED ACTIONS:');
    
    if (results.databases?.clickhouse?.status !== 'healthy') {
      console.log('   - Check ClickHouse database connection and data availability');
    }
    if (results.databases?.postgres?.status !== 'healthy') {
      console.log('   - Verify PostgreSQL database is running and accessible');
    }
    if (results.services?.backend?.status !== 'healthy') {
      console.log('   - Restart backend API server and check for compilation errors');
    }
    if (results.apis && Object.values(results.apis).some(r => r.status !== 'healthy')) {
      console.log('   - Verify all API endpoints are responding correctly');
    }
    
    return false;
  }
}

// Run health checks if called directly
if (require.main === module) {
  runHealthChecks()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Health check failed:', error);
      process.exit(1);
    });
}

module.exports = { runHealthChecks };