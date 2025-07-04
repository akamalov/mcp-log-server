# MCP Log Server Startup Guide

## Quick Start

Use the intelligent startup script to automatically start backend, verify health, then start frontend:

```bash
# Start both servers with health checks
pnpm start

# Or run the script directly
./start-dev.sh
```

## Script Features

The `start-dev.sh` script provides:

### ✅ **Automatic Health Verification**
- Checks database dependencies (Docker containers)
- Starts backend server on port 3001
- Waits for backend health check to pass (up to 60 seconds)
- Verifies analytics API endpoint specifically
- Only starts frontend after backend is confirmed healthy

### 🔧 **Smart Process Management**
- Automatically kills any existing processes on ports 3000/3001
- Stores process IDs for clean shutdown
- Graceful cleanup on Ctrl+C or script exit
- Background process monitoring
- **Restart functionality**: Intelligently stops running instances and starts fresh

### 📊 **Status Monitoring**
- Real-time health check feedback
- Colored output for easy status reading
- Log file generation (backend.log, frontend.log)
- Database service verification
- Clean log rotation on restart

## Available Commands

```bash
# Start development environment
pnpm start
./start-dev.sh

# Restart both servers (stop if running, then start fresh)
pnpm restart
./start-dev.sh --restart

# Check server status
pnpm run start:status
./start-dev.sh --status

# Stop all servers
pnpm run start:stop
./start-dev.sh --stop

# View recent logs
pnpm run start:logs
./start-dev.sh --logs

# Show help
./start-dev.sh --help
```

## Script Workflow

1. **🗄️ Database Check**: Verifies Docker containers are running
2. **🔧 Backend Start**: Starts server on port 3001
3. **🏥 Health Wait**: Waits for `/health` endpoint to return `{"status":"healthy"}`
4. **🔍 API Verify**: Confirms `/api/analytics/summary` is responding
5. **🌐 Frontend Start**: Starts web app on port 3000
6. **✅ Ready**: Both servers running and verified

## Health Check Details

The script waits for the backend to be fully healthy before starting the frontend:

- **Health Endpoint**: `http://localhost:3001/health`
- **Expected Response**: `{"status":"healthy",...}`
- **Analytics Check**: `http://localhost:3001/api/analytics/summary`
- **Timeout**: 60 seconds maximum wait time
- **Interval**: Health check every 2 seconds

## Port Configuration

Default ports (configurable in script):
- **Backend**: 3001
- **Frontend**: 3000
- **PostgreSQL**: 5432
- **ClickHouse**: 8123, 9000
- **Redis**: 6379
- **Elasticsearch**: 9200, 9300

## Troubleshooting

### Backend Won't Start
```bash
# Try a restart first
pnpm restart

# Check logs
pnpm run start:logs

# Check database services
docker-compose -f docker-compose.dev.yml ps

# Manual database start
pnpm run db:setup
```

### Frontend API Errors
```bash
# Verify backend health
curl http://localhost:3001/health

# Check analytics endpoint
curl http://localhost:3001/api/analytics/summary
```

### Port Conflicts
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :3001

# Force stop
pnpm run start:stop
```

## Manual Startup (Alternative)

If you prefer manual control:

```bash
# 1. Start databases
pnpm run db:setup

# 2. Start backend (in one terminal)
pnpm --filter server dev

# 3. Wait for backend health, then start frontend (in another terminal)
pnpm --filter web dev
```

## Log Files

The script generates log files in the project root:
- `backend.log` - Backend server output
- `frontend.log` - Frontend server output

View logs with:
```bash
tail -f backend.log
tail -f frontend.log
```

## Environment Dependencies

Required for startup:
- ✅ Node.js 20+ LTS
- ✅ pnpm 9+
- ✅ Docker & Docker Compose
- ✅ bash shell
- ✅ curl (for health checks)
- ✅ lsof (for port management)

## Example Output

```
[20:47:30] 🚀 Starting MCP Log Server Development Environment

[20:47:30] ✅ Database services are running

[20:47:30] Starting backend server...
[20:47:31] Backend started with PID 12345

[20:47:31] Waiting for backend to become healthy...
.....
[20:47:35] ✅ Backend is healthy!

[20:47:35] Verifying analytics API endpoint...
[20:47:35] ✅ Analytics API endpoint is responding

[20:47:35] Starting frontend server...
[20:47:36] ✅ Frontend started with PID 12346

[20:47:36] 🎉 Development environment is ready!
[20:47:36] ✅ Backend:  http://localhost:3001
[20:47:36] ✅ Frontend: http://localhost:3000
[20:47:36] ✅ Health:   http://localhost:3001/health

[20:47:36] Press Ctrl+C to stop both servers
```

This ensures your development environment starts reliably every time!