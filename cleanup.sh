#!/bin/bash

# MCP Log Server - Environment Cleanup Script
# Description: This script lists and kills processes on specified ports,
# verifies that they have been terminated, and cleans up log files.

# --- Configuration ---
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

# --- Main Functions ---

# Function to list processes on a given port
list_processes_on_port() {
    local port=$1
    print_status "Checking for processes on port $port..."
    if lsof -i TCP:$port -sTCP:LISTEN -P; then
        return 0
    else
        print_success "No processes found listening on port $port."
        return 1
    fi
}

# Function to kill all processes listening on a given port
kill_processes_on_port() {
    local port=$1
    local pids=$(lsof -t -i TCP:$port -sTCP:LISTEN 2>/dev/null)

    if [ -n "$pids" ]; then
        local pid_list=$(echo "$pids" | tr '\n' ' ')
        print_warning "Port $port is in use by PID(s): $pid_list. Terminating."
        kill -9 $pid_list >/dev/null 2>&1
    fi
}

# Function to verify a port is free
verify_port_is_free() {
    local port=$1
    print_status "Verifying port $port is free..."
    if lsof -i TCP:$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_error "Port $port is still in use. Cleanup may have failed."
    else
        print_success "Port $port is now clear."
    fi
}

# Function to clean up log files
cleanup_log_files() {
    print_header "Step 3: Cleaning Up Log Files"
    local cleaned_count=0
    for log_file in "${LOG_FILES_TO_CLEAN[@]}"; do
        if [ -f "$log_file" ]; then
            rm -f "$log_file"
            print_status "Removed $log_file."
            cleaned_count=$((cleaned_count + 1))
        fi
    done
    if [ $cleaned_count -eq 0 ]; then
        print_success "No log files found to clean."
    else
        print_success "Log file cleanup complete."
    fi
}

# --- Main Execution ---
main() {
    print_header "Step 1: Listing Running Applications"
    for port in "${PORTS_TO_CLEAN[@]}"; do
        list_processes_on_port "$port"
    done

    print_header "Step 2: Killing Applications"
    
    print_status "Forcefully killing processes by name..."
    # Kill any lingering 'mcp-log-server' processes
    mcp_pids=$(ps -ef | grep "[m]cp-log-server" | awk '{print $2}')
    if [ -n "$mcp_pids" ]; then
        print_warning "Found lingering mcp-log-server processes. Terminating PIDs: $mcp_pids"
        kill -9 $mcp_pids 2>/dev/null
    fi
    
    # Kill any lingering 'next' processes (for the frontend)
    next_pids=$(ps -ef | grep "[n]ext" | awk '{print $2}')
    if [ -n "$next_pids" ]; then
        print_warning "Found lingering next processes. Terminating PIDs: $next_pids"
        kill -9 $next_pids 2>/dev/null
    fi

    for port in "${PORTS_TO_CLEAN[@]}"; do
        kill_processes_on_port "$port"
    done
    
    echo ""
    print_status "Waiting a moment for processes to terminate..."
    sleep 1 # Give the OS a moment to release the ports

    for port in "${PORTS_TO_CLEAN[@]}"; do
        verify_port_is_free "$port"
    done

    cleanup_log_files
    
    echo ""
    print_success "Cleanup script finished."
}

# Execute main function
main 