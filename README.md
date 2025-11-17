# MultiView

Multi-stream video composition with mobile-friendly control interface.

![Status](https://img.shields.io/badge/status-beta-yellow)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-green)
![License](https://img.shields.io/badge/license-MIT-green)
[![Build and Publish](https://github.com/kikootwo/MultiView/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/kikootwo/MultiView/actions/workflows/docker-publish.yml)

## Overview

**MultiView** combines multiple video streams into a single MPEG-TS output with a mobile-optimized web interface for layout control. Perfect for watching multiple sports streams, security cameras, or broadcasts simultaneously.

### Features

- 🎬 **7 Layout Types** - PiP, grids, split-screen, multi-PiP (up to 5 streams)
- 🎨 **Custom Layout Builder** - Drag-and-drop editor for custom layouts
- 📱 **Mobile-First UI** - Touch-friendly React interface with iOS PWA support
- 📺 **M3U Support** - Auto-load channels from M3U playlists
- 🔊 **Dynamic Audio Control** - Select audio source + individual volume control per stream
- ⚡ **MPEG-TS Streaming** - Low-latency output via FFmpeg (Plex/HDHomeRun compatible)
- 🔄 **Auto-Reconnect** - Handles stream failures gracefully
- 🐳 **Docker Ready** - Easy deployment with docker-compose

## Quick Start

### Prerequisites

- Docker and docker-compose
- M3U playlist (URL or file)
- **Optional Hardware Acceleration** (auto-detected):
  - NVIDIA GPU (RTX/GTX 1000+) with **NVIDIA Container Toolkit**
  - Intel CPU with QuickSync (6th gen+)
  - AMD GPU with VAAPI (RX 400+)
- **Fallback**: 4+ core CPU for software encoding (always available)

### Deploy with Docker

**Recommended: Use pre-built image (single container)**

```bash
# 1. (Optional) Install hardware acceleration support
# - NVIDIA: Install NVIDIA Container Toolkit - see GPU_SETUP.md
# - Intel/AMD: No additional setup needed!

# 2. Clone repository
git clone <repo-url>
cd MultiView

# 3. Configure M3U source (edit M3U_SOURCE in docker-compose.yml)
nano docker-compose.yml

# 4. Deploy with automated script (recommended)
./deploy.sh

# OR manually with docker-compose
docker-compose up -d
```

**Alternative: Build locally**

If you prefer to build the image yourself:

```bash
# Edit docker-compose.yml and uncomment the "build:" section
# Comment out the "image:" line

# Then deploy
docker-compose up -d --build
```

The deployment script will auto-detect your server IP and display access URLs.

**Access**:
- **Frontend & API**: `http://<server-ip>:9292` (single port for both!)
- **Stream**: `http://<server-ip>:9292/stream`

**Hardware encoder is automatically detected at startup** - check logs to see which encoder was selected (NVIDIA/Intel/AMD/CPU).

**Quick Deploy**: Run `./deploy.sh` for automated setup, or see **[DEPLOY.md](DEPLOY.md)** for manual options.

**Hardware Setup**: See **[GPU_SETUP.md](GPU_SETUP.md)** for NVIDIA/Intel/AMD configuration details.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   Mobile    │─────▶│   Next.js   │─────▶│   FastAPI    │
│   Browser   │◀─────│   Frontend  │◀─────│   Backend    │
└─────────────┘      └─────────────┘      └──────────────┘
                                                   │
                                                   ▼
                                           ┌──────────────┐
                                           │    FFmpeg    │
                                           │  Compositor  │
                                           └──────────────┘
                                                   │
                                                   ▼
                                           ┌──────────────┐
                                           │  MPEG-TS     │
                                           │  /stream     │
                                           └──────────────┘
```

**Stack**:
- Frontend: Next.js 15, TypeScript, Tailwind CSS
- Backend: Python, FastAPI, FFmpeg 8.0
- Encoding: Universal hardware support (NVIDIA/Intel/AMD) with CPU fallback
- Streaming: MPEG-TS over HTTP (Plex/HDHomeRun compatible)

## Usage

1. **Open frontend**: `http://<server-ip>:9292` (or on mobile)
2. **Select layout type** (e.g., 2x2 grid) or create custom layout
3. **Assign channels** to each slot
4. **Choose audio source** and adjust volumes
5. **Apply layout** - streams start immediately
6. **Play stream** in any player: `http://<server-ip>:9292/stream`
   - Compatible with Plex, VLC, Dispatcharr, HDHomeRun clients

## Supported Layouts

| Layout | Streams | Description |
|--------|---------|-------------|
| **PiP** | 2 | Picture-in-picture: 1 main + 1 inset |
| **Split H** | 2 | Horizontal split (side-by-side) |
| **Split V** | 2 | Vertical split (top/bottom) |
| **Grid 2x2** | 4 | 4 equal streams in 2x2 grid |
| **Multi-PiP 2** | 3 | 1 main + 2 small insets |
| **Multi-PiP 3** | 4 | 1 main + 3 small insets |
| **Multi-PiP 4** | 5 | 1 main + 4 small insets |

**Plus:** Custom layout builder with drag-and-drop editor for unlimited layout configurations!

## Docker Image

A unified pre-built image is automatically published to GitHub Container Registry on every commit to `main`:

- **Unified Image**: `ghcr.io/kikootwo/multiview:latest`

The image is built for `linux/amd64` architecture and includes:
- Next.js frontend (static build)
- FastAPI backend
- FFmpeg with universal hardware encoder support (NVIDIA/Intel/AMD/CPU)
- Single port (9292) serves both frontend and API

### Image Tags

- `latest` - Latest commit on main branch
- `v*` - Semantic version releases (e.g., `v1.0.0`, `v1.0`, `v1`)
- `main` - Main branch builds
- `pr-*` - Pull request builds (not pushed to registry)

## Configuration

### Environment Variables

Configure via `docker-compose.yml` or Docker `-e` flags:

```bash
M3U_SOURCE=http://127.0.0.1:9191/output/m3u?direct=true  # M3U playlist URL
ENCODER_PREFERENCE=auto                                  # Encoder: auto, nvidia, intel, amd, cpu
IDLE_TIMEOUT=300                                         # Standby after 5 min idle
PORT=9292                                                # Backend port
```

**Hardware Encoding**: Universal image supports all encoder types
- `auto` (default) - Auto-detect best available: nvidia > intel > amd > cpu
- `nvidia` - Force NVIDIA NVENC (requires NVIDIA GPU + Container Toolkit)
- `intel` - Force Intel QuickSync (requires Intel iGPU)
- `amd` - Force AMD VAAPI (requires AMD GPU)
- `cpu` - Force CPU encoding (libx264, always available)

**Note**: Frontend and backend are served from the same port (9292), simplifying deployment and networking.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/channels` | List available channels from M3U |
| `POST` | `/api/channels/refresh` | Reload M3U playlist |
| `POST` | `/api/layout/set` | Apply layout configuration |
| `GET` | `/api/layout/current` | Get current layout config |
| `POST` | `/api/layout/swap-audio` | Swap audio source without restart |
| `POST` | `/api/audio/volume` | Set volume for specific slot |
| `GET` | `/api/audio/volumes` | Get all current volume levels |
| `GET` | `/control/status` | Get system status |
| `GET` | `/control/stop` | Stop streaming (standby) |
| `GET` | `/stream` | MPEG-TS output stream |

Full API documentation in **[CLAUDE.md](CLAUDE.md)**.

## Development

### Run Locally (No Docker)

**Backend**:
```bash
pip install fastapi uvicorn[standard]
python3 -m uvicorn server:app --host 0.0.0.0 --port 9292
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```

### Project Structure

```
MultiView/
├── server.py              # FastAPI backend + M3U parser
├── Dockerfile             # Backend container
├── docker-compose.yml     # Full stack deployment
├── frontend/
│   ├── app/               # Next.js pages
│   ├── components/        # React components
│   ├── lib/               # API client & utilities
│   └── types/             # TypeScript definitions
├── DEPLOY.md              # Deployment guide
└── CLAUDE.md              # Architecture documentation
```

## Troubleshooting

**Check which encoder is being used**:
- View startup logs: `docker-compose logs multiview | grep "Encoder"`
- Check status endpoint: `curl http://<server-ip>:9292/control/status` (see `encoder` field)
- If not using desired encoder, check GPU_SETUP.md for configuration

**Can't access frontend**:
- Ensure you're accessing via server IP (not `localhost`) from mobile
- Verify firewall allows port 9292
- Test: `curl http://<server-ip>:9292/control/status`
- Check logs: `docker-compose logs multiview`

**No channels loading**:
- Verify `M3U_SOURCE` is accessible
- Check logs: `docker-compose logs multiview`
- Test M3U URL in browser

**Hardware encoding not working**:
- Check startup logs for encoder detection results
- NVIDIA: Verify NVIDIA Container Toolkit is installed
- Intel/AMD: Verify `/dev/dri` exists: `ls -la /dev/dri`
- Force CPU encoding if needed: `ENCODER_PREFERENCE=cpu`

**Mobile can't access**:
- Ensure phone is on same network
- Use server's LAN IP (192.168.x.x), not 127.0.0.1
- Only port 9292 needs to be accessible (firewall rules)
- Test from mobile browser: `http://<server-ip>:9292`

## Contributing

This is a personal project for household use. Feel free to fork and customize!

## License

MIT License - See LICENSE file for details

---

**Documentation**:
- [Deployment Guide](DEPLOY.md) - Docker setup & mobile access
- [Docker Setup Guide](DOCKER_SETUP.md) - GitHub Container Registry & image publishing
- [Architecture Guide](CLAUDE.md) - Technical details & design decisions
