#!/bin/bash

# Uninstall Holocron Voice Server

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "${SCRIPT_DIR}/platform.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}     Holocron Voice Server Uninstall${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo

echo -e "${YELLOW}This will:${NC}"
echo "  - Stop the voice server"
echo "  - Remove the service configuration"
echo "  - Keep your server files and configuration"
echo
read -p "Are you sure you want to uninstall? (y/n): " -n 1 -r
echo
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled"
    exit 0
fi

echo -e "${YELLOW}> Stopping voice server...${NC}"
if svc_is_running; then
    svc_stop
    [[ "$PLATFORM" != "darwin" ]] && svc_disable
    echo -e "${GREEN}OK Voice server stopped${NC}"
else
    echo -e "${YELLOW}  Service was not running${NC}"
fi

echo -e "${YELLOW}> Removing service file...${NC}"
if [ -f "$PLIST_PATH" ]; then
    rm "$PLIST_PATH"
    [[ "$PLATFORM" != "darwin" ]] && systemctl --user daemon-reload 2>/dev/null || true
    echo -e "${GREEN}OK Service file removed${NC}"
else
    echo -e "${YELLOW}  Service file not found${NC}"
fi

if lsof -i :8888 > /dev/null 2>&1; then
    echo -e "${YELLOW}> Cleaning up port 8888...${NC}"
    lsof -ti :8888 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}OK Port 8888 cleared${NC}"
fi

echo
read -p "Do you want to remove log files? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "$LOG_PATH" ]; then
        rm "$LOG_PATH"
        echo -e "${GREEN}OK Log file removed${NC}"
    fi
fi

echo
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}     Uninstall Complete${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo
echo -e "${BLUE}Notes:${NC}"
echo "  - Your server files are still in: $(dirname "${BASH_SOURCE[0]}")"
echo "  - Your ~/.env configuration is preserved"
echo "  - To reinstall, run: ./install.sh"
echo
echo "To completely remove all files:"
echo "  rm -rf $(dirname "${BASH_SOURCE[0]}")"
