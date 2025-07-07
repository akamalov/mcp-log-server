#!/bin/bash

# MCP Log Server - Comprehensive Development Startup Script
# Version: 2.0
# Description: This script ensures a clean environment by killing existing processes,
# cleaning logs, and then starting and verifying the backend and frontend services sequentially.

# --- Configuration ---
BACKEND_PORT=3001
FRONTEND_PORT=3000
MAX_WAIT_TIME=60  # Max time to wait for services in seconds
HEALTH_CHECK_INTERVAL=2 # Seconds between health checks
LOG_LINES_TO_SHOW=15 # Number of log lines to show in the final report

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

# Function to kill all processes listening on a given port
kill_processes_on_port() {
    local port=$1
    print_status "Checking for processes on port $port..."
    local pids=$(lsof -t -i TCP:$port -sTCP:LISTEN 2>/dev/null)

    if [ -n "$pids" ]; then
        local pid_list=$(echo "$pids" | tr '\n' ' ')
        print_warning "Port $port is in use by PID(s): $pid_list. Terminating."
        kill -9 $pid_list >/dev/null 2>&1
        
        # Wait for the port to be free
        local wait_start_time=$(date +%s)
        while is_port_listening "$port"; do
            local now=$(date +%s)
            if (( now - wait_start_time > 10 )); then
                print_error "Failed to free port $port after 10 seconds."
                exit 1
            fi
            sleep 0.5
        done
        print_success "Port $port has been successfully cleared."
    else
        print_success "Port $port is already clear."
    fi
}

# --- Service Functions ---

cleanup_log_files() {
    print_header "Step 1: Cleaning Up Log Files"
    rm -f backend.log frontend.log
    print_success "Removed old backend.log and frontend.log."
}

prepare_environment() {
    print_header "Step 2: Preparing Environment"
    kill_processes_on_port $FRONTEND_PORT
    kill_processes_on_port $BACKEND_PORT
}

start_backend() {
    print_header "Step 3: Starting Backend Server"
    pnpm --filter server dev > backend.log 2>&1 &
    local pid=$!
    echo $pid > .backend.pid
    print_status "Backend process started with PID $pid."

    print_status "Waiting for backend to become healthy (up to $MAX_WAIT_TIME seconds)..."
    local start_time=$(date +%s)
    while true; do
        if is_port_listening $BACKEND_PORT && curl -s "http://localhost:$BACKEND_PORT/health" | grep -q '"status":"healthy"'; then
            print_success "Backend is healthy and responding on port $BACKEND_PORT."
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
    print_header "Step 4: Starting Frontend Server"

    local max_retries=3
    local attempt=1
    local pid

    while [ $attempt -le $max_retries ]; do
        print_status "Starting frontend server (Attempt $attempt of $max_retries)..."
        
        # Ensure port is clear right before starting
        kill_processes_on_port $FRONTEND_PORT

        pnpm --filter web dev > frontend.log 2>&1 &
        pid=$!
        echo $pid > .frontend.pid
        print_status "Frontend process started with PID $pid."

        print_status "Waiting for frontend to launch on port $FRONTEND_PORT..."
        sleep 5 # Give it a few seconds to either succeed or fail

        if is_port_listening $FRONTEND_PORT; then
            print_success "Frontend is running and listening on port $FRONTEND_PORT."
            return 0
        fi

        # If it's not listening, check if it died with EADDRINUSE
        if grep -q "EADDRINUSE" frontend.log; then
            print_warning "Frontend failed with EADDRINUSE on attempt $attempt. Retrying in 2 seconds..."
            attempt=$((attempt + 1))
            sleep 2
        else
            # If it failed for another reason, don't retry
            print_error "Frontend process (PID $pid) died for a reason other than EADDRINUSE."
            return 1
        fi
    done

    print_error "Frontend failed to start after $max_retries attempts. The EADDRINUSE error is persistent."
    return 1
}

report_final_status() {
    print_header "Step 5: Final Status Report"
    print_success "🎉 Development environment is ready!"
    print_status "Backend URL:  http://localhost:$BACKEND_PORT"
    print_status "Frontend URL: http://localhost:$FRONTEND_PORT"
    
    echo -e "\n${CYAN}--- Last $LOG_LINES_TO_SHOW Backend Log Lines ---${NC}"
    if [ -f backend.log ]; then tail -n $LOG_LINES_TO_SHOW backend.log; else print_warning "backend.log not found."; fi
    
    echo -e "\n${CYAN}--- Last $LOG_LINES_TO_SHOW Frontend Log Lines ---${NC}"
    if [ -f frontend.log ]; then tail -n $LOG_LINES_TO_SHOW frontend.log; else print_warning "frontend.log not found."; fi
}

# --- Main Execution ---
main() {
    cleanup_log_files
    prepare_environment
    
    if ! start_backend; then
        report_final_status
        print_error "Halting script due to backend failure."
        exit 1
    fi
    
    if ! start_frontend; then
        report_final_status
        print_error "Halting script due to frontend failure."
        exit 1
    fi

    report_final_status
}

# --- Cleanup on Exit ---
cleanup_on_exit() {
    echo ""
    print_header "Script finished. Cleaning up background processes..."
    if [ -f .backend.pid ]; then
        kill $(cat .backend.pid) >/dev/null 2>&1
        rm -f .backend.pid
    fi
    if [ -f .frontend.pid ]; then
        kill $(cat .frontend.pid) >/dev/null 2>&1
        rm -f .frontend.pid
    fi
    print_success "Cleanup complete."
}

# Trap SIGINT (Ctrl+C) and EXIT
trap cleanup_on_exit EXIT

# Execute main function
main

# Keep script alive to manage background processes if needed.
# The trap on EXIT will handle cleanup when this script is terminated.
print_status "Services are running in the background. Press Ctrl+C to stop all services and exit."
wait