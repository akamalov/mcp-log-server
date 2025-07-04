#!/bin/bash

# MCP Log Server Development Startup Script
# This script starts the backend, waits for it to be healthy, then starts the frontend

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_PORT=3001
FRONTEND_PORT=3000
MAX_WAIT_TIME=60  # Maximum time to wait for backend in seconds
HEALTH_CHECK_INTERVAL=2  # Seconds between health checks

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        print_warning "Killing existing processes on port $port"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Function to wait for backend health
wait_for_backend() {
    local elapsed=0
    print_status "Waiting for backend to become healthy..."
    
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        if curl -s http://localhost:$BACKEND_PORT/health >/dev/null 2>&1; then
            local health_response=$(curl -s http://localhost:$BACKEND_PORT/health)
            local status=$(echo "$health_response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            
            if [ "$status" = "healthy" ]; then
                print_success "Backend is healthy!"
                return 0
            else
                print_warning "Backend responding but not healthy (status: $status)"
            fi
        fi
        
        printf "."
        sleep $HEALTH_CHECK_INTERVAL
        elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
    done
    
    echo ""
    print_error "Backend failed to become healthy within $MAX_WAIT_TIME seconds"
    return 1
}

# Function to check database dependencies
check_databases() {
    print_status "Checking database dependencies..."
    
    # Check if docker-compose services are running
    if ! docker-compose -f docker-compose.dev.yml ps | grep -q "Up.*healthy"; then
        print_warning "Some database services may not be running. Starting docker-compose..."
        docker-compose -f docker-compose.dev.yml up -d
        
        print_status "Waiting for databases to be healthy..."
        local db_wait=0
        while [ $db_wait -lt 30 ]; do
            if docker-compose -f docker-compose.dev.yml ps | grep -q "Up.*healthy.*Up.*healthy.*Up.*healthy.*Up.*healthy"; then
                print_success "All databases are healthy!"
                break
            fi
            printf "."
            sleep 2
            db_wait=$((db_wait + 2))
        done
        echo ""
    else
        print_success "Database services are running"
    fi
}

# Function to start backend
start_backend() {
    print_status "Starting backend server..."
    
    # Kill any existing backend process
    kill_port $BACKEND_PORT
    
    # Clean up old log files
    rm -f backend.log
    
    # Start backend in background
    cd "$(dirname "$0")"  # Ensure we're in the project root
    pnpm --filter server dev > backend.log 2>&1 &
    local backend_pid=$!
    
    # Store PID for cleanup
    echo $backend_pid > .backend.pid
    
    print_status "Backend started with PID $backend_pid"
    return 0
}

# Function to start frontend
start_frontend() {
    print_status "Starting frontend server..."
    
    # Kill any existing frontend process
    kill_port $FRONTEND_PORT
    
    # Clean up old log files
    rm -f frontend.log
    
    # Start frontend in background
    pnpm --filter web dev > frontend.log 2>&1 &
    local frontend_pid=$!
    
    # Store PID for cleanup
    echo $frontend_pid > .frontend.pid
    
    print_success "Frontend started with PID $frontend_pid"
    print_success "Frontend available at: http://localhost:$FRONTEND_PORT"
}

# Function to cleanup on exit
cleanup() {
    print_status "Cleaning up..."
    
    # Kill backend if PID file exists
    if [ -f .backend.pid ]; then
        local backend_pid=$(cat .backend.pid)
        if kill -0 $backend_pid 2>/dev/null; then
            print_status "Stopping backend (PID: $backend_pid)"
            kill $backend_pid 2>/dev/null || true
        fi
        rm -f .backend.pid
    fi
    
    # Kill frontend if PID file exists
    if [ -f .frontend.pid ]; then
        local frontend_pid=$(cat .frontend.pid)
        if kill -0 $frontend_pid 2>/dev/null; then
            print_status "Stopping frontend (PID: $frontend_pid)"
            kill $frontend_pid 2>/dev/null || true
        fi
        rm -f .frontend.pid
    fi
    
    # Final port cleanup
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT
}

# Function to show logs
show_logs() {
    print_status "Recent backend logs:"
    if [ -f backend.log ]; then
        tail -10 backend.log | sed 's/^/  /'
    else
        echo "  No backend logs found"
    fi
    echo ""
    
    print_status "Recent frontend logs:"
    if [ -f frontend.log ]; then
        tail -10 frontend.log | sed 's/^/  /'
    else
        echo "  No frontend logs found"
    fi
}

# Function to restart both servers
restart_servers() {
    print_status "🔄 Restarting MCP Log Server Development Environment"
    echo ""
    
    # Stop any running servers first
    print_status "Stopping existing servers..."
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT
    
    # Clean up PID files and logs
    rm -f .backend.pid .frontend.pid backend.log frontend.log
    
    # Wait a moment for processes to fully terminate
    sleep 2
    
    print_success "Existing servers stopped"
    echo ""
    
    # Now start fresh - reuse the main startup logic
    # Check and start databases
    check_databases
    echo ""
    
    # Start backend
    start_backend
    echo ""
    
    # Wait for backend to be healthy
    if wait_for_backend; then
        echo ""
        
        # Verify analytics endpoint specifically
        print_status "Verifying analytics API endpoint..."
        if curl -s http://localhost:$BACKEND_PORT/api/analytics/summary >/dev/null 2>&1; then
            print_success "Analytics API endpoint is responding"
        else
            print_warning "Analytics API endpoint not responding, but continuing..."
        fi
        echo ""
        
        # Start frontend
        start_frontend
        echo ""
        
        print_success "🎉 Development environment restarted successfully!"
        print_success "Backend:  http://localhost:$BACKEND_PORT"
        print_success "Frontend: http://localhost:$FRONTEND_PORT"
        print_success "Health:   http://localhost:$BACKEND_PORT/health"
        echo ""
        
        return 0
    else
        print_error "Failed to restart backend. Showing recent logs:"
        show_logs
        return 1
    fi
}

# Main execution
main() {
    print_status "🚀 Starting MCP Log Server Development Environment"
    echo ""
    
    # Set up signal handlers for cleanup
    trap cleanup EXIT INT TERM
    
    # Check and start databases
    check_databases
    echo ""
    
    # Start backend
    start_backend
    echo ""
    
    # Wait for backend to be healthy
    if wait_for_backend; then
        echo ""
        
        # Verify analytics endpoint specifically
        print_status "Verifying analytics API endpoint..."
        if curl -s http://localhost:$BACKEND_PORT/api/analytics/summary >/dev/null 2>&1; then
            print_success "Analytics API endpoint is responding"
        else
            print_warning "Analytics API endpoint not responding, but continuing..."
        fi
        echo ""
        
        # Start frontend
        start_frontend
        echo ""
        
        print_success "🎉 Development environment is ready!"
        print_success "Backend:  http://localhost:$BACKEND_PORT"
        print_success "Frontend: http://localhost:$FRONTEND_PORT"
        print_success "Health:   http://localhost:$BACKEND_PORT/health"
        echo ""
        print_status "Press Ctrl+C to stop both servers"
        echo ""
        
        # Wait for user interrupt
        while true; do
            sleep 1
        done
        
    else
        print_error "Failed to start backend. Showing recent logs:"
        show_logs
        exit 1
    fi
}

# Parse command line arguments
case "${1:-}" in
    --help|-h)
        echo "MCP Log Server Development Startup Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --restart, -r  Restart both servers (stop if running, then start fresh)"
        echo "  --logs         Show recent logs and exit"
        echo "  --stop         Stop running servers and exit"
        echo "  --status       Check server status and exit"
        echo ""
        echo "This script will:"
        echo "1. Check and start database dependencies"
        echo "2. Start the backend server on port $BACKEND_PORT"
        echo "3. Wait for backend health check to pass"
        echo "4. Start the frontend server on port $FRONTEND_PORT"
        echo "5. Keep both servers running until Ctrl+C"
        exit 0
        ;;
    --restart|-r)
        restart_servers
        if [ $? -eq 0 ]; then
            print_status "Press Ctrl+C to stop both servers"
            echo ""
            
            # Set up signal handlers for cleanup
            trap cleanup EXIT INT TERM
            
            # Wait for user interrupt
            while true; do
                sleep 1
            done
        else
            exit 1
        fi
        ;;
    --logs)
        show_logs
        exit 0
        ;;
    --stop)
        print_status "Stopping all servers..."
        kill_port $BACKEND_PORT
        kill_port $FRONTEND_PORT
        rm -f .backend.pid .frontend.pid backend.log frontend.log
        print_success "All servers stopped"
        exit 0
        ;;
    --status)
        print_status "Checking server status..."
        
        if check_port $BACKEND_PORT; then
            if curl -s http://localhost:$BACKEND_PORT/health >/dev/null 2>&1; then
                print_success "Backend: Running and healthy on port $BACKEND_PORT"
            else
                print_warning "Backend: Running on port $BACKEND_PORT but not responding to health checks"
            fi
        else
            print_error "Backend: Not running on port $BACKEND_PORT"
        fi
        
        if check_port $FRONTEND_PORT; then
            if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
                print_success "Frontend: Running and responding on port $FRONTEND_PORT"
            else
                print_warning "Frontend: Running on port $FRONTEND_PORT but not responding"
            fi
        else
            print_error "Frontend: Not running on port $FRONTEND_PORT"
        fi
        
        exit 0
        ;;
    "")
        # Default action - start servers
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac