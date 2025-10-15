# MultiView Deployment Guide

This guide covers deploying MultiView backend and frontend for access from mobile devices on your local network.

## Quick Start (Recommended)

### Option 1: Automated Deployment (Easiest)

Use the deployment script to automatically configure and start everything:

```bash
./deploy.sh
```

This script will:
- Auto-detect your server IP (or prompt if needed)
- Build and start both backend and frontend
- Display access URLs for local and mobile devices

**Access**:
- Backend API: `http://<your-server-ip>:9292`
- Frontend UI: `http://<your-server-ip>:9393`
- Stream: `http://<your-server-ip>:9292/stream`

### Option 2: Manual Docker Compose

Deploy both services manually:

```bash
# Build and start both services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Option 3: Backend Only (Docker) + Frontend (Local)

If you prefer to run the frontend locally during development:

```bash
# 1. Build and run backend in Docker
docker build -t multiview-backend .
docker run -d \
  --name multiview \
  --network host \
  -v $(pwd)/out:/out \
  -e M3U_SOURCE=http://127.0.0.1:9191/output/m3u?direct=true \
  -e FORCE_CPU=1 \
  -e IDLE_TIMEOUT=300 \
  multiview-backend

# 2. Run frontend locally
cd frontend
npm install
npm run dev
```

**Access**:
- Backend: `http://<your-server-ip>:9292`
- Frontend: `http://<your-server-ip>:9393`

## Configuration

### Backend Environment Variables

Edit `docker-compose.yml` or pass via `-e` flags:

| Variable | Default | Description |
|----------|---------|-------------|
| `M3U_SOURCE` | `http://127.0.0.1:9191/output/m3u?direct=true` | M3U playlist URL or file path |
| `FORCE_CPU` | `1` | Set to `0` to use GPU (requires NVIDIA GPU + drivers) |
| `IDLE_TIMEOUT` | `300` | Seconds before switching to standby |
| `PORT` | `9292` | Backend API port |
| `HLS_TIME` | `2` | HLS segment duration (seconds, used for internal HLS chunks) |
| `HLS_LIST_SIZE` | `10` | Number of segments in playlist |

### Frontend Environment Variables

**None required!** The frontend auto-detects the backend URL from the current hostname:
- Accessing via `localhost:9393` → connects to `localhost:9292`
- Accessing via `192.168.1.100:9393` → connects to `192.168.1.100:9292`

## Mobile Access Setup

### Step 1: Find Your Server's IP Address

**Linux/Mac**:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# or
hostname -I
```

**Windows (WSL)**:
```bash
# Get Windows host IP
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'

# Or from Windows PowerShell:
ipconfig | findstr IPv4
```

### Step 2: Deploy Services

**Docker Compose**:

```bash
docker-compose up -d --build
```

### Step 3: Access from Mobile Device

On your phone/tablet, open browser and navigate to:

```
http://<YOUR_SERVER_IP>:9393
```

Example: `http://192.168.1.100:9393`

## Network Troubleshooting

### Firewall Rules

Make sure ports 9292 and 9393 are accessible on your local network:

**Linux (ufw)**:
```bash
sudo ufw allow 9292/tcp
sudo ufw allow 9393/tcp
```

**Windows Firewall**:
1. Open Windows Defender Firewall
2. Advanced Settings → Inbound Rules → New Rule
3. Port → TCP → Specific ports: 9292, 9393
4. Allow the connection

### Test Connectivity

From your mobile device, test if the server is reachable:

```bash
# Use a network testing app or browser to visit:
http://<YOUR_SERVER_IP>:9292/control/status

# Should return JSON with system status
```

### Common Issues

**Issue**: "Failed to load channels" error in frontend
- **Fix**: Check that `M3U_SOURCE` is accessible from within the Docker container
- For local services, use `host.docker.internal` instead of `localhost` in M3U_SOURCE

**Issue**: Frontend can't connect to backend on mobile
- **Fix**: Frontend auto-detects from hostname, ensure you're using server IP not localhost in URL bar
- **Fix**: Check firewall allows port 9292

**Issue**: WSL2 networking issues
- **Fix**: Use `--network host` mode in Docker
- **Fix**: Or use Windows host IP from `/etc/resolv.conf`

## Production Deployment

For production use with better performance:

### 1. Build Optimized Frontend

```bash
cd frontend
npm run build
npm start  # Runs optimized production build
```

### 2. Use Process Manager

Install PM2 to keep services running:

```bash
npm install -g pm2

# Start backend (if not using Docker)
pm2 start "python3 -m uvicorn server:app --host 0.0.0.0 --port 9292" --name multiview-backend

# Start frontend
cd frontend
pm2 start npm --name multiview-frontend -- start

# Save and auto-start on reboot
pm2 save
pm2 startup
```

### 3. Reverse Proxy (Optional)

Use Nginx to serve both on port 80:

```nginx
server {
    listen 80;
    server_name multiview.local;

    # Frontend
    location / {
        proxy_pass http://localhost:9393;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:9292/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Stream endpoint
    location /stream {
        proxy_pass http://localhost:9292/stream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }

    # Control endpoints
    location /control/ {
        proxy_pass http://localhost:9292/control/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then access via: `http://<YOUR_SERVER_IP>/`

## Updating

### Pull Latest Changes

```bash
# Stop services
docker-compose down

# Pull changes (if using git)
git pull

# Rebuild and restart
docker-compose up -d --build
```

### Backend Only

```bash
docker stop multiview
docker rm multiview
docker build -t multiview-backend .
docker run -d --name multiview --network host multiview-backend
```

### Frontend Only

```bash
cd frontend
git pull  # or copy updated files
npm install
docker-compose up -d --build frontend
# or npm run dev for local development
```

## Monitoring

### View Logs

**Docker Compose**:
```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

**Docker (manual)**:
```bash
docker logs -f multiview
```

### Check Status

```bash
# API status
curl http://localhost:9292/control/status

# Channel count
curl http://localhost:9292/api/channels | jq '.count'
```

## Security Notes

⚠️ **Important**: This setup is designed for local network use only.

- No authentication is configured
- All endpoints are publicly accessible on your network
- Do NOT expose to the internet without adding authentication
- Use firewall rules to restrict access to trusted devices

---

Need help? Check CLAUDE.md for architecture details or create an issue.
