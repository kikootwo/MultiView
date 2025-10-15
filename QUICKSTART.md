# MultiView - Quick Start Guide

Get MultiView running in 5 minutes!

## Prerequisites

- Docker and docker-compose installed
- M3U playlist source (URL or file)
- Optional: NVIDIA GPU for hardware encoding (see **[GPU_SETUP.md](GPU_SETUP.md)**)

### Step 1: Configure M3U Source

The `docker-compose.yml` is already configured with your M3U source. If it's different, edit:

```bash
nano docker-compose.yml
```

Find the `M3U_SOURCE` line and update it:
```yaml
- M3U_SOURCE=http://host.docker.internal:9191/output/m3u?direct=true
```

> **Note**: We use `host.docker.internal` instead of `127.0.0.1` so Docker can access services running on your host machine.

### Step 2: Deploy Everything

**Recommended:** Run the automated deployment script:

```bash
./deploy.sh
```

This script will:
1. Auto-detect your server's IP address
2. Build and start both backend and frontend
3. Display access URLs for local and mobile devices

**Output:**
```
Server IP: 192.168.1.100
Frontend: http://192.168.1.100:9393
Backend:  http://192.168.1.100:9292
Stream:   http://192.168.1.100:9292/stream
```

### Step 3: Access from Mobile

On your phone or tablet:

1. **Connect to the same Wi-Fi network** as your server
2. **Open a browser** (Chrome, Safari, Firefox, etc.)
3. **Navigate to**: `http://<YOUR_SERVER_IP>:9393`
   - Replace with the IP from Step 2
   - Example: `http://192.168.1.100:9393`

### Step 4: Configure Your First Layout

1. **Select a layout** (e.g., "2x2 Grid")
2. **Tap a slot** → Select a channel from the list
3. **Repeat** for other slots
4. **Choose audio source** → Tap "Set as audio source" on your preferred stream
5. **Tap "▶ Apply Layout"** → Streams start immediately!

### Step 5: Watch the Stream

The output MPEG-TS stream is available at:
```
http://<YOUR_SERVER_IP>:9292/stream
```

Play it in:
- **VLC**: Open Network Stream
- **Plex**: Add as Live TV tuner (HDHomeRun compatible)
- **Browser**: Use video.js or native player
- **TV App**: Any IPTV player that supports MPEG-TS

## Manual Deployment (Alternative)

If you prefer manual control:

### Backend Only

```bash
# Build Docker image
docker build -t multiview-backend .

# Run container
docker run -d \
  --name multiview \
  --network host \
  -v $(pwd)/out:/out \
  -e M3U_SOURCE=http://host.docker.internal:9191/output/m3u?direct=true \
  -e FORCE_CPU=1 \
  -e IDLE_TIMEOUT=300 \
  multiview-backend

# Check logs
docker logs -f multiview
```

### Frontend Separately

```bash
# Install dependencies
cd frontend
npm install

# Run development server (frontend auto-detects backend)
npm run dev

# Or build for production
npm run build
npm start
```

## Verify Everything Works

### 1. Check Backend Health

```bash
curl http://localhost:9292/control/status
```

Should return:
```json
{
  "proc_running": true,
  "mode": "black",
  "in1": null,
  "in2": null,
  "idle_timeout_sec": 300,
  "last_hit_epoch": 1234567890.123
}
```

### 2. Check Channels Loaded

```bash
curl http://localhost:9292/api/channels | jq '.count'
```

Should return the number of channels from your M3U (e.g., `16`).

### 3. Access Frontend

Open `http://localhost:9393` in your browser. You should see:
- "MultiView Control" header
- "Refresh Channels" button
- Layout selector grid
- Empty channel list (or populated if backend is working)

### 4. Test from Mobile

On your phone browser, visit `http://<SERVER_IP>:9393`. Should work exactly like desktop.

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs multiview

# Common issues:
# - Port 9292 already in use
# - M3U_SOURCE not accessible
```

### Frontend can't connect
```bash
# Frontend auto-detects API URL from hostname
# Make sure you're accessing via server IP, not localhost:
# ✓ http://192.168.1.100:9393 (works from mobile)
# ✗ http://localhost:9393 (only works locally)
```

### Mobile can't access
```bash
# Check firewall allows ports 9393 and 9292
sudo ufw allow 9393/tcp
sudo ufw allow 9292/tcp

# Verify server IP is on LAN (192.168.x.x or 10.x.x.x)
hostname -I
```

### No channels showing
```bash
# Test M3U URL directly
curl http://127.0.0.1:9191/output/m3u?direct=true

# Refresh channels via API
curl -X POST http://localhost:9292/api/channels/refresh

# Check backend logs
docker logs -f multiview
```

## Next Steps

For detailed documentation:
- **[README.md](README.md)** - Project overview
- **[DEPLOY.md](DEPLOY.md)** - Comprehensive deployment guide
- **[CLAUDE.md](CLAUDE.md)** - Architecture & technical details

---

**Need Help?** Check the troubleshooting section in DEPLOY.md or review logs with `docker-compose logs -f`.
