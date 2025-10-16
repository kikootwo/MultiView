# MultiView - Dev Reference

> Quick reference for active development. Update with new gotchas and critical decisions.

## Stack

- **Backend**: FastAPI + Python 3, FFmpeg 8.0 (LinuxServer)
- **Frontend**: Next.js 15 + TypeScript + Tailwind
- **Video**: Universal hardware encoding (NVIDIA/Intel/AMD) with CPU fallback
- **Output**: MPEG-TS over HTTP (for Plex LiveTV)
- **Channels**: M3U playlist (local or remote)

## Layouts (7 types, max 5 streams)

1. `pip` - 1 main + 1 inset (slots: main, inset)
2. `split_h` - 2 side-by-side (slots: left, right)
3. `split_v` - 2 stacked (slots: top, bottom)
4. `grid_2x2` - 4 equal (slots: slot1-4)
5. `multi_pip_2` - 1 main + 2 insets (slots: main, inset1-2)
6. `multi_pip_3` - 1 main + 3 insets (slots: main, inset1-3)
7. `multi_pip_4` - 1 main + 4 insets (slots: main, inset1-4)

## Key ENV Vars

- `M3U_SOURCE` - URL or path to M3U (default: http://127.0.0.1:9191/output/m3u?direct=true)
- `IDLE_TIMEOUT` - Seconds before standby (default: 60)
- `ENCODER_PREFERENCE` - Encoder selection: auto, nvidia, intel, amd, cpu (default: auto)
- `PORT` - Backend port (default: 9292)

## API Endpoints

**Channels:**
- `GET /api/channels` - List channels from M3U
- `POST /api/channels/refresh` - Re-fetch M3U
- `GET /api/proxy-image?url=...` - Proxy Docker-internal images

**Layout:**
- `POST /api/layout/set` - Apply layout (payload: {layout, streams, audio_source})
- `GET /api/layout/current` - Get active layout config
- `GET /control/stop` - Stop and switch to standby

**Stream:**
- `GET /stream` - MPEG-TS output (for Plex/VLC)
- `GET /control/status` - System status + connected clients

## Critical Gotchas

**WSL2 Networking:**
- Frontend auto-detects backend via `window.location.hostname`
- Works with both localhost and LAN IP
- Cannot use `network_mode: host` in Docker Desktop/WSL2

**Thread Safety:**
- `CHANNELS_LOCK` protects channel list
- `CURRENT_LAYOUT_LOCK` protects layout state
- `LOCK` protects FFmpeg process operations

**FFmpeg Filter Order:**
- Slot order MUST match layout slot definitions in server.py `LAYOUT_SLOTS`
- Audio index is position in input array (not slot name)

**iOS PWA:**
- Use `statusBarStyle: "default"` to avoid white bar
- Set `viewportFit: "cover"` for notch support
- Body background should match header color

**Hardware Encoding:**
- Single Docker image supports ALL encoders (NVIDIA/Intel/AMD/CPU)
- Auto-detection at startup: nvidia > intel > amd > cpu
- Logs full detection process for troubleshooting
- Check active encoder via `GET /control/status` (encoder field)
- Force specific encoder with `ENCODER_PREFERENCE` env var
- NVIDIA requires `--gpus` flag + NVIDIA Container Toolkit
- Intel/AMD require `/dev/dri` device access (already in docker-compose.yml)
- Both can coexist - auto-detection picks best available

## Deployment

```bash
./deploy.sh  # Auto-configures and starts
```

Or manually:
```bash
docker-compose up -d --build
docker-compose logs -f
```
