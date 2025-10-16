# AGENTS: MultiView Operations Playbook

This document captures the actionable knowledge an automation agent needs after inspecting the entire MultiView repository. Use it as the authoritative reference when reasoning about features, architecture, and safe ways to extend or operate the system.

---

## Project Snapshot
- **Goal**: Compose up to five live video streams into a single low-latency MPEG-TS feed while exposing a mobile-first control surface.
- **Tech Stack**:
  - Backend (`server.py`): FastAPI, FFmpeg 8.x, Python 3, ZeroMQ (planned), runs inside `linuxserver/ffmpeg` image.
  - Frontend (`frontend/`): Next.js 15 (App Router), TypeScript, Tailwind CSS, mobile-first UI with PWA metadata.
  - Container Orchestration: Dockerfile per service + `docker-compose.yml`, helper `deploy.sh`.
- **Key Concepts**: Hardware encoder auto-detection, on-demand FFmpeg process orchestration, layout presets + custom builder, channel metadata sourced from M3U playlists, audio mixing per slot, HDHomeRun-compatible output.

---

## High-Level Architecture
1. **Frontend (port 9393)** receives user input (layout selection, channel assignment, audio mix) and talks directly to the backend over HTTP.
2. **Backend (port 9292)** manages layout state, parses channels, builds FFmpeg filter graphs, and streams MPEG-TS through `/stream`.
3. **FFmpeg Worker** is spawned/respawned by the backend with arguments tailored to the selected layout, applying hardware-accelerated encoding when available.
4. **Idle Lifecycle**: System sits in standby until a client hits `/stream`; if no viewers remain for `IDLE_TIMEOUT` seconds, FFmpeg is torn down and the service re-enters idle mode.
5. **State Persistence**: The last successful layout (including audio mix) is cached in memory so that the backend can “cold start” FFmpeg automatically when a new viewer connects after idle.

---

## Backend System (`server.py`)

### Process + State Model
- Global locks (`LOCK`, `CHANNELS_LOCK`, `CURRENT_LAYOUT_LOCK`, `LAST_LAYOUT_LOCK`, `BROADCAST_LOCK`) prevent races across async FastAPI handlers and background threads.
- Modes: `idle` (no FFmpeg), `live` (FFmpeg running), `black` (legacy black screen), plus a transient `starting` flag during cold start.
- Idle watchdog thread monitors viewer count via `BROADCAST_CLIENTS` set and initiates `stop_to_idle()` when no clients remain for the configured timeout.
- `broadcast_reader()` thread continuously reads MPEG-TS chunks from FFmpeg stdout and fans them out to per-client queues.

### Hardware Encoder Detection
- Runs on startup (`detect_encoder()`), testing encoders in priority order (`nvidia`, `intel`, `amd`, `cpu`) or honoring `ENCODER_PREFERENCE`.
- Each encoder profile contributes FFmpeg arguments such as codec, rate control, and pixel format; logs clearly indicate the selected encoder.
- Docker setup (see root `Dockerfile` + `docker-compose.yml`) already exposes `/dev/dri` and NVIDIA resources so agents should avoid modifying those unless hardware changes.

### Layout + FFmpeg Command Builder
- Central entry point: `build_layout_cmd(layout, input_urls, audio_index, custom_slots, audio_volumes_by_index)`.
- Supports base layouts (`pip`, `split_h`, `split_v`, `grid_2x2`, `multi_pip_2`, `multi_pip_3`, `multi_pip_4`, `dvd_pip`) plus arbitrary custom layouts defined by the UI.
- Each layout’s filter graph (see dedicated `build_*_filter` helpers around lines 520–720) handles scaling, padding, overlay positions, and optional borders.
- Audio: `build_audio_filter()` ensures every stream is normalized, applies per-slot volumes, and mixes down (single selected audio stream defaults to pass-through).
- Custom layouts sort slots by area to determine z-ordering, mirroring the frontend designer.

### Channel & Layout APIs
- `GET /api/channels`: Returns cached channel list.
- `POST /api/channels/refresh`: Re-fetches M3U into memory.
- `GET /api/proxy-image`: Proxies logos (strips `host.docker.internal` issues).
- `POST /api/layout/set`: Validates layout payload, resolves channel URLs, constructs new FFmpeg process, updates state caches (`CURRENT_LAYOUT`, `LAST_LAYOUT`).
- `GET /api/layout/current`: Returns persisted layout configuration.
- `POST /api/audio/volume`: Adjusts slot-specific volume. Current implementation restarts FFmpeg with updated `audio_volumes` (ZeroMQ helper exists but is not yet wired in).
- `GET /api/audio/volumes`: Mirrors stored slot volume map.
- Control endpoints (`/control/start`, `/control/stop`, `/control/status`, `/stream`) provide legacy compatibility and observability. `/stream` performs cold-start recovery using the saved layout when the service was idle.

### M3U Handling
- `M3U_SOURCE` may be an HTTP(S) URL or local path; parser extracts `tvg-*` metadata, assigns UUIDs when needed, and ignores self-referential entries (`MultiView`).
- All channel metadata is in-memory; there is no persistence layer beyond runtime caches.

### Observability & Guardrails
- `MAX_STREAM_SIZE` guard (default 500 MB) ensures long-lived FFmpeg sessions are restarted to avoid growing output files.
- `STATUS` response surfaces encoder metadata, view count, idle timer, and stream URL, which the frontend polls for the header banner.
- Slow/broken viewers are removed when their per-client queue grows beyond 100 MPEG-TS chunks.

---

## Frontend System (`frontend/`)

### Runtime Behaviour
- Next.js App Router (`app/page.tsx`) runs entirely client-side (`'use client'`) and maintains state hooks for channels, layout selection, slot assignment, and audio source.
- `api.ts` auto-detects backend host using `window.location.hostname`, avoiding manual configuration for LAN/mobile scenarios.
- Layout apply flow:
  1. User picks preset or custom layout (`LayoutSelector` + optional `LayoutEditor` modal).
  2. Channels assigned via `SlotAssignment`, optionally swapping duplicates.
  3. `VolumeControls` appear once a layout is live; default mix sets first slot to 100%, others muted.
  4. `api.setLayout` sends normalized payload (custom layouts forward slot definitions).
- Status header (`StatusDisplay`) polls `/control/status` every 2 s to show mode, viewer count, and idle countdown.

### Custom Layout Designer
- Stored in browser `localStorage` (`lib/customLayouts.ts`).
- `LayoutEditor` + `EditorCanvas` + `StreamSlot` provide touch-friendly drag/resize interactions with grid snapping (20 px) and enforced 16:9 aspect for each slot.
- Supports up to five slots, optional white border per slot, automatic validation during orientation changes, and pinch-friendly gestures (scale helpers ready for multitouch).
- When backend reports a custom layout, the page attempts to match it against local definitions by comparing slot geometry, preserving selection across sessions.

### Channel UX
- `ChannelList` offers search-as-you-type, refresh button calling `/api/channels/refresh`, assignment hints (shows slot currently using a channel), and backend-powered image proxying.
- Mobile-first layout toggles between “Layout Setup” and “Channels” views; on larger screens both panes render side-by-side.

### Styling & PWA
- Tailwind-driven design tokens live in `app/globals.css`; fonts provisioned via Geist family.
- `app/layout.tsx` describes Apple PWA metadata, icons, and `viewportFit=cover` for iOS notch handling.

---

## Configuration & Deployment
- **Env Vars** (defaulted in backend `Dockerfile` / `docker-compose.yml`):
  - `M3U_SOURCE`, `ENCODER_PREFERENCE`, `IDLE_TIMEOUT`, `PORT`, `DEFAULT_UA`, `SOURCE_HEADERS`, `HLS_*`, `MAX_STREAM_SIZE`, `FONT`.
- **Docker Compose**:
  - Backend mounts `./out` (used for HLS snippets, cleaned on restarts), exposes `/dev/dri`, requests optional NVIDIA device.
  - Frontend builds production bundle via `npm ci && npm run build`, served with `npm start`.
- **deploy.sh**: Detects LAN IP (WSL-aware), confirms Docker Compose availability, builds services, and prints access URLs. Pure Bash; safe for automation runners.
- **GPU Setup**: Documented in `GPU_SETUP.md` with validation commands for NVIDIA/Intel/AMD pipelines.
- **Quickstart / Deployment Docs**: `README.md`, `QUICKSTART.md`, `DEPLOY.md`, and `CLAUDE.md` provide human-friendly guidance; agents can cite them rather than duplicating.

---

## External Interfaces & Dependencies
- **FFmpeg**: Provided by base image. All command construction assumes FFmpeg 8.x; altering codec parameters should happen inside `ENCODER_CONFIGS`.
- **ZeroMQ**: Python dependency is installed, but runtime sockets (`AudioVolumeController`) are not currently invoked. Any agent implementing live volume control should either wire these hooks up in FFmpeg filter graph or remove the unused scaffolding.
- **ZMQ IPC Paths**: Stored under `/tmp/zmq-stream-<index>`; ensure matching endpoints exist if enabling.
- **Network Access**: Backend fetches M3U over HTTP(S) with optional custom headers (`SOURCE_HEADERS`) to satisfy provider requirements.

---

## Agent To-Do Considerations
When modifying or extending the system, keep these facts in mind:
1. **Maintain Layout Consistency**: Always synchronize slot ordering between frontend payloads and backend expectations (area-sorted for custom layouts, static arrays for built-ins).
2. **Thread Safety**: Acquire appropriate locks before touching global state in `server.py`. New background workers should respect the existing locking discipline.
3. **FFmpeg Restarts**: Backend prefers optimistic restarts (launch new process before killing old). Agents introducing new command flows must preserve this behaviour to avoid multi-second outages.
4. **Volume Control**: Current implementation restarts FFmpeg to apply new volumes. If pursuing real-time mixing, reuse the ZeroMQ scaffolding or ensure equivalent guardrails.
5. **Idle Behaviour**: Any new endpoints that stream data should update `LAST_HIT` to prevent premature idle transitions.
6. **Frontend Storage**: Custom layouts live only in localStorage. Agents writing end-to-end tests should seed layouts via browser automation or expose an import/export path.
7. **Testing**: No automated tests exist. Exercise caution and, when possible, add replayable scripts (e.g., sample M3U fixture + integration smoke test) but remove temporary files before delivering.

---

## Key Files & Responsibilities
- `server.py`: Backend application, FFmpeg orchestration, API surface.
- `Dockerfile` / `docker-compose.yml`: Container definitions with encoder provisions.
- `frontend/app/page.tsx`: Main UI workflow.
- `frontend/components/`: Reusable UI modules including layout designer and volume mixer.
- `frontend/lib/api.ts`: REST client with host auto-detection.
- `deploy.sh`: Single-command bootstrap.
- Supporting docs: `README.md`, `DEPLOY.md`, `QUICKSTART.md`, `GPU_SETUP.md`, `CLAUDE.md`.

---

## Expansion Hooks
- **Authentication**: Currently absent; agents adding auth should coordinate both FastAPI middleware and Next.js fetch helpers.
- **Persistent Layouts**: Consider persisting `LAST_LAYOUT` across restarts (e.g., lightweight JSON on disk) if automatic cold start across container restarts is desired.
- **Health Checks**: Docker images lack explicit healthcheck directives; adding `uvicorn` or HTTP-based health endpoints could aid orchestration.
- **Metrics/Logging**: Structured logging (JSON) or Prometheus metrics would help external monitoring agents.

Use this playbook as the baseline for any automated reasoning or coding tasks inside the MultiView project.

