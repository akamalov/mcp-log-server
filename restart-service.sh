#!/bin/bash

# MCP Log Server - Restart Services Script
# Description: Stops all services, verifies shutdown, then starts all services and verifies startup.

# --- Configuration ---
BACKEND_PORT=3001
FRONTEND_PORT=3000
MAX_WAIT_TIME=60  # Max time to wait for services in seconds
HEALTH_CHECK_INTERVAL=2 # Seconds between health checks
PORTS_TO_CLEAN=(3000 3001)
LOG_FILES_TO_CLEAN=("backend.log" "frontend.log")

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Helper Functions ---
print_header() { echo -e "\n${CYAN}--- $1 ---${NC}"; }
print_status() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"; }
print_error() { echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"; }

# --- Stop Services ---
stop_services() {
    print_header "Step 1: Stopping All Services"
    for port in "${PORTS_TO_CLEAN[@]}"; do
        local pids=$(lsof -t -i TCP:$port -sTCP:LISTEN 2>/dev/null)
        if [ -n "$pids" ]; then
            print_warning "Killing processes on port $port: $pids"
            kill -9 $pids 2>/dev/null
        else
            print_success "No process found on port $port."
        fi
    done
    # Kill by process name as well
    mcp_pids=$(ps -ef | grep "[m]cp-log-server" | awk '{print $2}')
    if [ -n "$mcp_pids" ]; then
        print_warning "Killing lingering mcp-log-server PIDs: $mcp_pids"
        kill -9 $mcp_pids 2>/dev/null
    fi
    next_pids=$(ps -ef | grep "[n]ext" | awk '{print $2}')
    if [ -n "$next_pids" ]; then
        print_warning "Killing lingering next PIDs: $next_pids"
        kill -9 $next_pids 2>/dev/null
    fi
    print_status "Waiting for processes to terminate..."
    sleep 2
}

verify_stopped() {
    print_header "Step 2: Verifying All Services Stopped"
    local all_stopped=true
    for port in "${PORTS_TO_CLEAN[@]}"; do
        if lsof -i TCP:$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_error "Port $port is still in use."
            all_stopped=false
        else
            print_success "Port $port is clear."
        fi
    done
    if [ "$all_stopped" = false ]; then
        print_error "Some services failed to stop. Aborting restart."
        exit 1
    fi
    print_success "All services stopped."
}

cleanup_logs() {
    print_header "Step 3: Cleaning Up Log Files"
    for log_file in "${LOG_FILES_TO_CLEAN[@]}"; do
        if [ -f "$log_file" ]; then
            rm -f "$log_file"
            print_status "Removed $log_file."
        fi
    done
}

# --- Start Services ---
start_backend() {
    print_header "Step 4: Starting Backend Server"
    pnpm --filter server dev > backend.log 2>&1 &
    local pid=$!
    echo $pid > .backend.pid
    print_status "Backend process started with PID $pid."
    print_status "Waiting for backend to become healthy..."
    local start_time=$(date +%s)
    while true; do
        if lsof -i TCP:$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1 && curl -s "http://localhost:$BACKEND_PORT/health" | grep -q '"status":"healthy"'; then
            print_success "Backend is healthy."
            return 0
        fi
        local now=$(date +%s)
        if (( now - start_time > MAX_WAIT_TIME )); then
            print_error "Backend failed to become healthy within $MAX_WAIT_TIME seconds."
            return 1
        fi
        sleep $HEALTH_CHECK_INTERVAL
    done
}

start_frontend() {
    print_header "Step 5: Starting Frontend Server"
    pnpm --filter web dev --port $FRONTEND_PORT > frontend.log 2>&1 &
    local pid=$!
    echo $pid > .frontend.pid
    print_status "Frontend process started with PID $pid."
    print_status "Waiting for frontend to launch..."
    local start_time=$(date +%s)
    while true; do
        if lsof -i TCP:$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_success "Frontend is running."
            return 0
        fi
        if ! ps -p $pid > /dev/null; then
            print_error "Frontend process (PID $pid) died unexpectedly. Check frontend.log for details."
            return 1
        fi
        local now=$(date +%s)
        if (( now - start_time > MAX_WAIT_TIME )); then
            print_error "Frontend failed to start within $MAX_WAIT_TIME seconds."
            return 1
        fi
        sleep $HEALTH_CHECK_INTERVAL
    done
}

final_health_check() {
    print_header "Step 6: Final Health Check"
    local services_ok=true
    if lsof -i TCP:$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1 && curl -s "http://localhost:$BACKEND_PORT/health" | grep -q '"status":"healthy"'; then
        print_success "Backend is UP and healthy."
    else
        print_error "Backend is DOWN or unhealthy."
        services_ok=false
    fi
    if lsof -i TCP:$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "Frontend is UP."
    else
        print_error "Frontend is DOWN."
        services_ok=false
    fi
    if [ "$services_ok" = true ]; then
        print_success "🎉 All services are running."
        print_status "Backend:  http://localhost:$BACKEND_PORT"
        print_status "Frontend: http://localhost:$FRONTEND_PORT"
    else
        print_error "One or more services failed to start or are unhealthy."
    fi
}

# --- Main Execution ---
main() {
    stop_services
    verify_stopped
    cleanup_logs
    if ! start_backend; then
        final_health_check
        exit 1
    fi
    if ! start_frontend; then
        final_health_check
        exit 1
    fi
    final_health_check
}

main 