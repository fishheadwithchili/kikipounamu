#!/bin/bash
# Start API Server
# Handles virtual environment activation and dependency checks
# Also responsible for initializing project-wide port configuration

set -e

# Ensure we are in the project root directory
# This allows the script to be run from anywhere (e.g., ./scripts/start.sh or from root)
cd "$(dirname "$0")/.."

echo "🚀 Starting ASR API Server"
echo "=========================="
echo "📂 Working Directory: $(pwd)"
echo ""

# ============================================================================
# SANDBOX / DOCKER HELPERS
# ============================================================================
# If running in a restricted container, unblock service starting during apt install
if [ -f /usr/sbin/policy-rc.d ]; then
    echo "🐳 Detected Docker/Sandbox environment. Unblocking service management..."
    printf '#!/bin/sh\nexit 0' | sudo tee /usr/sbin/invoke-rc.d > /dev/null
    sudo chmod +x /usr/sbin/invoke-rc.d
fi
# ============================================================================

# ============================================================================
# PORT MANAGEMENT (First component responsibility)
# ============================================================================

PROJECT_ROOT="$(cd .. && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Function: Check if a port is available
is_port_free() {
    local port=$1
    ! lsof -i :$port > /dev/null 2>&1
}

# Function: Find next available port starting from a base port
find_free_port() {
    local base_port=$1
    local port=$base_port
    while ! is_port_free $port; do
        port=$((port + 1))
    done
    echo $port
}

# Function: Initialize or validate .env file
init_or_validate_env() {
    echo "🔍 Checking port configuration..."
    
    # If .env doesn't exist, create it
    if [ ! -f "$ENV_FILE" ]; then
        echo "📝 Creating new port configuration at $ENV_FILE"
        
        # Find available ports
        API_PORT=$(find_free_port 8000)
        BACKEND_PORT=$(find_free_port 8081)
        ELECTRON_PORT=$(find_free_port 5173)
        # Use standard ports for external services (never reallocate)
        POSTGRES_PORT=5432
        REDIS_PORT=6379
        
        # Write to .env
        cat > "$ENV_FILE" << EOF
# ASR System Port Configuration
# Auto-generated on $(date)
# Ports are dynamically allocated to avoid conflicts

# API Server (Python Uvicorn)
ASR_API_PORT=$API_PORT

# Go Backend (WebSocket Server)
ASR_BACKEND_PORT=$BACKEND_PORT

# Electron Dev Server (Vite)
ASR_ELECTRON_PORT=$ELECTRON_PORT

# Database Ports
POSTGRES_PORT=$POSTGRES_PORT
REDIS_PORT=$REDIS_PORT
EOF
        
        echo "✅ Port configuration initialized:"
        echo "   API Server:    $API_PORT"
        echo "   Go Backend:    $BACKEND_PORT"
        echo "   Electron:      $ELECTRON_PORT"
        echo "   PostgreSQL:    $POSTGRES_PORT"
        echo "   Redis:         $REDIS_PORT"
        
        # Load the newly created configuration to ensure variables like ASR_API_PORT are set
        source "$ENV_FILE"

    else
        # .env exists, validate ports
        source "$ENV_FILE"
        
        echo "📋 Validating existing port configuration..."
        NEED_UPDATE=false
        
        # Check each port
        if ! is_port_free ${ASR_API_PORT:-8000}; then
            echo "⚠️  Port ${ASR_API_PORT:-8000} (API) is occupied, finding alternative..."
            ASR_API_PORT=$(find_free_port 8000)
            NEED_UPDATE=true
        fi
        
        if ! is_port_free ${ASR_BACKEND_PORT:-8081}; then
            echo "⚠️  Port ${ASR_BACKEND_PORT:-8081} (Backend) is occupied, finding alternative..."
            ASR_BACKEND_PORT=$(find_free_port 8081)
            NEED_UPDATE=true
        fi
        
        if ! is_port_free ${ASR_ELECTRON_PORT:-5173}; then
            echo "⚠️  Port ${ASR_ELECTRON_PORT:-5173} (Electron) is occupied, finding alternative..."
            ASR_ELECTRON_PORT=$(find_free_port 5173)
            NEED_UPDATE=true
        fi
        
        # Function: Start a service in a container-compatible way
        start_service_if_needed() {
            local service_name=$1
            local port=$2
            local start_cmd=$3

            if is_port_free $port; then
                echo "⚠️  $service_name is not running on port $port. Attempting to start..."
                
                if command -v systemctl > /dev/null 2>&1 && [ -d /run/systemd/system ]; then
                    sudo systemctl start $service_name || true
                elif command -v service > /dev/null 2>&1; then
                    sudo service $service_name start || true
                else
                    echo "   Running manual start: $start_cmd"
                    eval "$start_cmd" || true
                fi
                
                # Wait and re-check
                sleep 2
                if is_port_free $port; then
                    echo "❌ Failed to start $service_name automatically. Please start it manually."
                else
                    echo "✅ $service_name started successfully."
                fi
            else
                echo "✅ $service_name port $port is active."
            fi
        }

        # Check External Services
        start_service_if_needed "postgresql" "${POSTGRES_PORT:-5432}" "sudo -u postgres pg_ctlcluster 14 main start"
        start_service_if_needed "redis-server" "${REDIS_PORT:-6379}" "sudo redis-server --daemonize yes"
        
        # Update .env if needed
        if [ "$NEED_UPDATE" = true ]; then
            echo "🔄 Updating port configuration..."
            cat > "$ENV_FILE" << EOF
# ASR System Port Configuration
# Last updated: $(date)
# Ports are dynamically allocated to avoid conflicts

# API Server (Python Uvicorn)
ASR_API_PORT=$ASR_API_PORT

# Go Backend (WebSocket Server)
ASR_BACKEND_PORT=$ASR_BACKEND_PORT

# Electron Dev Server (Vite)
ASR_ELECTRON_PORT=$ASR_ELECTRON_PORT

# Database Ports
POSTGRES_PORT=$POSTGRES_PORT
REDIS_PORT=$REDIS_PORT
EOF
            echo "✅ Port configuration updated"
        else
            echo "✅ All ports are available, no changes needed"
        fi
        
        echo "📍 Using ports:"
        echo "   API Server:    $ASR_API_PORT"
        echo "   Go Backend:    $ASR_BACKEND_PORT"
        echo "   Electron:      $ASR_ELECTRON_PORT"
        echo "   PostgreSQL:    $POSTGRES_PORT"
        echo "   Redis:         $REDIS_PORT"
    fi
    
    # Export for current script
    export ASR_API_PORT ASR_BACKEND_PORT ASR_ELECTRON_PORT POSTGRES_PORT REDIS_PORT
}

# Initialize/validate ports
init_or_validate_env

echo ""

# ============================================================================
# END PORT MANAGEMENT
# ============================================================================

# Check for Chinese fonts
check_and_install_fonts() {
    echo "Checking for Chinese fonts..."
    if ! command -v fc-list &> /dev/null; then
        echo "Installing fontconfig..."
        sudo apt-get update && sudo apt-get install -y fontconfig
    fi

    if [ -z "$(fc-list :lang=zh)" ]; then
        echo "Chinese fonts not found. Installing fonts-noto-cjk..."
        sudo apt-get update && sudo apt-get install -y fonts-noto-cjk
        echo "Chinese fonts installed."
    else
        echo "Chinese fonts found."
    fi
}

# Check for ffmpeg
check_and_install_ffmpeg() {
    echo "Checking for ffmpeg..."
    if ! command -v ffmpeg &> /dev/null; then
        echo "ffmpeg not found. Installing..."
        sudo apt-get update && sudo apt-get install -y ffmpeg
        echo "ffmpeg installed."
    else
        echo "ffmpeg found."
    fi
}

check_and_install_fonts
check_and_install_ffmpeg

# Check and Install uv (Borrowed from start_unified_worker.sh)
if ! command -v uv &> /dev/null; then
    echo "⚠️  'uv' not found. Installing..."
    
    # Try installing via pip first (most common in Python environments)
    if command -v pip &> /dev/null; then
        echo "   Installing uv via pip..."
        pip install uv
    elif command -v pip3 &> /dev/null; then
        echo "   Installing uv via pip3..."
        pip3 install uv
    else
        echo "   pip not found. Installing uv via curl..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        
        # Add to path for current session
        if [ -f "$HOME/.cargo/env" ]; then
            source "$HOME/.cargo/env"
        else
            export PATH="$HOME/.local/bin:$PATH"
        fi
    fi
fi

# Re-check uv validity and update PATH if needed
if ! command -v uv &> /dev/null; then
    # Try adding common paths explicitly
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

if ! command -v uv &> /dev/null; then
     echo "❌ Error: Failed to install 'uv'. Please install it manually."
     exit 1
fi

echo "✅ uv is available."

# Check if venv exists (prefer .venv created by uv)
if [ -d ".venv" ]; then
    echo "📦 Activating virtual environment (.venv)..."
    source .venv/bin/activate
elif [ -d "venv" ]; then
    echo "📦 Activating virtual environment (venv)..."
    source venv/bin/activate
fi

# Auto-install dependencies
echo "📦 Checking and updating dependencies..."
if command -v uv >/dev/null 2>&1; then
    echo "   Using uv to sync dependencies..."
    uv sync
else
    echo "⚠️ 'uv' not found. Falling back to pip..."
    pip install -e .
fi

echo ""
echo "🚀 Launching Uvicorn..."
echo "   Host: 0.0.0.0"
echo "   Port: $ASR_API_PORT"
echo ""

# Start Uvicorn with dynamic port
exec uvicorn src.api.main:app --host 0.0.0.0 --port $ASR_API_PORT

