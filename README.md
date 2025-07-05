# MCP Log Server

> **AI Agent Log Aggregation & Monitoring Platform**

A comprehensive logging and monitoring platform designed for AI agent ecosystems. MCP Log Server automatically discovers, aggregates, and analyzes logs from various AI agents including Claude, Cursor, VS Code, Gemini CLI, and custom agents, providing real-time monitoring and analytics through a modern web dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat&logo=fastify&logoColor=white)](https://www.fastify.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

## 🎯 What is MCP Log Server?

MCP Log Server is a monitoring and analytics solution that bridges the gap between AI agents and operational intelligence. It provides:

- **🔍 Cross-Platform Agent Discovery**: Automatically detects AI agents across Windows, macOS, Linux, and WSL environments
- **📊 Real-time Log Aggregation**: Collects logs from multiple agents with live updates via WebSocket connections
- **🧠 Basic Analytics**: Pattern detection and log analysis capabilities
- **🎨 Modern Dashboard**: Clean, responsive web interface with agent status and analytics
- **🔌 MCP Protocol Foundation**: Basic Model Context Protocol implementation for agent communication
- **⚙️ Custom Agent Management**: Add and configure custom log sources beyond auto-discovered agents
- **🚀 Production Ready**: Containerized architecture with multiple database support

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Log Server Platform                        │
├─────────────────┬─────────────────┬─────────────────┬─────────────────┤
│   Agent Layer   │  Backend Layer  │ Database Layer  │ Frontend Layer  │
│                 │                 │                 │                 │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │
│ │ Claude CLI  │ │ │   Fastify   │ │ │ PostgreSQL  │ │ │   Next.js   │ │
│ │  Desktop    │◄├─┤   Server    │◄├─┤ (Metadata)  │ │ │  Dashboard  │ │
│ │   Cursor    │ │ │             │ │ │             │ │ │             │ │
│ │ VS Code     │ │ ├─────────────┤ │ ├─────────────┤ │ ├─────────────┤ │
│ │ Gemini CLI  │ │ │   Agent     │ │ │ ClickHouse  │ │ │ Real-time   │ │
│ │   Custom    │ │ │ Discovery   │ │ │   (Logs)    │ │ │   Updates   │ │
│ └─────────────┘ │ │  Service    │ │ │             │ │ │             │ │
│                 │ │             │ │ ├─────────────┤ │ ├─────────────┤ │
│ ┌─────────────┐ │ ├─────────────┤ │ │    Redis    │ │ │ WebSocket   │ │
│ │Log Sources: │ │ │ Log Watcher │ │ │  (Cache)    │ │ │   Client    │ │
│ │ • Text Logs │ │ │  Service    │ │ │             │ │ │             │ │
│ │ • Structured│ │ │             │ │ ├─────────────┤ │ └─────────────┘ │
│ │ • JSON Logs │ │ ├─────────────┤ │ │Elasticsearch│ │                 │
│ │ • Custom    │ │ │ WebSocket   │ │ │  (Search)   │ │                 │
│ └─────────────┘ │ │  Service    │ │ └─────────────┘ │                 │
│                 │ └─────────────┘ │                 │                 │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### Technology Stack

**Backend Infrastructure:**
- **Fastify** - High-performance web server with TypeScript support
- **PostgreSQL** - Primary database for agent configuration and metadata
- **ClickHouse** - Time-series database for log storage and analytics
- **Redis** - Caching layer and real-time data management
- **Elasticsearch** - Full-text search and log indexing

**Frontend Experience:**
- **Next.js 15** - React framework with App Router
- **Tailwind CSS** - Utility-first CSS framework
- **WebSocket Client** - Real-time updates and live monitoring

**Development & Operations:**
- **Turbo** - Monorepo build system for efficient development
- **TypeScript** - End-to-end type safety
- **pnpm** - Fast, disk space efficient package manager
- **Docker** - Containerized development and deployment

## ✨ Key Features

### 🤖 Intelligent Agent Discovery

- **Cross-Platform Detection**: Automatically finds AI agents on Windows, macOS, Linux, and WSL
- **Supported Agents**: 
  - Claude CLI and Desktop applications
  - Cursor editor
  - VS Code with extensions  
  - Gemini CLI tools
  - Custom log sources
- **WSL Integration**: Smart Windows path mounting for WSL environments
- **Dynamic Configuration**: Real-time agent discovery with automatic path resolution

### 📈 Analytics & Monitoring

- **Real-time Dashboards**: Live metrics with agent status monitoring
- **Log Volume Tracking**: Monitor log ingestion rates and patterns
- **Agent Health Monitoring**: Track agent availability and performance
- **Pattern Detection**: Basic log pattern recognition and analysis
- **Error Rate Monitoring**: Track and alert on error patterns

### 🔗 API & Integration

- **REST API**: Complete RESTful API for agent and log management
- **WebSocket**: Real-time bidirectional communication for live updates
- **MCP Protocol**: Basic Model Context Protocol implementation
- **Custom Agents**: API for adding and managing custom log sources

### 📊 Data Management

- **Multi-Database Architecture**: Optimized storage for different data types
- **Log Processing**: Efficient handling of high-volume log ingestion
- **Search Capabilities**: Elasticsearch-powered log search
- **Data Export**: Export logs in various formats

## 📸 Screenshots

### Main Dashboard
The central hub for monitoring all your AI agents with real-time metrics and status overview.

![MCP Log Server Dashboard](https://github.com/user-attachments/assets/27f089ff-97bc-462c-9154-ae03fcf5b832)

*Features: Real-time agent status, system health metrics, log volume tracking, and quick navigation to detailed views.*

### Enhanced Log Viewer
Advanced log filtering and viewing with regex support for deep log analysis.

![Enhanced Log Viewer](https://github.com/user-attachments/assets/db4ca12b-7b62-4d51-8c5a-7a0e6f8b7b13)

*Features: Real-time log streaming, advanced filtering, search functionality, and export capabilities.*

### Agent Manager
Comprehensive agent management interface for both auto-discovered and custom agents.

![Agent Manager](https://github.com/user-attachments/assets/3c9e5c8f-40e1-4ef7-be87-9a1f9d4e5c7a)

*Features: Auto-discovery status, custom agent configuration, agent health monitoring, and log path management.*

### Enhanced Analytics
Advanced analytics dashboard with performance metrics and predictive insights.

![Enhanced Analytics](https://github.com/user-attachments/assets/e7f4d41f-9c5b-4b37-8f7c-8f5e8c7d8c9a)

*Features: Response time distribution, throughput analysis, error tracking, and agent activity patterns.*

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js** 20.0+ LTS
- **pnpm** 9.0+ (package manager)
- **Docker** & Docker Compose v2
- **Git**
- **4GB+ RAM** (recommended for full stack)

### Installation

1. **Clone and setup the repository**
   ```bash
   git clone https://github.com/akamalov/mcp-log-server.git
   cd mcp-log-server
   pnpm install
   ```

2. **Start the development environment**
   ```bash
   pnpm start
   ```

The startup script automatically:
- ✅ Verifies dependencies and starts Docker services
- 🗄️ Initializes PostgreSQL, ClickHouse, Redis, and Elasticsearch
- 🚀 Starts the backend server on `http://localhost:3001`
- 🌐 Launches the web dashboard on `http://localhost:3000`
- 🔍 Discovers and connects to available AI agents
- 📊 Begins log collection and monitoring

### First Steps

1. **Access the Dashboard**: Navigate to `http://localhost:3000`
2. **View Discovered Agents**: See automatically detected agents on the dashboard
3. **Check Agent Status**: Monitor agent health and activity
4. **Add Custom Agents**: Use the Agent Management interface (`/agents`)
5. **Explore Analytics**: Check real-time metrics and log patterns
6. **Browse Logs**: Use the log viewer at `/logs`

## 🔧 Configuration & Setup

### Environment Configuration

Create a `.env` file in the project root:

```bash
# ===== Server Configuration =====
NODE_ENV=development
SERVER_HOST=localhost
SERVER_PORT=3001
FRONTEND_URL=http://localhost:3000

# ===== Database Configuration =====
# PostgreSQL (Primary Database)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mcp_log_server
POSTGRES_USER=mcp_user
POSTGRES_PASSWORD=mcp_password

# ClickHouse (Analytics Database)
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=mcp_logs
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=

# Redis (Cache & Real-time)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Elasticsearch (Search)
ELASTICSEARCH_HOST=localhost
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=

# ===== Security Configuration =====
JWT_SECRET=your-super-secure-jwt-secret-here
CORS_ORIGIN=http://localhost:3000

# ===== Logging Configuration =====
LOG_LEVEL=info
DEBUG_MODE=false

# ===== Feature Flags =====
ENABLE_ANALYTICS=true
ENABLE_REAL_TIME_UPDATES=true
ENABLE_AGENT_DISCOVERY=true
ENABLE_CUSTOM_AGENTS=true
```

### Agent Discovery Configuration

The system intelligently discovers agents in platform-specific locations:

**Claude Agents:**
- **Linux/WSL**: `~/.cache/claude-cli-nodejs/`, `~/.claude/logs/`
- **macOS**: `~/Library/Logs/Claude/`, `~/Library/Application Support/Claude/`
- **Windows**: `%APPDATA%\Claude\logs\`, `%LOCALAPPDATA%\Claude\`

**VS Code & Extensions:**
- **Linux**: `~/.vscode/logs/`, `~/.vscode-server/data/logs/`
- **macOS**: `~/Library/Application Support/Code/logs/`
- **Windows**: `%APPDATA%\Code\logs\`

**Cursor Editor:**
- **Linux**: `~/.cursor/logs/`
- **macOS**: `~/Library/Application Support/Cursor/logs/`
- **Windows**: `%APPDATA%\Cursor\logs\`

**Gemini CLI:**
- **Linux**: `~/.local/share/gemini-cli/projects/`
- **macOS**: `~/Library/Application Support/Gemini CLI/projects/`
- **Windows**: `%LOCALAPPDATA%\Gemini CLI\projects\`

## 📚 API Documentation

### REST API Endpoints

#### System Health & Status
```bash
GET  /health                          # Server health check
GET  /api/system/status               # System status information
```

#### Agent Management
```bash
# Agent Discovery & Management
GET    /api/agents                    # List all discovered agents
GET    /api/agents/:id                # Get specific agent details
POST   /api/agents/refresh            # Trigger agent rediscovery

# Custom Agent Configuration
GET    /api/agents/custom             # List custom agents
POST   /api/agents/custom             # Create new custom agent
PUT    /api/agents/custom/:id         # Update custom agent
DELETE /api/agents/custom/:id         # Delete custom agent
```

#### Analytics & Monitoring
```bash
# Analytics
GET /api/analytics/summary            # Analytics overview dashboard
GET /api/analytics/agents             # Per-agent analytics
GET /api/analytics/patterns           # Detected log patterns

# Log Management
GET /api/logs                         # Get recent logs with pagination
GET /api/logs/search                  # Search logs
```

### WebSocket Real-time API

Connect to `ws://localhost:3001/ws` for real-time updates:

```javascript
// WebSocket Connection
const ws = new WebSocket('ws://localhost:3001/ws');

// Event Subscriptions
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['logs', 'analytics', 'agents']
}));

// Event Handlers
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'log-entry':
      console.log('New log:', data.payload);
      break;
    case 'agent-status':
      console.log('Agent status change:', data.payload);
      break;
    case 'analytics-update':
      console.log('Analytics update:', data.payload);
      break;
  }
};
```

## 🎨 Dashboard Features

### Main Dashboard
- **System Overview**: Real-time metrics for total logs and active agents
- **Agent Status Grid**: Visual indicators for each agent's health and activity
- **Log Volume Charts**: Monitor log ingestion rates and trends
- **Error Rate Monitoring**: Track error patterns and alerts
- **Quick Navigation**: Fast access to detailed views

### Agent Management Interface
- **Discovery Dashboard**: View auto-discovered agents with detection details
- **Custom Agent Setup**: Add and configure custom log sources
- **Health Monitoring**: Real-time agent connectivity and status
- **Configuration Management**: Edit agent settings and log paths

### Analytics Dashboard
- **Pattern Recognition**: Identify recurring log patterns
- **Performance Metrics**: Monitor response times and throughput
- **Agent Health Scoring**: Composite health indicators
- **Log Volume Analysis**: Track ingestion trends and patterns

### Log Explorer
- **Real-time Stream**: Live log updates with filtering
- **Search Interface**: Full-text search with date ranges
- **Export Tools**: Download logs in various formats

## 🛠️ Development Guide

### Project Structure

```
mcp-log-server/
├── apps/
│   ├── server/                     # Fastify Backend Server
│   │   ├── src/
│   │   │   ├── config.ts          # Server configuration
│   │   │   ├── server.ts          # Main server setup
│   │   │   ├── services/          # Business logic services
│   │   │   │   ├── agent-discovery.ts    # Agent discovery service
│   │   │   │   ├── log-watcher.service.ts # Log monitoring service
│   │   │   │   ├── log-analytics.service.ts # Analytics processing
│   │   │   │   ├── websocket.service.ts    # WebSocket handling
│   │   │   │   └── database.service.ts     # Database abstraction
│   │   │   └── routes/            # API route handlers
│   │   │       └── agents.ts      # Agent management routes
│   │   └── migrations/            # Database migrations
│   │
│   ├── web/                       # Next.js Frontend Dashboard
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   │   ├── page.tsx      # Main dashboard
│   │   │   │   ├── agents/       # Agent management pages
│   │   │   │   ├── analytics/    # Analytics dashboard
│   │   │   │   └── logs/         # Log explorer
│   │   │   ├── components/       # React components
│   │   │   └── hooks/           # Custom React hooks
│   │   └── public/              # Static assets
│   │
│   ├── client/                   # MCP Client Implementation
│   └── cli/                      # Command Line Interface
│
├── packages/
│   ├── types/                    # Shared TypeScript types
│   │   ├── agent.ts             # Agent-related types
│   │   └── mcp.ts               # MCP protocol types
│   ├── database/                # Database utilities and migrations
│   ├── mcp-protocol/            # MCP implementation
│   └── ui/                      # Shared UI components
│
├── docs/                        # Documentation
├── docker-compose.dev.yml       # Development environment
└── start-dev.sh                 # Development startup script
```

### Development Workflow

```bash
# Start development environment
pnpm start

# Run specific services
pnpm --filter server dev          # Backend only
pnpm --filter web dev             # Frontend only

# Database management
pnpm run db:setup                 # Start all databases
pnpm run db:reset                 # Reset databases

# Code quality
pnpm run typecheck               # Type checking
pnpm run lint                    # Linting
pnpm run format                  # Format code

# Testing
pnpm test                        # Run tests
pnpm build                       # Build all packages
```

### Adding New Features

1. **Backend Features**:
   - Add types in `packages/types/`
   - Implement service logic in `apps/server/src/services/`
   - Create API routes in `apps/server/src/routes/`

2. **Frontend Features**:
   - Create components in `apps/web/src/components/`
   - Add pages in `apps/web/src/app/`
   - Implement hooks in `apps/web/src/hooks/`

3. **Shared Features**:
   - Define types in `packages/types/`
   - Add utilities in appropriate packages

## 🚀 Deployment

### Development Deployment

```bash
# Quick development setup
pnpm start                      # Starts everything with hot reload

# Individual service management
pnpm --filter server dev        # Backend server only
pnpm --filter web dev          # Frontend dashboard only
```

### Production Deployment

1. **Environment Setup**
   ```bash
   # Set production environment variables
   cp .env.example .env.production
   # Edit .env.production with your production values
   
   # Build for production
   pnpm build
   ```

2. **Docker Production Deployment**
   ```bash
   # Start production stack with docker-compose
   docker-compose -f docker-compose.prod.yml up -d
   
   # Monitor logs
   docker-compose logs -f
   ```

### Monitoring & Maintenance

```bash
# Health checks
curl http://localhost:3001/health

# System status
curl http://localhost:3001/api/system/status

# Database maintenance
pnpm run db:reset               # Reset and restart databases
```

## 🔍 Troubleshooting

### Common Issues & Solutions

**🚨 Backend Server Won't Start**
```bash
# Check if databases are running
docker-compose -f docker-compose.dev.yml ps

# Restart databases if needed
pnpm run db:reset

# Check port availability
lsof -i :3001
```

**🚨 Frontend Can't Connect to Backend**
```bash
# Verify backend health
curl http://localhost:3001/health

# Check CORS configuration in .env
cat .env | grep FRONTEND_URL
```

**🚨 Agent Discovery Not Working**
```bash
# Check agent installation paths
ls -la ~/.cache/claude-cli-nodejs/
ls -la ~/.vscode/logs/

# Test WSL mount points (if using WSL)
ls -la /mnt/c/Users/$USER/AppData/Roaming/Claude/
```

**🚨 Database Connection Issues**
```bash
# PostgreSQL connection test
psql -h localhost -U mcp_user -d mcp_log_server -c "SELECT 1;"

# ClickHouse connection test
curl http://localhost:8123/ping

# Redis connection test
redis-cli ping
```

### Debug Mode

Enable comprehensive debugging:

```bash
# Enable debug mode
DEBUG=true LOG_LEVEL=debug pnpm start

# Backend-specific debugging
DEBUG=server:* pnpm --filter server dev
```

### Log Analysis

Development logs are automatically created:
- **Backend**: `./backend.log`
- **Frontend**: Browser developer console
- **Database**: Check Docker Compose logs
- **Agent Discovery**: Available in dashboard and backend logs

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Environment Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/mcp-log-server.git
   cd mcp-log-server
   ```

2. **Setup Development Environment**
   ```bash
   pnpm install
   pnpm run db:setup
   pnpm start
   ```

3. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Contribution Guidelines

- **Code Style**: Follow ESLint and Prettier configurations
- **Testing**: Add tests for new features and bug fixes
- **Documentation**: Update relevant documentation
- **Commits**: Use conventional commit format
- **Pull Requests**: Provide clear description and context

### Areas for Contribution

- 🔌 **New Agent Integrations**: Add support for additional AI agents
- 📊 **Enhanced Analytics**: Improve pattern detection and analytics
- 🎨 **UI/UX Improvements**: Enhance dashboard design and usability
- 🚀 **Performance Optimizations**: Database and query optimizations
- 🧪 **Testing**: Improve test coverage
- 📚 **Documentation**: Expand guides and API documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern web technologies for reliability and performance
- Inspired by the need for unified AI agent monitoring
- Community contributions and feedback are welcome

---

**Ready to monitor your AI agents?** 

```bash
git clone https://github.com/akamalov/mcp-log-server.git
cd mcp-log-server
pnpm install && pnpm start
```

Open [http://localhost:3000](http://localhost:3000) to get started! 🚀