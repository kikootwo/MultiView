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

# Get server IP (WSL2-aware detection)
echo -e "${BLUE}Detecting server IP address...${NC}"

# Try multiple methods to find the real LAN IP
SERVER_IP=""

# Method 1: Check for saved IP (most reliable for WSL2)
if [ -f .multiview_ip ]; then
    SERVER_IP=$(cat .multiview_ip)
    echo -e "${YELLOW}Using saved IP from .multiview_ip${NC}"
fi

# Method 2: Try to get Windows host IP from PowerShell (WSL2 specific)
if [ -z "$SERVER_IP" ] && command -v powershell.exe &> /dev/null; then
    WIN_IP=$(powershell.exe -Command "Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Ethernet*','Wi-Fi*' | Where-Object {(\$_.IPAddress -like '192.168.*') -or (\$_.IPAddress -like '10.*')} | Select-Object -First 1 -ExpandProperty IPAddress" 2>/dev/null | tr -d '\r')
    if [ ! -z "$WIN_IP" ]; then
        SERVER_IP=$WIN_IP
        echo -e "${GREEN}Detected Windows host IP via PowerShell${NC}"
    fi
fi

# Method 3: Try ip addr (works on native Linux)
if [ -z "$SERVER_IP" ] && command -v ip &> /dev/null; then
    SERVER_IP=$(ip addr show | grep "inet " | grep -v "127.0.0.1" | grep -v "172\." | grep -v "169.254" | grep -v "10.255" | awk '{print $2}' | cut -d/ -f1 | grep -E "^(192\.168|10\.)" | head -1)
fi

# Method 4: Ask user
if [ -z "$SERVER_IP" ]; then
    echo -e "${YELLOW}⚠ Could not auto-detect LAN IP.${NC}"
    echo -e "${YELLOW}Please enter your Windows host LAN IP (e.g., 192.168.117.2):${NC}"
    echo -e "${YELLOW}You can find it in Windows by running: ipconfig${NC}"
    read -p "Server IP: " SERVER_IP
    # Save for next time
    echo "$SERVER_IP" > .multiview_ip
fi

echo -e "${GREEN}✓ Server IP: ${SERVER_IP}${NC}"
echo ""

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠ docker-compose not found. Install it first:${NC}"
    echo "  https://docs.docker.com/compose/install/"
    exit 1
fi

# Note: Frontend now uses dynamic API URL detection
# No need to configure NEXT_PUBLIC_API_URL - it auto-detects from hostname
echo -e "${GREEN}✓ Frontend configured for dynamic API detection${NC}"

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
echo -e "  Frontend:   ${GREEN}http://localhost:9393${NC}"
echo -e "  Backend:    http://localhost:9292"
echo -e "  HLS Stream: http://localhost:9292/hls/multiview.m3u8"
echo ""
echo -e "${BLUE}From mobile/other devices on your network:${NC}"
echo -e "  Frontend:   ${GREEN}http://${SERVER_IP}:9393${NC}"
echo -e "  Backend:    http://${SERVER_IP}:9292"
echo -e "  HLS Stream: http://${SERVER_IP}:9292/hls/multiview.m3u8"
echo ""
echo -e "${YELLOW}Note:${NC} Frontend auto-detects API URL from hostname."
echo -e "      Works with localhost, LAN IP, or any hostname!"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:      docker-compose logs -f"
echo "  Stop services:  docker-compose down"
echo "  Restart:        docker-compose restart"
echo ""
