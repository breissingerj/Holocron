#!/bin/bash

# Stop the Holocron Voice Server

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "${SCRIPT_DIR}/platform.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}> Stopping Holocron Voice Server...${NC}"

if svc_is_running; then
    svc_stop

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}OK Voice server stopped successfully${NC}"
    else
        echo -e "${RED}X Failed to stop voice server${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}! Voice server is not running${NC}"
fi

# Kill any remaining processes on port 8888
if lsof -i :8888 > /dev/null 2>&1; then
    echo -e "${YELLOW}> Cleaning up port 8888...${NC}"
    lsof -ti :8888 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}OK Port 8888 cleared${NC}"
fi
