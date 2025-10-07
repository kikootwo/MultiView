# MultiView - Project Documentation for Claude

> **IMPORTANT**: Update this file as we work on the project with any new insights, architectural decisions, bugs discovered, or important implementation details.

## Project Overview

**MultiView** is a Python-based FastAPI service that provides real-time multi-stream video composition using FFmpeg, delivering a single MPEG-TS output stream optimized for Plex LiveTV.

### Current State
**Backend (Proof of Concept - Working ✓)**:
- 2-stream Picture-in-Picture (PiP) layout
- Basic REST API for start/stop/swap control
- Docker deployment with NVIDIA GPU encoding (h264_nvenc)
- CPU fallback available (libx264)
- Idle timeout with automatic standby mode

**Frontend (Complete ✓)**:
- Next.js 15 with TypeScript and Tailwind CSS
- Mobile-first responsive design
- 8 layout types with visual previews
- Channel list UI with search
- Slot assignment interface with audio source control
- API client ready for backend integration

**Backend Phase 1 - Channel Management (Complete ✓)**:
- M3U parser with regex-based metadata extraction
- GET /api/channels - return channel list from M3U
- POST /api/channels/refresh - re-fetch and re-parse M3U
- CORS middleware for frontend communication
- In-memory channel storage with thread safety
- Supports both HTTP URLs and local file paths for M3U source

### End Goal Vision (In Development)
A **mobile-friendly web interface** for household use that allows users to:
- Select from multiple **flexible layouts** (PiP, grids, split-screen, multi-PiP)
- **Drag-and-drop or click-to-select** streams from a channel list into layout slots
- **Control audio source** independently (select which stream provides audio)
- **Seamlessly switch** streams/layouts without breaking the output HLS feed
- **Auto-handle failures** with placeholder graphics when input streams die

**Primary Use Case**: Family-friendly TV streaming interface on local network (no authentication required).

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python 3)
- **Frontend**: Next.js (React-based, mobile-friendly UI)
- **Video Processing**: FFmpeg 6.1 with NVIDIA NVENC (h264_nvenc)
- **Hardware**: NVIDIA RTX 3090 GPU + 24-core CPU
- **Container**: Docker with NVIDIA Container Toolkit
- **Streaming Protocol**: MPEG-TS over HTTP (continuous streaming)
- **Server**: Uvicorn ASGI server
- **Channel Source**: M3U playlist (local or remote URL)

### Key Components

1. **server.py** (225 lines) - Main application file containing:
   - FastAPI application setup
   - FFmpeg command builders
   - Process management
   - REST API endpoints
   - Idle timeout watchdog

2. **Dockerfile** (18 lines) - Container definition with FFmpeg and Python runtime

3. **frontend/** - Next.js application (Phase 1 Complete)
   - **app/page.tsx** - Main control interface with state management
   - **app/layout.tsx** - Root layout with metadata and viewport config
   - **components/** - Reusable UI components:
     - `ChannelList.tsx` - Channel browser with search functionality
     - `LayoutSelector.tsx` - Visual layout picker with 8 layout types
     - `SlotAssignment.tsx` - Stream slot configuration with audio control
   - **lib/** - Utilities and helpers:
     - `api.ts` - Backend API client with fetch wrapper
     - `layouts.ts` - Layout definitions and slot label helpers
   - **types/index.ts** - TypeScript interfaces for channels, layouts, API responses

## Frontend Implementation Details

### Component Architecture
- **Mobile-First Design**: Uses Tailwind's responsive breakpoints (`md:`)
  - Mobile: Single-column with tab switcher (Layout Setup / Channels)
  - Desktop: Split view (layout config left, channel list right)
- **State Management**: React hooks (no external state library)
  - Local component state for UI interactions
  - Async/await for API calls with loading states
  - Error handling with user-friendly messages

### Layout System
Supports 8 layout types with visual previews:
1. **pip** - Picture-in-Picture (1 main + 1 inset)
2. **split_h** - Horizontal split (2 equal streams)
3. **split_v** - Vertical split (2 equal streams)
4. **grid_2x2** - 2x2 grid (4 streams)
5. **multi_pip_2** - 1 main + 2 insets
6. **multi_pip_3** - 1 main + 3 insets
7. **multi_pip_4** - 1 main + 4 insets (max capacity)
8. **grid_3x3** - 3x3 grid (5 slots max due to CPU limit)

Each layout has:
- Unique slot IDs (e.g., "main", "inset1", "slot1")
- Friendly slot labels via `getSlotLabel()` helper
- Visual preview in layout selector using Tailwind grid

### User Flow
1. User selects layout type → UI updates slot list
2. User clicks/taps a slot → switches to channel view (mobile) or highlights slot (desktop)
3. User selects channel → assigned to active slot, auto-returns to layout view
4. First assigned channel auto-selected as audio source
5. User can change audio source via "Set as audio source" button
6. "Apply Layout" button enabled when ≥1 slot filled + audio source set
7. API call sends layout config → backend processes request

### API Client Structure
```typescript
api.getChannels() → GET /api/channels
api.refreshChannels() → POST /api/channels/refresh
api.setLayout(config) → POST /api/layout/set
api.getCurrentLayout() → GET /api/layout/current
api.swapAudioSource(slotId) → POST /api/layout/swap-audio
api.stop() → GET /control/stop
```

**Dynamic API URL Detection** (WSL2-compatible):
- Frontend automatically detects backend URL from `window.location.hostname`
- Accessing from `localhost:9393` → calls `localhost:9292`
- Accessing from `192.168.117.2:9393` → calls `192.168.117.2:9292`
- No hardcoded IP addresses needed
- Works seamlessly across WSL2, Docker networks, and LAN access

### Responsive Design Details
- **Header**: Fixed with refresh button, responsive padding
- **Content Area**: Flex container with overflow handling
- **Mobile Tab Switcher**: Hidden on `md:` breakpoint
- **Desktop Split View**: Left panel flex-1, right panel fixed 384px width
- **Touch Targets**: Minimum 44px height for buttons (accessibility)
- **Visual Feedback**: Border colors, bg colors, hover states, loading states

### Backend Integration Status
- ✅ Channel data from `/api/channels` (implemented)
- ✅ Channel refresh via `/api/channels/refresh` (implemented)
- ❌ Layout application via `/api/layout/set` (Phase 2 - not yet implemented)
- ❌ Audio swap via `/api/layout/swap-audio` (Phase 2 - not yet implemented)
- ❌ Current layout retrieval via `/api/layout/current` (Phase 2 - not yet implemented)

## Backend M3U Implementation

### M3U Parser Details (server.py)
The M3U parser uses regex to extract channel metadata from standard M3U/M3U8 files:

**Parsing Logic**:
1. Split content into lines
2. Find `#EXTINF:` lines (channel metadata)
3. Extract attributes using regex:
   - `tvg-id="(...)"` → channel ID
   - `tvg-name="(...)"` → channel name
   - `tvg-logo="(...)"` → icon URL
   - `tvg-chno="(...)"` → channel number
   - `group-title="(...)"` → group/category
   - Text after comma → display name
4. Next non-comment line → stream URL
5. Generate unique ID (use tvg-id or UUID if missing)

**Error Handling**:
- Network errors (URL fetch): Logs error, returns empty list
- File not found: Logs error, returns empty list
- Parse errors: Logs error, returns empty list
- Invalid entries: Skipped silently

**Thread Safety**:
- Global `CHANNELS` list protected by `CHANNELS_LOCK`
- `load_channels()` acquires lock before updating
- API endpoints acquire lock before reading

**Performance**:
- In-memory storage (no database)
- Lazy loading (only on startup or manual refresh)
- No automatic polling (user-triggered refresh only)

**M3U Source Configuration**:
```bash
# Environment variable (default if not set)
M3U_SOURCE=http://127.0.0.1:9191/output/m3u?direct=true

# Can also be a local file path
M3U_SOURCE=/path/to/channels.m3u
```

**API Response Format**:
```json
{
  "channels": [...],
  "count": 16
}
```

## Roadmap & Future Features

### Phase 1: Channel Management (Complete ✓)
**Goal**: Parse and serve M3U channel data to frontend

**Status**: ✅ Implemented and tested

**Backend Implementation**:
- ✅ M3U parser with regex-based extraction (server.py:61-170)
  - Supports `tvg-id`, `tvg-name`, `tvg-logo`, `tvg-chno`, `group-title`
  - Handles both HTTP/HTTPS URLs and local file paths
  - Thread-safe with `CHANNELS_LOCK`
- ✅ `GET /api/channels` - returns channel list with count
- ✅ `POST /api/channels/refresh` - re-fetches M3U and updates in-memory cache
- ✅ `M3U_SOURCE` environment variable (default: http://127.0.0.1:9191/output/m3u?direct=true)
- ✅ CORS middleware enabled for frontend communication
- ✅ Channels loaded on server startup

**Channel Data Structure**:
```json
{
  "id": "2.1",              // tvg-id (or UUID if missing)
  "name": "NBC",            // tvg-name (or display name)
  "icon": "http://...",     // tvg-logo URL
  "url": "http://...",      // stream URL
  "group": "OTA",           // group-title
  "channel_number": "2.1"   // tvg-chno
}
```

**Frontend Requirements** (Already Built):
- ✅ Channel list UI with icons and names
- ✅ "Refresh Channels" button
- ✅ Static placeholder images for channel icons
- ✅ Mobile-responsive list view with search

### Phase 2: Layout System
**Goal**: Support multiple layout types with flexible stream assignment

**Supported Layout Types**:
1. **Picture-in-Picture (PiP)** - 1 main + 1 inset (current implementation)
2. **Multi-PiP** - 1 main + 2-4 small insets
3. **Split Screen** - 2 streams side-by-side or top/bottom (equal size)
4. **Grid Layouts**:
   - 2x2 (4 streams)
   - 3x3 (up to 9 streams, but limit to 5 total)
   - 2x1 (2 streams horizontal)
   - 1x2 (2 streams vertical)
5. **Asymmetric** - custom layouts (e.g., 1 large + 3 small in different positions)

**Layout Configuration**:
- Each layout has N slots (positions for streams)
- Each slot has: position, size, optional border styling
- Maximum 5 concurrent input streams (CPU constraint)
- Output resolution: 1920x1080 (fixed)

**API Requirements**:
- `POST /api/layout/set` - accepts layout type + stream assignments + audio source
  ```json
  {
    "layout": "grid_2x2",
    "streams": {
      "slot1": "channel-id-1",
      "slot2": "channel-id-2",
      "slot3": "channel-id-3",
      "slot4": "channel-id-4"
    },
    "audio_source": "slot1"
  }
  ```
- `GET /api/layout/current` - returns current layout configuration
- `POST /api/layout/swap-audio` - quick audio source change without layout restart

**Frontend Requirements**:
- Layout selector (visual previews of layout types)
- Drag-and-drop or click-to-assign channels to slots
- Audio source selector (radio buttons or dropdown)
- Quick audio swap button
- Visual indicator showing which slot is audio source (nice-to-have)

### Phase 3: Seamless Transitions & Error Handling
**Goal**: Never break the output HLS stream, even during transitions or input failures

**Critical Requirements**:
1. **Seamless Layout Changes**:
   - Output HLS stream stays continuous (brief visual cut is acceptable)
   - FFmpeg process can be restarted, but HLS playlist must remain valid
   - Approach: Keep HLS endpoint alive, regenerate segments on the fly

2. **Dead Stream Handling**:
   - When input stream dies/fails, replace with placeholder (black screen or static image)
   - Don't kill entire FFmpeg process if one input fails
   - FFmpeg reconnection flags should handle most temporary failures
   - If input permanently fails, replace with `lavfi` color/anullsrc source

3. **Graceful Degradation**:
   - If 5 streams requested but one fails to connect, show 4 + 1 placeholder
   - Log errors but don't expose to user (just show placeholder)

**Implementation Strategy**:
- Use FFmpeg `shortest=0` to prevent early termination
- Monitor FFmpeg stderr for input failures
- Dynamically substitute failed inputs with placeholder sources
- Transition timing: aim for <3 seconds from request to new layout visible

### Phase 4: Frontend Polish
**Goal**: Professional, mobile-friendly user experience

**UI/UX Requirements**:
- **Responsive Design**: Works on phones, tablets, desktops
- **Touch-Friendly**: Large tap targets, smooth scrolling
- **Visual Feedback**: Loading states, success/error messages
- **Real-Time Updates**: Poll API every 2-5 seconds for current layout state
- **Preview**: Static thumbnails for channels (from M3U tvg-logo)
- **Accessibility**: Proper contrast, readable fonts, semantic HTML

**Nice-to-Have Features**:
- Dark mode
- Keyboard shortcuts for desktop users
- Recent channels / favorites (in-memory, not persisted)
- Audio source indicator on active stream slot

## System Behavior

### Operating Modes

1. **Black Mode (Standby)**:
   - Streams pure black video with silent audio
   - Default state on startup
   - Activated when idle timeout is reached
   - No text overlay (avoids drawtext dependency)

2. **Live Mode**:
   - Streams combined PiP video from two sources
   - Base video: 1920x1080 (full screen)
   - Inset video: configurable size with 8px white border
   - Positioned at bottom-right with configurable margin

### Video Processing Pipeline

**Live Mode Pipeline:**
```
IN1 (base) → scale to 1920x1080 → pad to center → [base]
IN2 (pip)  → scale to INSET_SCALE → add 8px white border → [pip]
[base] + [pip] → overlay (bottom-right) → encode → HLS output
```

**Audio Options** (AUDIO_SOURCE):
- `0`: Audio from IN1 (default)
- `1`: Audio from IN2
- `2`: Mixed audio from both inputs (normalized)

### Encoding Settings

**GPU Mode (NVIDIA)** (default):
- Codec: h264_nvenc
- Preset: p5
- Rate control: VBR
- Bitrate: 6000k (max 6500k)
- Buffer: 12M
- Spatial AQ: enabled (strength 8)

**CPU Mode** (FORCE_CPU=1):
- Codec: libx264
- Preset: veryfast
- Tune: zerolatency
- Same bitrate settings as GPU

**Common Settings:**
- Resolution: 1920x1080
- Frame rate: 30 fps
- Pixel format: yuv420p
- GOP size: 60 frames (2 seconds)
- Audio: AAC 128k, 48kHz, stereo

### Streaming Configuration
- Format: MPEG-TS (continuous stream)
- Output: `/out/stream.ts`
- Endpoint: `/stream` (HTTP streaming response)
- Max file size: 500MB (auto-restart when exceeded)
- Client compatibility: VLC, Plex LiveTV, most IPTV players

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `IDLE_TIMEOUT` | 60 | Seconds of inactivity before switching to standby |
| `DEFAULT_UA` | Chrome 128 | User-Agent for source stream requests |
| `SOURCE_HEADERS` | "" | Additional headers for source streams (\\n separated) |
| `AUDIO_SOURCE` | 0 | Audio source: 0=IN1, 1=IN2, 2=mix |
| `FORCE_CPU` | 0 | Set to "0" for GPU (h264_nvenc), "1" for CPU (libx264) |
| `INSET_SCALE` | 640 | Width of inset video (height auto-calculated) |
| `INSET_MARGIN` | 40 | Margin from bottom-right corner (pixels) |
| `STANDBY_LABEL` | "Standby" | Label text for standby mode (currently unused) |
| `HLS_TIME` | 1 | HLS segment duration in seconds |
| `HLS_LIST_SIZE` | 8 | Number of segments in playlist |
| `HLS_DELETE_THRESHOLD` | 2 | Segment deletion threshold |
| `FONT` | DejaVuSans.ttf | Font file path for text rendering |
| `PORT` | 9292 | HTTP server port |
| `M3U_SOURCE` | http://127.0.0.1:9191/output/m3u?direct=true | URL or file path to M3U playlist |
| `MAX_STREAM_SIZE` | 524288000 (500MB) | Maximum stream.ts file size before automatic restart |

## API Endpoints

### GET `/`
- **Without params**: Returns help text
- **With params**: `?in1=<url>&in2=<url>` - Starts live mode and redirects to playlist

### GET `/control/start?in1=<url>&in2=<url>`
- Starts live PiP mode with two input streams
- Returns: `{"status": "live", "playlist": "http://localhost:9292/hls/multiview.m3u8"}`

### GET `/control/stop`
- Stops live mode and switches to standby (black screen)
- Returns: `{"status": "standby"}`

### GET `/control/swap`
- Swaps IN1 and IN2 positions (base ↔ inset)
- Only works when live mode is active
- Returns: `{"status": "swapped"}` or error if not in live mode

### GET `/control/status`
- Returns current system status
- Response:
  ```json
  {
    "proc_running": true/false,
    "mode": "black" or "live",
    "in1": "url or null",
    "in2": "url or null",
    "idle_timeout_sec": 60,
    "last_hit_epoch": 1234567890.123
  }
  ```

### GET `/hls/multiview.m3u8`
- HLS playlist for video playback
- All `/hls/*` requests reset the idle timeout counter

### GET `/api/channels` ✨ New
- Returns list of available channels from M3U source
- Response:
  ```json
  {
    "channels": [
      {
        "id": "2.1",
        "name": "NBC",
        "icon": "http://127.0.0.1:9191/api/channels/logos/10/cache/",
        "url": "http://192.168.117.6:5004/auto/v2.1",
        "group": "OTA",
        "channel_number": "2.1"
      },
      ...
    ],
    "count": 16
  }
  ```

### POST `/api/channels/refresh` ✨ New
- Re-fetches M3U from source and re-parses channel list
- Updates in-memory channel cache
- Response: Same as `/api/channels` with additional `message` field

## Process Management

### FFmpeg Process Lifecycle
1. **Startup**: Watchdog thread starts, black mode activated
2. **Live Request**: Stops current process, cleans output dir, starts new process
3. **Idle Detection**: Watchdog checks every 5 seconds for timeout
4. **Graceful Shutdown**: Sends SIGINT, waits 3s, then SIGKILL if needed

### Thread Safety
- `threading.Lock()` protects all process start/stop operations
- Global state variables: `PROC`, `MODE`, `CUR_IN1`, `CUR_IN2`, `LAST_HIT`

### Idle Timeout Mechanism
- Middleware tracks `/stream` requests and updates `LAST_HIT`
- Watchdog thread monitors time since last hit
- If `IDLE_TIMEOUT` exceeded in live mode → switch to black mode
- Prevents resource waste when no one is watching

### File Size Management
- Watchdog thread monitors `stream.ts` file size every 5 seconds
- When file exceeds `MAX_STREAM_SIZE` (default 500MB) → FFmpeg automatically restarts
- Restart preserves current mode and inputs (seamless for clients)
- Prevents unbounded disk usage from continuous MPEG-TS output
- VLC/Plex clients auto-reconnect during restart (brief 1-3 second interruption)

## Important Implementation Details

### Stream Reliability Features
- **Reconnection**: Auto-reconnect on network errors
- **Timeouts**: 15s read/write timeout (15000000 microseconds)
- **Thread Queues**: 1024-size buffers to prevent drops
- **User-Agent**: Spoofs Chrome to avoid blocking
- **Custom Headers**: Support for authentication/authorization headers

### Video Processing Notes
- **Aspect Ratio**: Both inputs maintain aspect ratio
- **SAR**: Set to 1:1 (square pixels) for both streams
- **Shortest Input**: Overlay stops when shorter input ends
- **Frame Sync**: Uses `fps=30` filter to normalize frame rates
- **Audio Sync**: `aresample=async=1:first_pts=0` for mixed audio mode

### Output Directory Management
- Output directory: `/out` (created on startup)
- Cleaned (all files deleted) before each new stream start
- Prevents old segments from polluting new streams
- Static files served via FastAPI's `StaticFiles`

## Deployment

### Docker Build & Run
```bash
docker build -t multiview .
docker run --gpus all -p 9292:9292 -e IDLE_TIMEOUT=120 multiview
```

### GPU Requirements
- NVIDIA GPU with NVENC support
- nvidia-docker runtime installed
- Falls back to CPU encoding if GPU unavailable (set `FORCE_CPU=1`)

## Known Considerations

1. **No Text Overlay in Black Mode**: Intentionally avoids drawtext to reduce dependencies
2. **No Authentication**: API is open - designed for local network household use only
3. **Single Stream Output**: Only one HLS output at a time (single household viewing experience)
4. **Hardcoded Resolution**: Output is always 1920x1080
5. **No Input Validation**: URLs are passed directly to FFmpeg (validate in production)
6. **GPU Encoding**: Uses NVIDIA NVENC (h264_nvenc) by default with RTX 3090
   - CPU fallback available with libx264 (set FORCE_CPU=1)
   - Requires NVIDIA Container Toolkit for Docker GPU access
7. **Stream Limit**: Maximum 5 concurrent input streams (layout management constraint)
   - NVENC hardware supports up to 8 concurrent sessions on RTX 3090
8. **WSL2 Networking**: Running in WSL2 on Windows
   - Docker containers accessible via localhost from Windows host
   - LAN access via Windows host IP (192.168.117.2 in this deployment)
   - Frontend uses dynamic API URL detection to work with both
   - Cannot use `network_mode: host` on Docker Desktop/WSL2 (doesn't work correctly)

## Key Design Decisions

### Seamless Streaming (Critical Requirement)
- **Goal**: Output HLS stream never breaks, even during layout changes or input failures
- **Approach**: Brief visual cuts are acceptable, but HLS playlist stays valid
- **Challenge**: Restarting FFmpeg process while maintaining HLS continuity
- **Solution**: Fast process restart (<3s), keep output directory mounted, regenerate segments

### Single Active Layout
- **Not per-user**: All viewers see the same layout at the same time
- **Reason**: Simplifies architecture, matches household TV use case
- **Implication**: Layout changes affect everyone watching immediately

### No Persistence
- **Config-file based**: All settings via environment variables or config files
- **No database**: Channel list from M3U, layout state in memory only
- **Reason**: Household use doesn't require history/analytics
- **Restart behavior**: Returns to standby/black mode on restart

### M3U as Single Source of Truth
- **Channel List**: Fetched from local or remote M3U file
- **Manual Refresh**: User clicks "Refresh Channels" button to update
- **No auto-polling**: Prevents unnecessary network/disk I/O
- **Format**: Standard M3U/M3U8 with extended attributes
- **Expected Attributes**:
  - `tvg-logo`: Channel icon/thumbnail URL
  - `tvg-name` or channel name after `#EXTINF`: Display name
  - Stream URL: HTTP/HLS/RTMP/TS stream URL
- **Supported Stream Types**: HLS (.m3u8), RTMP, HTTP, TS (Transport Stream)
- **No Authentication**: Streams must be publicly accessible (no per-stream auth headers)

### Audio Source Independence
- **Always Single Audio**: Only one stream provides audio at a time
- **User Selectable**: Can be any slot in the layout
- **Quick Swap**: Can change audio source without restarting entire layout (nice-to-have optimization)

### Stream Failure Handling
- **Placeholder on Failure**: Dead streams show black screen (or static image placeholder)
- **Don't Break Output**: If 1 of 4 inputs fails, show 3 working + 1 placeholder
- **FFmpeg Reconnection**: Relies on FFmpeg's built-in reconnection flags first
- **Permanent Failure**: Replace failed input with `lavfi` color source in FFmpeg command
- **No User Notification**: Just show placeholder, log errors server-side
- **Goal**: Invisible degradation - users see black box, not broken stream

## Deployment

### Quick Deployment (Recommended)

Use the automated deployment script:
```bash
./deploy.sh
```

This handles:
- IP detection
- Frontend configuration
- Docker compose build & start
- Access URL display

### Manual Docker Deployment

**Using Docker Compose**:
```bash
# Configure M3U source in docker-compose.yml first
nano docker-compose.yml

# Build and start both backend and frontend
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

**Backend Only**:
```bash
docker build -t multiview-backend .
docker run -d --name multiview --network host \
  -v $(pwd)/out:/out \
  -e M3U_SOURCE=http://host.docker.internal:9191/output/m3u?direct=true \
  -e FORCE_CPU=1 \
  multiview-backend
```

### Mobile Access Configuration

1. **Find server IP**: `hostname -I` or `ip addr show`
2. **Configure frontend**: Edit `frontend/.env.local`
   ```bash
   NEXT_PUBLIC_API_URL=http://192.168.1.100:9292
   ```
3. **Update firewall**: Allow ports 9393 (frontend) and 9292 (backend)
4. **Access from mobile**: Navigate to `http://<server-ip>:9393`

See **[DEPLOY.md](DEPLOY.md)** for comprehensive deployment instructions.

See **[QUICKSTART.md](QUICKSTART.md)** for step-by-step setup guide.

## Development Notes

### Testing Locally
```bash
# Backend
pip install fastapi uvicorn[standard]
python -m uvicorn server:app --host 0.0.0.0 --port 9292

# Frontend
cd frontend
npm install
npm run dev
```

### Common Use Cases
- **Sports**: Watch multiple games simultaneously
- **Monitoring**: View multiple camera feeds in one stream
- **Broadcasting**: Main content + secondary feed overlay
- **Household**: Family members can control what's on TV from their phones

## Development Priorities

### Immediate Next Steps
1. **M3U Parser & Channel API** (Phase 1)
   - Implement M3U parsing library or custom parser
   - Create `/api/channels` and `/api/channels/refresh` endpoints
   - Add M3U_SOURCE config variable
   - Test with real M3U file

2. **Next.js Frontend Scaffold** (Phase 1)
   - Set up Next.js project structure
   - Create basic channel list UI
   - Implement API client for backend communication
   - Mobile-responsive layout with Tailwind CSS

3. **Multi-Layout FFmpeg Commands** (Phase 2)
   - Generalize FFmpeg command builder for N inputs
   - Create filter_complex generators for each layout type
   - Test grid layouts (2x2, 3x3) with placeholder streams

4. **Layout API Endpoints** (Phase 2)
   - Implement `POST /api/layout/set` with layout validation
   - Add layout-to-FFmpeg-command mapping
   - Support independent audio source selection

### Future Enhancements (Lower Priority)
- [ ] Health check endpoint (`/health`)
- [ ] Structured logging with JSON output
- [ ] Metrics collection (stream uptime, error rates)
- [ ] Input URL validation and sanitization
- [ ] Stream quality monitoring and auto-fallback
- [ ] Optional: Configurable output resolutions (720p, 4K)

### Explicitly NOT Needed
- ❌ Authentication/authorization (local network only)
- ❌ User accounts or per-user settings
- ❌ Database or persistent storage
- ❌ Layout saving/persistence
- ❌ Multiple simultaneous output streams (single household use)

---

**Remember**: Keep this file updated with any changes, bugs fixed, features added, or important discoveries during development!
