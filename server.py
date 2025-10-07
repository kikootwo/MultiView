import os, subprocess, threading, time, signal, pathlib, re, uuid
from urllib.request import urlopen
from urllib.error import URLError
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Dict

app = FastAPI()

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (local network only)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTDIR = "/out"
os.makedirs(OUTDIR, exist_ok=True)

# --- Tunables (override via -e NAME=value) ---
IDLE_TIMEOUT = int(os.getenv("IDLE_TIMEOUT", "60"))
DEFAULT_UA = os.getenv("DEFAULT_UA", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36")
SOURCE_HEADERS = os.getenv("SOURCE_HEADERS", "")
AUDIO_SOURCE = int(os.getenv("AUDIO_SOURCE", "0"))     # 0=IN1, 1=IN2, 2=mix
FORCE_CPU = os.getenv("FORCE_CPU", "0") == "1"
INSET_SCALE = int(os.getenv("INSET_SCALE", "640"))
INSET_MARGIN = int(os.getenv("INSET_MARGIN", "40"))
STANDBY_LABEL = os.getenv("STANDBY_LABEL", "Standby")
HLS_TIME = os.getenv("HLS_TIME", "1")
HLS_LIST_SIZE = os.getenv("HLS_LIST_SIZE", "8")
HLS_DELETE_THRESHOLD = os.getenv("HLS_DELETE_THRESHOLD", "2")
FONT = os.getenv("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
M3U_SOURCE = os.getenv("M3U_SOURCE", "http://127.0.0.1:9191/output/m3u?direct=true")
# ------------------------------------------------

PROC = None
LOCK = threading.Lock()
LAST_HIT = 0.0
MODE = "black"  # "black" or "live"
CUR_IN1 = None
CUR_IN2 = None

# Channel storage (in-memory)
CHANNELS = []
CHANNELS_LOCK = threading.Lock()

# Current layout configuration
CURRENT_LAYOUT = None
CURRENT_LAYOUT_LOCK = threading.Lock()

# Pydantic models for API
class LayoutConfigModel(BaseModel):
    layout: str  # 'pip', 'split_h', 'grid_2x2', etc.
    streams: Dict[str, str]  # slotId -> channelId
    audio_source: str  # slotId providing audio

app.mount("/hls", StaticFiles(directory=OUTDIR), name="hls")

@app.middleware("http")
async def touch_last_hit(request: Request, call_next):
    global LAST_HIT
    if request.url.path.startswith("/hls"):
        LAST_HIT = time.time()
    return await call_next(request)

# ========== M3U Parsing ==========

def parse_m3u(content: str):
    """
    Parse M3U content and return list of channel dictionaries.

    Expected format:
    #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." tvg-chno="..." group-title="...",Display Name
    http://stream.url
    """
    channels = []
    lines = content.strip().split('\n')
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Look for #EXTINF lines
        if line.startswith('#EXTINF:'):
            # Extract metadata using regex
            tvg_id = ""
            tvg_name = ""
            tvg_logo = ""
            tvg_chno = ""
            group_title = ""
            display_name = ""

            # Extract tvg-id
            match = re.search(r'tvg-id="([^"]*)"', line)
            if match:
                tvg_id = match.group(1)

            # Extract tvg-name
            match = re.search(r'tvg-name="([^"]*)"', line)
            if match:
                tvg_name = match.group(1)

            # Extract tvg-logo
            match = re.search(r'tvg-logo="([^"]*)"', line)
            if match:
                tvg_logo = match.group(1)

            # Extract tvg-chno
            match = re.search(r'tvg-chno="([^"]*)"', line)
            if match:
                tvg_chno = match.group(1)

            # Extract group-title
            match = re.search(r'group-title="([^"]*)"', line)
            if match:
                group_title = match.group(1)

            # Extract display name (after last comma)
            if ',' in line:
                display_name = line.split(',', 1)[1].strip()

            # Next line should be the stream URL
            i += 1
            if i < len(lines):
                stream_url = lines[i].strip()

                # Skip empty URLs or comments
                if stream_url and not stream_url.startswith('#'):
                    # Generate unique ID (use tvg-id if available, otherwise UUID)
                    channel_id = tvg_id if tvg_id else str(uuid.uuid4())

                    # Prefer tvg-name, fall back to display_name
                    name = tvg_name if tvg_name else display_name

                    channels.append({
                        "id": channel_id,
                        "name": name,
                        "icon": tvg_logo,
                        "url": stream_url,
                        "group": group_title,
                        "channel_number": tvg_chno,
                    })

        i += 1

    return channels

def fetch_and_parse_m3u():
    """Fetch M3U from source and parse it."""
    try:
        # Check if M3U_SOURCE is a URL or file path
        if M3U_SOURCE.startswith('http://') or M3U_SOURCE.startswith('https://'):
            # Fetch from URL
            with urlopen(M3U_SOURCE, timeout=30) as response:
                content = response.read().decode('utf-8')
        else:
            # Read from file
            with open(M3U_SOURCE, 'r', encoding='utf-8') as f:
                content = f.read()

        return parse_m3u(content)
    except URLError as e:
        print(f"Error fetching M3U from URL: {e}")
        return []
    except FileNotFoundError:
        print(f"M3U file not found: {M3U_SOURCE}")
        return []
    except Exception as e:
        print(f"Error parsing M3U: {e}")
        return []

def load_channels():
    """Load channels from M3U source into global CHANNELS list."""
    global CHANNELS
    with CHANNELS_LOCK:
        CHANNELS = fetch_and_parse_m3u()
        print(f"Loaded {len(CHANNELS)} channels from M3U")

# ========== End M3U Parsing ==========

def _headers_value():
    return SOURCE_HEADERS.replace("\\n", "\r\n") if SOURCE_HEADERS else ""

def _gpu_or_cpu_parts():
    if not FORCE_CPU:
        return [
            "-c:v", "h264_nvenc",
            "-preset", "p5", "-rc", "vbr",
            "-b:v", "6000k", "-maxrate", "6500k", "-bufsize", "12M",
            "-spatial_aq", "1", "-aq-strength", "8",
            "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
        ]
    else:
        return [
            "-c:v", "libx264",
            "-preset", "veryfast", "-tune", "zerolatency",
            "-b:v", "6000k", "-maxrate", "6500k", "-bufsize", "12M",
            "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
        ]

def _output_parts():
    """
    Output MPEG-TS stream to file for HTTP streaming to Plex.
    Using file-based approach allows multiple concurrent clients.
    """
    return [
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-fflags", "+genpts",
        "-flags", "low_delay",
        "-f", "mpegts",
        "-mpegts_flags", "resend_headers",
        f"{OUTDIR}/stream.ts"
    ]

def build_black_cmd():
    # Pure black video + silent audio; no text overlay (avoids drawtext dependency)
    cmd = [
        "ffmpeg","-loglevel","warning","-hide_banner","-nostdin",
        "-re","-f","lavfi","-i","color=c=black:s=1920x1080:r=30",
        "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000",
        "-map","0:v","-map","1:a",
    ]
    cmd += _gpu_or_cpu_parts() + _output_parts()
    return cmd


def build_live_cmd(in1: str, in2: str, audio_mode: int):
    # Base + inset (with 8px white border via pad)
    pip_graph = (
        "[0:v]fps=30,scale=1920:-2:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];"
        f"[1:v]scale={INSET_SCALE}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={INSET_SCALE+16}:376:8:8:color=white[pip];"
        f"[base][pip]overlay=W-w-{INSET_MARGIN}:H-h-{INSET_MARGIN}:shortest=1[v]"
    )

    fc = pip_graph
    amap = ["-map","[v]","-map","0:a?"]  # default audio from IN1
    if audio_mode == 1:
        amap = ["-map","[v]","-map","1:a?"]  # audio from IN2
    elif audio_mode == 2:
        # mix both
        fc = pip_graph + ";[0:a]aresample=async=1:first_pts=0[a0];[1:a]aresample=async=1:first_pts=0[a1];[a0][a1]amix=inputs=2:normalize=1[a]"
        amap = ["-map","[v]","-map","[a]"]

    cmd = [
        "ffmpeg","-loglevel","warning","-hide_banner","-nostdin",
        "-thread_queue_size","1024","-user_agent",DEFAULT_UA,
    ]
    if SOURCE_HEADERS.strip(): cmd += ["-headers", _headers_value()]
    cmd += [
        "-reconnect","1","-reconnect_streamed","1","-reconnect_on_network_error","1",
        "-rw_timeout","15000000","-timeout","15000000",
        "-i", in1,
        "-thread_queue_size","1024","-user_agent",DEFAULT_UA,
    ]
    if SOURCE_HEADERS.strip(): cmd += ["-headers", _headers_value()]
    cmd += [
        "-reconnect","1","-reconnect_streamed","1","-reconnect_on_network_error","1",
        "-rw_timeout","15000000","-timeout","15000000",
        "-i", in2,
        "-filter_complex", fc,
    ]
    cmd += amap + _gpu_or_cpu_parts() + _output_parts()
    return cmd

def stop_ffmpeg():
    global PROC
    if PROC and PROC.poll() is None:
        try:
            PROC.send_signal(signal.SIGINT)
            PROC.wait(timeout=3)
        except Exception:
            try: PROC.kill()
            except Exception: pass
    PROC = None

def clean_outdir():
    """Clean output directory completely."""
    for p in pathlib.Path(OUTDIR).glob("*"):
        try: p.unlink()
        except: pass

def start_black():
    global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2, CURRENT_LAYOUT
    with LOCK:
        stop_ffmpeg()
        clean_outdir()
        # Output to file - no need to capture stdout
        PROC = subprocess.Popen(build_black_cmd())
        MODE = "black"
        CUR_IN1 = CUR_IN2 = None
        LAST_HIT = time.time()
    # Clear current layout when stopping
    with CURRENT_LAYOUT_LOCK:
        CURRENT_LAYOUT = None

def start_live(in1: str, in2: str):
    global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2
    with LOCK:
        stop_ffmpeg()
        clean_outdir()
        # Output to file - no need to capture stdout
        PROC = subprocess.Popen(build_live_cmd(in1, in2, AUDIO_SOURCE))
        MODE = "live"
        CUR_IN1, CUR_IN2 = in1, in2
        LAST_HIT = time.time()

def ensure_running():
    if not (PROC and PROC.poll() is None):
        start_black()

def idle_watchdog():
    global MODE
    while True:
        time.sleep(5)
        ensure_running()
        if MODE == "live" and (time.time() - LAST_HIT > IDLE_TIMEOUT):
            start_black()

threading.Thread(target=idle_watchdog, daemon=True).start()

@app.on_event("startup")
def boot():
    load_channels()  # Load channels on startup
    start_black()

@app.get("/")
async def home(in1: str | None = None, in2: str | None = None):
    if in1 and in2:
        start_live(in1, in2)
        return RedirectResponse(url="/stream", status_code=302)
    return PlainTextResponse(
        "Multiview PiP is running.\n\n"
        "Start with:\n"
        "  /control/start?in1=<url>&in2=<url>\n"
        "Stop (to standby):\n"
        "  /control/stop\n\n"
        "Stream URL (for Plex LiveTV):\n"
        "  /stream\n"
    )

@app.get("/control/start")
async def control_start(in1: str, in2: str):
    start_live(in1, in2)
    port = os.getenv('PORT', '9292')
    return JSONResponse({
        "status": "live",
        "stream_url": f"http://localhost:{port}/stream"
    })

@app.get("/control/stop")
async def control_stop():
    start_black()
    return {"status":"standby"}

@app.get("/control/swap")
async def control_swap():
    global CUR_IN1, CUR_IN2
    if not (CUR_IN1 and CUR_IN2):
        return {"status":"no-live-stream","hint":"start first with /control/start?in1=..&in2=.."}
    CUR_IN1, CUR_IN2 = CUR_IN2, CUR_IN1
    start_live(CUR_IN1, CUR_IN2)
    return {"status":"swapped"}

@app.get("/control/status")
async def status():
    running = PROC is not None and PROC.poll() is None
    port = os.getenv('PORT', '9292')
    return {
        "proc_running": running,
        "mode": MODE,
        "in1": CUR_IN1, "in2": CUR_IN2,
        "idle_timeout_sec": IDLE_TIMEOUT,
        "last_hit_epoch": LAST_HIT,
        "stream_url": f"http://localhost:{port}/stream",
    }

@app.get("/stream")
async def stream():
    """
    Stream MPEG-TS from file for Plex LiveTV.
    Continuously reads from stream.ts as FFmpeg writes to it.
    Multiple clients can connect simultaneously.
    """
    global PROC, LAST_HIT

    # Touch last hit to prevent idle timeout during streaming
    LAST_HIT = time.time()

    def generate():
        """
        Generator that yields MPEG-TS chunks as they're written to file.
        When layout changes, file is deleted and client will disconnect.
        VLC/Plex will automatically reconnect and get the new layout.
        """
        global LAST_HIT
        stream_path = pathlib.Path(OUTDIR) / "stream.ts"

        # Wait for file to be created (up to 10 seconds)
        for _ in range(100):
            if stream_path.exists() and stream_path.stat().st_size > 0:
                break
            time.sleep(0.1)
        else:
            print("Stream file not created")
            return

        chunk_size = 188 * 100  # MPEG-TS packets are 188 bytes

        try:
            with open(stream_path, 'rb') as f:
                while True:
                    chunk = f.read(chunk_size)
                    if chunk:
                        LAST_HIT = time.time()
                        yield chunk
                    else:
                        # No new data available yet
                        # Check if file still exists (layout change deletes it)
                        if not stream_path.exists():
                            print("Stream file deleted (layout change)")
                            return
                        # Check if FFmpeg is still running
                        if PROC is None or PROC.poll() is not None:
                            print("FFmpeg stopped")
                            return
                        # Wait for more data to be written
                        time.sleep(0.05)
        except FileNotFoundError:
            print("Stream file deleted during read")
            return
        except Exception as e:
            print(f"Streaming error: {e}")
            return

    return StreamingResponse(
        generate(),
        media_type="video/mp2t",
        headers={
            "Content-Type": "video/mp2t",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        }
    )

# ========== Channel Management API ==========

@app.get("/api/channels")
async def get_channels():
    """Return list of available channels from M3U."""
    with CHANNELS_LOCK:
        return {
            "channels": CHANNELS,
            "count": len(CHANNELS),
        }

@app.post("/api/channels/refresh")
async def refresh_channels():
    """Re-fetch and re-parse M3U file."""
    load_channels()
    with CHANNELS_LOCK:
        return {
            "channels": CHANNELS,
            "count": len(CHANNELS),
            "message": "Channels refreshed successfully",
        }

# ========== Layout Management API ==========

def get_channel_by_id(channel_id: str) -> dict | None:
    """Look up channel by ID from CHANNELS list."""
    with CHANNELS_LOCK:
        for channel in CHANNELS:
            if channel["id"] == channel_id:
                return channel
    return None

@app.post("/api/layout/set")
async def set_layout(config: LayoutConfigModel):
    """
    Set layout configuration and start streaming.

    For PiP layout, expects:
    - streams: { 'main': 'channel-id', 'inset': 'channel-id' }
    - audio_source: 'main' or 'inset'
    """
    global CURRENT_LAYOUT

    # Validate layout type
    if config.layout != 'pip':
        raise HTTPException(status_code=400, detail=f"Layout '{config.layout}' not yet implemented. Only 'pip' is currently supported.")

    # For PiP, we need 'main' and 'inset' slots
    if 'main' not in config.streams or 'inset' not in config.streams:
        raise HTTPException(status_code=400, detail="PiP layout requires 'main' and 'inset' slots to be assigned.")

    # Look up channel URLs
    main_channel = get_channel_by_id(config.streams['main'])
    inset_channel = get_channel_by_id(config.streams['inset'])

    if not main_channel:
        raise HTTPException(status_code=404, detail=f"Channel not found: {config.streams['main']}")
    if not inset_channel:
        raise HTTPException(status_code=404, detail=f"Channel not found: {config.streams['inset']}")

    main_url = main_channel['url']
    inset_url = inset_channel['url']

    # Determine audio mode based on audio_source
    audio_mode = 0  # default to main
    if config.audio_source == 'inset':
        audio_mode = 1
    elif config.audio_source not in ['main', 'inset']:
        raise HTTPException(status_code=400, detail=f"Invalid audio_source: {config.audio_source}. Must be 'main' or 'inset' for PiP layout.")

    # Start the stream
    try:
        # Use existing start_live function with main as IN1, inset as IN2
        global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2
        with LOCK:
            stop_ffmpeg()
            clean_outdir()
            PROC = subprocess.Popen(build_live_cmd(main_url, inset_url, audio_mode))
            MODE = "live"
            CUR_IN1, CUR_IN2 = main_url, inset_url
            LAST_HIT = time.time()

        # Store current layout config
        with CURRENT_LAYOUT_LOCK:
            CURRENT_LAYOUT = config.dict()

        return {
            "status": "success",
            "message": f"PiP layout started with {main_channel['name']} (main) and {inset_channel['name']} (inset)",
            "audio_source": config.audio_source,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start layout: {str(e)}")

@app.get("/api/layout/current")
async def get_current_layout():
    """Get current layout configuration."""
    with CURRENT_LAYOUT_LOCK:
        if CURRENT_LAYOUT is None:
            return {"layout": None, "message": "No layout is currently active"}
        return CURRENT_LAYOUT
