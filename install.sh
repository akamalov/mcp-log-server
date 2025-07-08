#!/usr/bin/env bash

set -e

echo "=============================================="
echo "      MCP Log Server - Interactive Installer"
echo "=============================================="
echo ""
echo "Choose your installation type:"
echo ""
echo "1) Native Install"
echo "   - Installs directly on your system (Node.js, npm, ClickHouse, etc.)"
echo "   - Pros: Direct file access, no Docker overhead"
echo "   - Cons: Requires dependencies on host, less isolated"
echo ""
echo "2) Docker Install"
echo "   - Runs everything in Docker containers (backend, frontend, ClickHouse, etc.)"
echo "   - Pros: Fully isolated, easy to deploy, consistent"
echo "   - Cons: Needs Docker, host file watching may need extra config"
echo ""
echo "Suggestions:"
echo "  - Use Native if you want direct integration with your OS and local files."
echo "  - Use Docker for easy, portable, and production-like deployments."
echo ""

read -p "Enter 1 for Native, 2 for Docker [1/2]: " INSTALL_TYPE

if [[ "$INSTALL_TYPE" == "2" ]]; then
  echo ""
  echo "You chose: Docker Install"
  echo "----------------------------------------------"
  # Check for Docker
  if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker and try again."
    exit 1
  fi
  if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: docker-compose is not installed. Please install docker-compose and try again."
    exit 1
  fi
  echo "Building and starting Docker containers..."
  docker-compose up --build -d
  echo ""
  echo "✅ Docker installation complete!"
  echo "To view logs: docker-compose logs -f"
  echo "To stop:      docker-compose down"
  echo ""
  echo "If you want to watch host log files (e.g., ~/.cursor/logs),"
  echo "edit docker-compose.yml to add a volume mount:"
  echo "  - ~/.cursor/logs:/host-cursor-logs:ro"
  echo "and set the CURSOR_LOGS_PATH env variable in the backend service."
else
  echo ""
  echo "You chose: Native Install"
  echo "----------------------------------------------"
  # Check for Node.js
  if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js (v18+) and try again."
    exit 1
  fi
  if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed. Please install npm and try again."
    exit 1
  fi
  echo "Installing Node.js dependencies..."
  npm install
  echo ""
  echo "Setting up ClickHouse (you may need to install it manually if not present)..."
  # Optionally, add ClickHouse install steps here or prompt user
  echo "If ClickHouse is not installed, see: https://clickhouse.com/docs/en/install/"
  echo ""
  echo "Building frontend and backend..."
  npm run build
  echo ""
  echo "✅ Native installation complete!"
  echo "To start: npm run start"
  echo ""
  echo "If you want to watch logs in ~/.cursor/logs, ensure your config points to that path."
fi

echo ""
echo "=============================================="
echo "         Installation Finished"
echo "==============================================" 