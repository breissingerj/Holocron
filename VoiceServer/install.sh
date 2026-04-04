#!/bin/bash

# Holocron Voice Server Installation Script
# Installs the voice server as a macOS LaunchAgent service.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVICE_NAME="com.holocron.voice-server"
PLIST_PATH="$HOME/Library/LaunchAgents/${SERVICE_NAME}.plist"
LOG_PATH="$HOME/Library/Logs/holocron-voice-server.log"
ENV_FILE="$HOME/.env"

echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}     Holocron Voice Server Installation${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo

# Check for Bun
echo -e "${YELLOW}> Checking prerequisites...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${RED}X Bun is not installed${NC}"
    echo "  Please install Bun first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo -e "${GREEN}OK Bun is installed${NC}"

# Check for existing installation
if launchctl list | grep -q "$SERVICE_NAME" 2>/dev/null; then
    echo -e "${YELLOW}! Voice server is already installed${NC}"
    read -p "Do you want to reinstall? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}> Stopping existing service...${NC}"
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
        echo -e "${GREEN}OK Existing service stopped${NC}"
    else
        echo "Installation cancelled"
        exit 0
    fi
fi

# Check config.json
echo -e "${YELLOW}> Checking voice configuration...${NC}"
if [ -f "$SCRIPT_DIR/config.json" ]; then
    echo -e "${GREEN}OK config.json found${NC}"
else
    echo -e "${YELLOW}! config.json not found${NC}"
    echo "  Copy config.json.example to config.json and fill in your ElevenLabs voice IDs:"
    echo "  cp $SCRIPT_DIR/config.json.example $SCRIPT_DIR/config.json"
fi

# Check for ElevenLabs API key
echo -e "${YELLOW}> Checking ElevenLabs configuration...${NC}"
if [ -f "$ENV_FILE" ] && grep -q "ELEVENLABS_API_KEY=" "$ENV_FILE"; then
    API_KEY=$(grep "ELEVENLABS_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
    if [ "$API_KEY" != "your_api_key_here" ] && [ -n "$API_KEY" ]; then
        echo -e "${GREEN}OK ElevenLabs API key configured${NC}"
        ELEVENLABS_CONFIGURED=true
    else
        echo -e "${YELLOW}! ElevenLabs API key placeholder found${NC}"
        ELEVENLABS_CONFIGURED=false
    fi
else
    echo -e "${YELLOW}! No ElevenLabs configuration found${NC}"
    echo "  Add to ~/.env: ELEVENLABS_API_KEY=your_key_here"
    echo "  Get a free key at: https://elevenlabs.io"
    ELEVENLABS_CONFIGURED=false
fi
echo

# Create LaunchAgent plist
echo -e "${YELLOW}> Creating LaunchAgent configuration...${NC}"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>$(which bun)</string>
        <string>run</string>
        <string>${SCRIPT_DIR}/server.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_PATH}</string>

    <key>StandardErrorPath</key>
    <string>${LOG_PATH}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.bun/bin</string>
    </dict>
</dict>
</plist>
EOF

echo -e "${GREEN}OK LaunchAgent configuration created${NC}"

# Load the LaunchAgent
echo -e "${YELLOW}> Starting voice server service...${NC}"
launchctl load "$PLIST_PATH" 2>/dev/null || {
    echo -e "${RED}X Failed to load LaunchAgent${NC}"
    echo "  Try manually: launchctl load $PLIST_PATH"
    exit 1
}

# Wait for server to start
sleep 2

# Test the server
echo -e "${YELLOW}> Testing voice server...${NC}"
if curl -s -f -X GET http://localhost:8888/health > /dev/null 2>&1; then
    echo -e "${GREEN}OK Voice server is running${NC}"
    curl -s -X POST http://localhost:8888/notify \
        -H "Content-Type: application/json" \
        -d '{"message": "Holocron voice server installed successfully", "voice_enabled": false}' > /dev/null
    echo -e "${GREEN}OK Test notification sent${NC}"
else
    echo -e "${RED}X Voice server is not responding${NC}"
    echo "  Check logs at: $LOG_PATH"
    echo "  Try running manually: bun run $SCRIPT_DIR/server.ts"
    exit 1
fi

echo
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}     Installation Complete!${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo
echo -e "${BLUE}Service Information:${NC}"
echo "  - Service: $SERVICE_NAME"
echo "  - Status:  Running"
echo "  - Port:    8888"
echo "  - Logs:    $LOG_PATH"
echo "  - Voice:   $([ "$ELEVENLABS_CONFIGURED" = true ] && echo 'ElevenLabs AI' || echo 'Not configured (check ~/.env)')"
echo
echo -e "${BLUE}Management Commands:${NC}"
echo "  - Status:    ./status.sh"
echo "  - Stop:      ./stop.sh"
echo "  - Start:     ./start.sh"
echo "  - Restart:   ./restart.sh"
echo "  - Uninstall: ./uninstall.sh"
echo
echo -e "${BLUE}Test the server:${NC}"
echo "  curl -X POST http://localhost:8888/notify \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"message\": \"Hello from Holocron\"}'"
echo
echo -e "${GREEN}The voice server will start automatically when you log in.${NC}"
