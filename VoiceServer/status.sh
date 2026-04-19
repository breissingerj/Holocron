#!/bin/bash

# Check status of Holocron Voice Server

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "${SCRIPT_DIR}/platform.sh"
ENV_FILE="$HOME/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}     Holocron Voice Server Status${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo

echo -e "${BLUE}Service Status:${NC}"
if svc_is_running; then
    if [[ "$PLATFORM" == "darwin" ]]; then
        PID=$(launchctl list | grep "$SERVICE_NAME" | awk '{print $1}')
    else
        PID=$(systemctl --user show --property=MainPID --value holocron-voice-server 2>/dev/null)
    fi
    if [ -n "$PID" ] && [ "$PID" != "-" ] && [ "$PID" != "0" ]; then
        echo -e "  ${GREEN}OK Service is running (PID: $PID)${NC}"
    else
        echo -e "  ${GREEN}OK Service is running${NC}"
    fi
else
    echo -e "  ${RED}X Service is not running${NC}"
fi

echo
echo -e "${BLUE}Server Status:${NC}"
if curl -s -f -X GET http://localhost:8888/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}OK Server is responding on port 8888${NC}"
    HEALTH=$(curl -s http://localhost:8888/health)
    echo "  Response: $HEALTH"
else
    echo -e "  ${RED}X Server is not responding${NC}"
fi

echo
echo -e "${BLUE}Port Status:${NC}"
if lsof -i :8888 > /dev/null 2>&1; then
    PROCESS=$(lsof -i :8888 | grep LISTEN | head -1)
    echo -e "  ${GREEN}OK Port 8888 is in use${NC}"
    echo "$PROCESS" | awk '{print "  Process: " $1 " (PID: " $2 ")"}'
else
    echo -e "  ${YELLOW}! Port 8888 is not in use${NC}"
fi

echo
echo -e "${BLUE}Voice Configuration:${NC}"
if [ -f "$ENV_FILE" ] && grep -q "ELEVENLABS_API_KEY=" "$ENV_FILE"; then
    API_KEY=$(grep "ELEVENLABS_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
    if [ "$API_KEY" != "your_api_key_here" ] && [ -n "$API_KEY" ]; then
        echo -e "  ${GREEN}OK ElevenLabs API configured${NC}"
    else
        echo -e "  ${YELLOW}! ElevenLabs API key is placeholder — update ~/.env${NC}"
    fi
else
    echo -e "  ${YELLOW}! No ElevenLabs API key found in ~/.env${NC}"
fi

echo
echo -e "${BLUE}Recent Logs:${NC}"
if [ -f "$LOG_PATH" ]; then
    echo "  Log file: $LOG_PATH"
    echo "  Last 5 lines:"
    tail -5 "$LOG_PATH" | while IFS= read -r line; do
        echo "    $line"
    done
else
    echo -e "  ${YELLOW}! No log file found${NC}"
fi

echo
echo -e "${BLUE}Available Commands:${NC}"
echo "  - Start:     ./start.sh"
echo "  - Stop:      ./stop.sh"
echo "  - Restart:   ./restart.sh"
echo "  - Logs:      tail -f $LOG_PATH"
echo "  - Test:      curl -X POST http://localhost:8888/notify -H 'Content-Type: application/json' -d '{\"message\":\"Test\"}'"
