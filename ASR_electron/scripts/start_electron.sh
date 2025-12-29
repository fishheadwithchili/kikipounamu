#!/bin/bash

# Get the script's parent directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Switch to project root
cd "$PROJECT_ROOT"

echo "🚀 Starting ASR Electron App..."

# ============================================================================
# LOAD PORT CONFIGURATION
# ============================================================================

# Path to centralized .env (managed by start_api_server.sh)
KIKIPOUNAMU_ROOT="$(cd .. && pwd)"
CENTRAL_ENV="$KIKIPOUNAMU_ROOT/.env"
LOCAL_ENV="$PROJECT_ROOT/.env"

if [ -f "$CENTRAL_ENV" ]; then
    echo "📋 Loading port configuration from $CENTRAL_ENV"
    source "$CENTRAL_ENV"
    
    # Update local .env for Electron (Vite needs VITE_ prefix)
    cat > "$LOCAL_ENV" << EOF
VITE_USER_ID=user_123456
VITE_ASR_BACKEND_URL=ws://localhost:${ASR_BACKEND_PORT:-8081}/ws/asr
EOF
    
    echo "   Backend URL: ws://localhost:${ASR_BACKEND_PORT:-8081}/ws/asr"
else
    echo "⚠️  Port configuration not found. Using defaults."
    echo "   Please run ASR_server/scripts/start_api_server.sh first."
    
    # Create default .env if it doesn't exist
    if [ ! -f "$LOCAL_ENV" ]; then
        cat > "$LOCAL_ENV" << EOF
VITE_USER_ID=user_123456
VITE_ASR_BACKEND_URL=ws://localhost:8081/ws/asr
EOF
    fi
fi

echo ""

# ============================================================================
# END PORT CONFIGURATION
# ============================================================================

# 1. Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js (v18+ recommended)."
    exit 1
fi

# 2. Check and install dependencies
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   node_modules not found. Installing dependencies..."
    npm install
else
    # Simple check: if package.json is newer than node_modules, update might be needed
    if [ "package.json" -nt "node_modules" ]; then
        echo "   package.json is newer than node_modules. Updating dependencies..."
        npm install
    else
        echo "   Dependencies look up to date."
    fi
fi

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies."
    exit 1
fi

# 4. Check and install Linux system dependencies (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 Detected Linux. Checking system dependencies..."
    
    REQUIRED_LIBS=("libnss3" "libatk1.0-0" "libatk-bridge2.0-0" "libcups2" "libdrm2" "libxkbcommon0" "libxcomposite1" "libxdamage1" "libxfixes3" "libxrandr2" "libgbm1" "libasound2" "xdotool" "xdg-utils")
    MISSING_LIBS=()

    for lib in "${REQUIRED_LIBS[@]}"; do
        if ! dpkg -s "$lib" &> /dev/null; then
            MISSING_LIBS+=("$lib")
        fi
    done

    if [ ${#MISSING_LIBS[@]} -ne 0 ]; then
        echo "⚠️  Missing system libraries: ${MISSING_LIBS[*]}"
        echo "🔧 Installing missing libraries (requires sudo password)..."
        
        sudo apt-get update
        sudo apt-get install -y "${MISSING_LIBS[@]}"
        
        if [ $? -ne 0 ]; then
            echo "❌ Error: Failed to install system dependencies."
            exit 1
        fi
        echo "✅ System dependencies installed."
    else
        echo "✅ All system dependencies are satisfied."
    fi

    # ============================================================================
    # ANDROIDMIC VIRTUAL MICROPHONE SETUP (Linux only)
    # ============================================================================
    
    # Check if AndroidMic sink exists (user is running AndroidMic app)
    if pactl list sinks short 2>/dev/null | grep -q "AndroidMic"; then
        echo "📱 AndroidMic detected. Setting up virtual microphone..."
        
        # Create remap-source if it doesn't exist
        if ! pactl list sources short 2>/dev/null | grep -q "AndroidMic_Source"; then
            pactl load-module module-remap-source master=AndroidMic.monitor \
                source_name=AndroidMic_Source \
                source_properties="device.description='Android_Microphone'" \
                format=s16le rate=48000 channels=1 2>/dev/null
            echo "   ✅ Created AndroidMic_Source"
        else
            echo "   ✅ AndroidMic_Source already exists"
        fi
        
        # Set AndroidMic volume to 100%
        SINK_INPUT=$(pactl list sink-inputs short 2>/dev/null | grep -v "module-loopback" | head -1 | awk '{print $1}')
        if [ -n "$SINK_INPUT" ]; then
            pactl set-sink-input-volume "$SINK_INPUT" 100% 2>/dev/null
            echo "   ✅ Set AndroidMic volume to 100%"
        fi
        
        echo "   🎤 Select 'Android_Microphone' in Settings to use your phone mic"
    fi
fi

# 5. Start Application
echo "⚛️ Starting Electron..."
npm run dev
