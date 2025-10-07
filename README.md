# MultiView

Multi-stream video composition with mobile-friendly control interface.

![Status](https://img.shields.io/badge/status-beta-yellow)
![Platform](https://img.shields.io/badge/platform-linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Overview

**MultiView** combines multiple video streams into a single HLS output with a mobile-optimized web interface for layout control. Perfect for watching multiple sports streams, security cameras, or broadcasts simultaneously.

### Features

- 🎬 **8 Layout Types** - PiP, grids, split-screen, multi-PiP
- 📱 **Mobile-First UI** - Touch-friendly React interface
- 📺 **M3U Support** - Auto-load channels from M3U playlists
- 🔊 **Audio Control** - Select which stream provides audio
- ⚡ **HLS Streaming** - Low-latency output via FFmpeg
- 🔄 **Auto-Reconnect** - Handles stream failures gracefully
- 🐳 **Docker Ready** - Easy deployment with docker-compose

## Quick Start

### Prerequisites

- Docker and docker-compose
- **NVIDIA Container Toolkit** (for GPU encoding)
- M3U playlist (URL or file)
- **Recommended**: NVIDIA GPU (RTX 3090 or similar) for hardware encoding
- **Alternative**: 24-core CPU for software encoding (set FORCE_CPU=1)

### Deploy with Docker

```bash
# 1. Install NVIDIA Container Toolkit (one-time setup)
# See GPU_SETUP.md for detailed instructions

# 2. Clone repository
git clone <repo-url>
cd MultiView

# 3. Configure M3U source
nano docker-compose.yml  # Edit M3U_SOURCE

# 4. Start services
docker-compose up -d --build

# 5. Access from any device on your network
# Frontend: http://<your-ip>:9393
# Backend:  http://<your-ip>:9292
```

**GPU Setup**: See **[GPU_SETUP.md](GPU_SETUP.md)** for NVIDIA GPU configuration.

**Deployment**: See **[DEPLOY.md](DEPLOY.md)** for detailed instructions and mobile access.

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
                                           │ HLS Output   │
                                           │ multiview.m3u8│
                                           └──────────────┘
```

**Stack**:
- Frontend: Next.js 15, TypeScript, Tailwind CSS
- Backend: Python, FastAPI, FFmpeg 6.1
- Streaming: HLS (HTTP Live Streaming)

## Usage

1. **Open frontend** on mobile: `http://<server-ip>:9393`
2. **Select layout type** (e.g., 2x2 grid)
3. **Assign channels** to each slot
4. **Choose audio source** (tap "Set as audio source")
5. **Apply layout** - streams start immediately
6. **Play HLS output** in any player: `http://<server-ip>:9292/hls/multiview.m3u8`

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
| **Grid 3x3** | 5 | Up to 5 streams in 3x3 grid |

## Configuration

### Environment Variables

**Backend** (`docker-compose.yml` or Docker `-e` flags):

```bash
M3U_SOURCE=http://127.0.0.1:9191/output/m3u?direct=true  # M3U playlist URL
FORCE_CPU=1                                              # CPU encoding (0 for GPU)
IDLE_TIMEOUT=300                                         # Standby after 5 min idle
PORT=9292                                                # Backend port
```

**Frontend** (`frontend/.env.local`):

```bash
NEXT_PUBLIC_API_URL=http://192.168.1.100:9292  # Backend URL (use your server IP)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/channels` | List available channels from M3U |
| `POST` | `/api/channels/refresh` | Reload M3U playlist |
| `POST` | `/api/layout/set` | Apply layout configuration |
| `GET` | `/control/status` | Get system status |
| `GET` | `/control/stop` | Stop streaming (standby) |
| `GET` | `/hls/multiview.m3u8` | HLS output stream |

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

## Roadmap

- [x] **Phase 1**: Frontend UI + Channel Management
  - Next.js frontend with 8 layout types
  - M3U parser and channel API
  - Mobile-responsive design
- [ ] **Phase 2**: Multi-Layout Support (In Progress)
  - Generalized FFmpeg command builder
  - Layout API endpoints
  - Seamless layout transitions
- [ ] **Phase 3**: Enhanced Reliability
  - Dead stream detection & placeholders
  - Auto-fallback on failures
  - Stream health monitoring

## Troubleshooting

**Frontend can't connect to backend**:
- Check `NEXT_PUBLIC_API_URL` uses server IP (not `localhost`)
- Verify firewall allows port 9292
- Test: `curl http://<server-ip>:9292/control/status`

**No channels loading**:
- Verify `M3U_SOURCE` is accessible
- Check logs: `docker-compose logs backend`
- Test M3U URL in browser

**Mobile can't access**:
- Ensure phone is on same network
- Use server's LAN IP (192.168.x.x), not 127.0.0.1
- Check firewall rules (see DEPLOY.md)

## Contributing

This is a personal project for household use. Feel free to fork and customize!

## License

MIT License - See LICENSE file for details

---

**Documentation**:
- [Deployment Guide](DEPLOY.md) - Docker setup & mobile access
- [Architecture Guide](CLAUDE.md) - Technical details & design decisions
