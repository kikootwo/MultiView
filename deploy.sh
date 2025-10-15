#!/bin/bash
# MultiView Quick Deployment Script

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              MultiView Deployment Script                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect server IP for display purposes (not used for configuration)
echo -e "${BLUE}Detecting server IP address...${NC}"

SERVER_IP=""

# Method 1: Try to get Windows host IP from PowerShell (WSL2 specific)
if command -v powershell.exe &> /dev/null; then
    WIN_IP=$(powershell.exe -Command "Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Ethernet*','Wi-Fi*' | Where-Object {(\$_.IPAddress -like '192.168.*') -or (\$_.IPAddress -like '10.*')} | Select-Object -First 1 -ExpandProperty IPAddress" 2>/dev/null | tr -d '\r')
    if [ -n "$WIN_IP" ]; then
        SERVER_IP=$WIN_IP
        echo -e "${GREEN}✓ Detected Windows host IP via PowerShell${NC}"
    fi
fi

# Method 2: Try ip addr (works on native Linux)
if [ -z "$SERVER_IP" ] && command -v ip &> /dev/null; then
    SERVER_IP=$(ip addr show | grep "inet " | grep -v "127.0.0.1" | grep -v "172\." | grep -v "169.254" | grep -v "10.255" | awk '{print $2}' | cut -d/ -f1 | grep -E "^(192\.168|10\.)" | head -1)
    if [ -n "$SERVER_IP" ]; then
        echo -e "${GREEN}✓ Detected LAN IP via ip addr${NC}"
    fi
fi

# Method 3: Ask user if auto-detection failed
if [ -z "$SERVER_IP" ]; then
    echo -e "${YELLOW}⚠ Could not auto-detect LAN IP.${NC}"
    echo -e "${YELLOW}Please enter your LAN IP address (e.g., 192.168.1.100):${NC}"
    echo -e "${YELLOW}Find it with 'ipconfig' (Windows) or 'ip addr' (Linux)${NC}"
    read -p "Server IP: " SERVER_IP
fi

echo -e "${GREEN}✓ Server IP: ${SERVER_IP}${NC}"
echo ""

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠ docker-compose not found. Install it first:${NC}"
    echo "  https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Frontend uses dynamic API URL detection${NC}"
echo -e "  Works automatically with localhost, LAN IP, or any hostname!"

# Build and start services
echo ""
echo -e "${BLUE}Building and starting services...${NC}"
docker-compose up -d --build

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Deployment Complete! ✓                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Access MultiView:${NC}"
echo ""
echo -e "${BLUE}From this machine:${NC}"
echo -e "  Frontend:  ${GREEN}http://localhost:9393${NC}"
echo -e "  Backend:   http://localhost:9292"
echo -e "  Stream:    http://localhost:9292/stream"
echo ""
echo -e "${BLUE}From mobile/other devices on your network:${NC}"
echo -e "  Frontend:  ${GREEN}http://${SERVER_IP}:9393${NC}"
echo -e "  Backend:   http://${SERVER_IP}:9292"
echo -e "  Stream:    http://${SERVER_IP}:9292/stream"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:      docker-compose logs -f"
echo "  Stop services:  docker-compose down"
echo "  Restart:        docker-compose restart"
echo ""
