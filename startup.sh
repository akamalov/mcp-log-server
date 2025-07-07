#!/bin/bash

# MCP Log Server - Service Startup Script
# Version: 1.0
# Description: This script checks the status of required ports, then starts
# the backend and frontend services sequentially, verifying each one.
# For a clean environment, run ./cleanup.sh before this script.

# --- Configuration ---
BACKEND_PORT=3001
FRONTEND_PORT=3000
MAX_WAIT_TIME=60  # Max time to wait for services in seconds
HEALTH_CHECK_INTERVAL=2 # Seconds between health checks

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

# --- Process and Port Management ---

# Function to check if a port is in use by a listening process
is_port_listening() {
    lsof -i TCP:$1 -sTCP:LISTEN -t >/dev/null 2>&1
}

# --- Service Functions ---

check_initial_status() {
    print_header "Step 1: Checking Initial Port Status"
    local all_clear=true
    
    # Check Backend Port
    print_status "Checking backend port $BACKEND_PORT..."
    if is_port_listening $BACKEND_PORT; then
        print_warning "Backend port $BACKEND_PORT is already in use."
        all_clear=false
    else
        print_success "Backend port $BACKEND_PORT is clear."
    fi

    # Check Frontend Port
    print_status "Checking frontend port $FRONTEND_PORT..."
    if is_port_listening $FRONTEND_PORT; then
        print_warning "Frontend port $FRONTEND_PORT is already in use."
        all_clear=false
    else
        print_success "Frontend port $FRONTEND_PORT is clear."
    fi

    if [ "$all_clear" = false ]; then
        print_warning "One or more ports are occupied. Run ./cleanup.sh for a clean start."
    fi
}

start_backend() {
    print_header "Step 2: Starting Backend Server"
    if is_port_listening $BACKEND_PORT; then
        print_warning "Backend process is already running or port is blocked. Skipping start."
        return 0
    fi

    pnpm --filter server dev > backend.log 2>&1 &
    local pid=$!
    echo $pid > .backend.pid
    print_status "Backend process started with PID $pid."
    
    # Wait for health check
    print_status "Waiting for backend to become healthy..."
    local start_time=$(date +%s)
    while true; do
        if is_port_listening $BACKEND_PORT && curl -s "http://localhost:$BACKEND_PORT/health" | grep -q '"status":"healthy"'; then
            print_success "Backend is healthy."
            return 0
        fi
        
        local now=$(date +%s)
        if (( now - start_time > MAX_WAIT_TIME )); then
            print_error "Backend failed to become healthy within $MAX_WAIT_TIME seconds."
            return 1
        fi
        printf "."
        sleep $HEALTH_CHECK_INTERVAL
    done
}

start_frontend() {
    print_header "Step 3: Starting Frontend Server"
    if is_port_listening $FRONTEND_PORT; then
        print_warning "Frontend process is already running or port is blocked. Skipping start."
        return 0
    fi
    
    pnpm --filter web dev --port $FRONTEND_PORT > frontend.log 2>&1 &
    local pid=$!
    echo $pid > .frontend.pid
    print_status "Frontend process started with PID $pid."
    
    # Wait for port to be active
    print_status "Waiting for frontend to launch..."
    local start_time=$(date +%s)
    while true; do
        if is_port_listening $FRONTEND_PORT; then
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
        printf "."
        sleep $HEALTH_CHECK_INTERVAL
    done
}

final_health_check() {
    print_header "Step 4: Final Health Check"
    local services_ok=true
    
    # Check Backend
    if is_port_listening $BACKEND_PORT && curl -s "http://localhost:$BACKEND_PORT/health" | grep -q '"status":"healthy"'; then
        print_success "Backend is UP and healthy."
    else
        print_error "Backend is DOWN or unhealthy."
        services_ok=false
    fi

    # Check Frontend
    if is_port_listening $FRONTEND_PORT; then
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
    check_initial_status
    
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

# --- Cleanup on Exit ---
cleanup_on_exit() {
    echo ""
    print_header "Script finished. To stop services, run ./cleanup.sh"
}

# Trap SIGINT (Ctrl+C) to show a clean exit message
trap cleanup_on_exit SIGINT

# Execute main function
main

# Let the script exit, background processes will continue to run
# Use ./cleanup.sh to stop them.
exit 0 