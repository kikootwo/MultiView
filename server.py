import os, subprocess, threading, time, signal, pathlib, re, uuid, asyncio, queue
from urllib.request import urlopen, Request as UrlRequest
from urllib.error import URLError
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Dict, Set
import zmq

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
ENCODER_PREFERENCE = os.getenv("ENCODER_PREFERENCE", "auto").lower()
INSET_SCALE = int(os.getenv("INSET_SCALE", "640"))
INSET_MARGIN = int(os.getenv("INSET_MARGIN", "40"))
STANDBY_LABEL = os.getenv("STANDBY_LABEL", "Standby")
HLS_TIME = os.getenv("HLS_TIME", "1")
HLS_LIST_SIZE = os.getenv("HLS_LIST_SIZE", "8")
HLS_DELETE_THRESHOLD = os.getenv("HLS_DELETE_THRESHOLD", "2")
FONT = os.getenv("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
M3U_SOURCE = os.getenv("M3U_SOURCE", "http://127.0.0.1:9191/output/m3u?direct=true")
# Stream file size limit (in bytes) - restart FFmpeg when exceeded
# Default: 500MB to prevent unbounded growth
MAX_STREAM_SIZE = int(os.getenv("MAX_STREAM_SIZE", str(500 * 1024 * 1024)))
# ------------------------------------------------

# ========== Hardware Encoder Detection ==========

# Encoder configurations with optimal settings for each hardware type
ENCODER_CONFIGS = {
    'nvidia': {
        'name': 'NVIDIA NVENC',
        'codec': 'h264_nvenc',
        'test_args': ['-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
        'encode_args': [
            "-c:v", "h264_nvenc",
            "-preset", "p5", "-rc", "vbr",
            "-b:v", "6000k", "-maxrate", "6500k", "-bufsize", "12M",
            "-spatial_aq", "1", "-aq-strength", "8",
            "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
        ]
    },
    'intel': {
        'name': 'Intel QuickSync',
        'codec': 'h264_qsv',
        'test_args': ['-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.1', '-c:v', 'h264_qsv', '-f', 'null', '-'],
        'encode_args': [
            "-c:v", "h264_qsv",
            "-preset", "medium", "-look_ahead", "1",
            "-b:v", "6000k", "-maxrate", "6500k", "-bufsize", "12M",
            "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
        ]
    },
    'amd': {
        'name': 'AMD VAAPI',
        'codec': 'h264_vaapi',
        'test_args': ['-init_hw_device', 'vaapi=va:/dev/dri/renderD128', '-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.1', '-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-f', 'null', '-'],
        'encode_args': [
            "-init_hw_device", "vaapi=va:/dev/dri/renderD128",
            "-vf", "format=nv12,hwupload",
            "-c:v", "h264_vaapi",
            "-b:v", "6000k", "-maxrate", "6500k",
            "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
        ]
    },
    'cpu': {
        'name': 'CPU (libx264)',
        'codec': 'libx264',
        'test_args': ['-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.1', '-c:v', 'libx264', '-f', 'null', '-'],
        'encode_args': [
            "-c:v", "libx264",
            "-preset", "veryfast", "-tune", "zerolatency",
            "-b:v", "6000k", "-maxrate", "6500k", "-bufsize", "12M",
            "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
        ]
    }
}

def test_encoder(encoder_type: str) -> bool:
    """
    Test if a specific encoder is available and functional.

    Args:
        encoder_type: One of 'nvidia', 'intel', 'amd', 'cpu'

    Returns:
        True if encoder works, False otherwise
    """
    if encoder_type not in ENCODER_CONFIGS:
        return False

    config = ENCODER_CONFIGS[encoder_type]
    print(f"  Testing {config['name']} ({config['codec']})...")

    try:
        # Run a quick encoding test with null output
        result = subprocess.run(
            ['ffmpeg', '-hide_banner', '-loglevel', 'error'] + config['test_args'],
            capture_output=True,
            timeout=5
        )

        if result.returncode == 0:
            print(f"    ✓ {config['name']} is available and functional")
            return True
        else:
            error_msg = result.stderr.decode('utf-8', errors='ignore').strip()
            print(f"    ✗ {config['name']} test failed: {error_msg[:100]}")
            return False

    except subprocess.TimeoutExpired:
        print(f"    ✗ {config['name']} test timed out")
        return False
    except FileNotFoundError:
        print(f"    ✗ FFmpeg not found")
        return False
    except Exception as e:
        print(f"    ✗ {config['name']} test error: {e}")
        return False

def detect_encoder() -> str:
    """
    Detect the best available hardware encoder based on ENCODER_PREFERENCE.

    Returns:
        encoder_type: One of 'nvidia', 'intel', 'amd', 'cpu'
    """
    print("=" * 60)
    print("Hardware Encoder Detection")
    print("=" * 60)
    print(f"Preference: {ENCODER_PREFERENCE}")
    print()

    # Define fallback chain (preference order)
    fallback_chain = ['nvidia', 'intel', 'amd', 'cpu']

    # If user specified a preference (not auto), try that first
    if ENCODER_PREFERENCE != 'auto':
        if ENCODER_PREFERENCE in ENCODER_CONFIGS:
            print(f"Testing user-specified encoder: {ENCODER_PREFERENCE}")
            if test_encoder(ENCODER_PREFERENCE):
                encoder_type = ENCODER_PREFERENCE
                config = ENCODER_CONFIGS[encoder_type]
                print()
                print("=" * 60)
                print(f"Selected Encoder: {config['name']} ({config['codec']})")
                print("=" * 60)
                print()
                return encoder_type
            else:
                print(f"  User-specified encoder '{ENCODER_PREFERENCE}' is not available")
                print(f"  Falling back to auto-detection...")
                print()
        else:
            print(f"  Invalid encoder preference: '{ENCODER_PREFERENCE}'")
            print(f"  Valid options: auto, nvidia, intel, amd, cpu")
            print(f"  Falling back to auto-detection...")
            print()

    # Auto-detection: try each encoder in preference order
    print("Auto-detecting available encoders...")
    print()

    for encoder_type in fallback_chain:
        if test_encoder(encoder_type):
            config = ENCODER_CONFIGS[encoder_type]
            print()
            print("=" * 60)
            print(f"Selected Encoder: {config['name']} ({config['codec']})")
            print("=" * 60)
            print()
            return encoder_type

    # This should never happen since CPU always works, but just in case
    print()
    print("=" * 60)
    print("WARNING: No encoders available! Defaulting to CPU")
    print("=" * 60)
    print()
    return 'cpu'

# Detect encoder at startup
SELECTED_ENCODER = detect_encoder()
SELECTED_ENCODER_CONFIG = ENCODER_CONFIGS[SELECTED_ENCODER]

# ========== End Hardware Encoder Detection ==========

PROC = None
LOCK = threading.Lock()
LAST_HIT = 0.0
LAST_CLIENT_DISCONNECT = 0.0  # Track when last client disconnected
MODE = "idle"  # "idle", "black", or "live"
CUR_IN1 = None
CUR_IN2 = None
CUR_AUDIO_MODE = 0  # Audio mode used for current stream (legacy)
# New layout system globals
CUR_LAYOUT = None  # Current layout type
CUR_INPUTS = []  # List of input URLs in slot order
CUR_AUDIO_INDEX = 0  # Index of input providing audio
CUR_CUSTOM_SLOTS = None  # For custom layouts, list of slot definitions

# Channel storage (in-memory)
CHANNELS = []
CHANNELS_LOCK = threading.Lock()

# Current layout configuration
CURRENT_LAYOUT = None
CURRENT_LAYOUT_LOCK = threading.Lock()

# Last layout configuration (persists through idle mode for cold start)
LAST_LAYOUT = None
LAST_LAYOUT_LOCK = threading.Lock()

# Broadcast system for streaming to multiple clients
BROADCAST_CLIENTS: Set[queue.Queue] = set()
BROADCAST_LOCK = threading.Lock()

# ========== Audio Volume Control with ZeroMQ ==========

class AudioVolumeController:
    """Manages dynamic audio volume control via ZeroMQ sockets."""

    def __init__(self):
        self.context = zmq.Context()
        self.sockets = {}  # stream_index → socket
        self.lock = threading.Lock()

    def create_socket(self, stream_index: int) -> str:
        """Create ZMQ socket for stream, return bind address."""
        with self.lock:
            # Clean up existing socket if any
            if stream_index in self.sockets:
                try:
                    self.sockets[stream_index].close()
                except:
                    pass

            socket = self.context.socket(zmq.REQ)
            address = f"ipc:///tmp/zmq-stream-{stream_index}"
            socket.connect(address)
            socket.setsockopt(zmq.RCVTIMEO, 1000)  # 1 second timeout
            socket.setsockopt(zmq.SNDTIMEO, 1000)
            self.sockets[stream_index] = socket
            return address

    def set_volume(self, stream_index: int, volume: float) -> bool:
        """Send volume command to FFmpeg via ZMQ. Returns True on success."""
        with self.lock:
            if stream_index not in self.sockets:
                print(f"No ZMQ socket for stream {stream_index}")
                return False

            try:
                # Send ZMQ command: "volume <value>"
                command = f"volume {volume}"
                self.sockets[stream_index].send_string(command)
                # Wait for ACK
                response = self.sockets[stream_index].recv_string()
                print(f"Set volume for stream {stream_index} to {volume}: {response}")
                return True
            except zmq.error.Again:
                print(f"ZMQ timeout setting volume for stream {stream_index}")
                return False
            except Exception as e:
                print(f"Error setting volume for stream {stream_index}: {e}")
                return False

    def cleanup(self):
        """Close all sockets."""
        with self.lock:
            for socket in self.sockets.values():
                try:
                    socket.close()
                except:
                    pass
            self.sockets.clear()

# Global audio controller
audio_controller = AudioVolumeController()

# ========== End Audio Volume Control ==========

# Pydantic models for API
class LayoutConfigModel(BaseModel):
    layout: str  # 'pip', 'split_h', 'grid_2x2', 'custom', etc.
    streams: Dict[str, str]  # slotId -> channelId
    audio_source: str  # slotId providing audio
    custom_slots: list = None  # For custom layouts: [{ id, name, x, y, width, height }]
    audio_volumes: Dict[str, float] = None  # slotId -> volume (0.0-1.0), optional

app.mount("/hls", StaticFiles(directory=OUTDIR), name="hls")

@app.middleware("http")
async def touch_last_hit(request: Request, call_next):
    global LAST_HIT
    if request.url.path.startswith("/hls") or request.url.path == "/stream":
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

                    if name == "MultiView":
                        continue

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
    """Return FFmpeg encoder arguments based on detected hardware encoder."""
    return SELECTED_ENCODER_CONFIG['encode_args']

def _output_parts():
    """
    Output MPEG-TS to stdout for broadcasting to multiple HTTP clients.
    This mimics HDHomeRun behavior - each client starts at the live point.
    """
    return [
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-fflags", "+genpts",
        "-flags", "low_delay",
        "-f", "mpegts",
        "-mpegts_copyts", "0",
        "pipe:1"  # Output to stdout
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
    # Legacy function for backward compatibility - delegates to build_layout_cmd
    return build_layout_cmd('pip', [in1, in2], audio_mode)

def build_audio_filter(num_streams: int, audio_volumes: dict = None) -> str:
    """
    Build audio filter with volume controls for each stream.

    Args:
        num_streams: Number of audio streams
        audio_volumes: Dict mapping stream index to volume (0.0-1.0). If None, all default to 1.0

    Returns:
        Audio filter_complex string
    """
    if num_streams == 0:
        return ""

    if audio_volumes is None:
        audio_volumes = {}

    audio_parts = []

    # Create volume filter for each audio stream
    for i in range(num_streams):
        volume = audio_volumes.get(i, 1.0)

        # Format audio and apply volume
        audio_filter = (
            f"[{i}:a]"
            f"aformat=sample_rates=48000:channel_layouts=stereo,"
            f"volume={volume}"
            f"[a{i}]"
        )
        audio_parts.append(audio_filter)

    # Mix all audio streams if multiple, otherwise just use the single stream
    if num_streams > 1:
        inputs = ''.join(f"[a{i}]" for i in range(num_streams))
        mix_filter = f"{inputs}amix=inputs={num_streams}:duration=longest:normalize=0[aout]"
        audio_parts.append(mix_filter)
    else:
        # Single stream, just pass through
        audio_parts.append("[a0]anull[aout]")

    return ";".join(audio_parts)

def build_layout_cmd(layout: str, input_urls: list, audio_index: int, custom_slots: list = None, audio_volumes: dict = None):
    """
    Build FFmpeg command for any layout type.

    Args:
        layout: Layout type ('pip', 'split_h', 'split_v', 'grid_2x2', 'multi_pip_2', 'multi_pip_3', 'multi_pip_4', 'custom')
        input_urls: List of input stream URLs (in slot order)
        audio_index: Index of input to use for audio (0-based) - DEPRECATED, kept for compatibility
        custom_slots: For custom layouts, list of slot definitions with x, y, width, height
        audio_volumes: Dict mapping stream index to volume (0.0-1.0)
    """
    # Build video filter_complex based on layout
    if layout == 'pip':
        video_fc = build_pip_filter(input_urls)
    elif layout == 'dvd_pip':
        video_fc = build_dvd_pip_filter(input_urls)
    elif layout == 'split_h':
        video_fc = build_split_h_filter(input_urls)
    elif layout == 'split_v':
        video_fc = build_split_v_filter(input_urls)
    elif layout == 'grid_2x2':
        video_fc = build_grid_2x2_filter(input_urls)
    elif layout == 'multi_pip_2':
        video_fc = build_multi_pip_2_filter(input_urls)
    elif layout == 'multi_pip_3':
        video_fc = build_multi_pip_3_filter(input_urls)
    elif layout == 'multi_pip_4':
        video_fc = build_multi_pip_4_filter(input_urls)
    elif layout == 'custom':
        if not custom_slots:
            raise ValueError("Custom layout requires slot definitions")
        video_fc = build_custom_layout_filter(custom_slots)
    else:
        raise ValueError(f"Unknown layout type: {layout}")

    # Build audio filter with ZeroMQ controls
    audio_fc = build_audio_filter(len(input_urls), audio_volumes)

    # Combine video and audio filters
    fc = f"{video_fc};{audio_fc}"

    # Map both video and audio outputs
    amap = ["-map", "[v]", "-map", "[aout]"]

    # Build ffmpeg command with all inputs
    cmd = ["ffmpeg", "-loglevel", "warning", "-hide_banner", "-nostdin"]

    # Add each input with reconnection options
    for url in input_urls:
        cmd += [
            "-thread_queue_size", "1024", "-user_agent", DEFAULT_UA,
        ]
        if SOURCE_HEADERS.strip():
            cmd += ["-headers", _headers_value()]
        cmd += [
            "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1",
            "-rw_timeout", "15000000", "-timeout", "15000000",
            "-i", url,
        ]

    # Add filter_complex and audio mapping
    cmd += ["-filter_complex", fc]
    cmd += amap + _gpu_or_cpu_parts() + _output_parts()

    return cmd

def build_pip_filter(inputs: list) -> str:
    """Picture-in-Picture: 1 main + 1 inset"""
    return (
        "[0:v]fps=30,scale=1920:-2:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];"
        f"[1:v]scale={INSET_SCALE}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={INSET_SCALE+16}:376:8:8:color=white[pip];"
        f"[base][pip]overlay=W-w-{INSET_MARGIN}:H-h-{INSET_MARGIN}:shortest=1[v]"
    )

def build_dvd_pip_filter(inputs: list) -> str:
    """DVD Screensaver PiP: 1 main + 1 bouncing inset (just like the DVD logo!)"""
    margin = 10
    # Triangle wave expressions for smooth bouncing
    # x bounces horizontally at 100 pixels/second
    # y bounces vertically at 75 pixels/second (different speed for diagonal effect)
    x_expr = f"abs(mod(t*100, 2*(W-w-{margin})) - (W-w-{margin}))"
    y_expr = f"abs(mod(t*75, 2*(H-h-{margin})) - (H-h-{margin}))"

    return (
        "[0:v]fps=30,scale=1920:-2:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];"
        f"[1:v]scale={INSET_SCALE}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={INSET_SCALE+16}:376:8:8:color=white[pip];"
        f"[base][pip]overlay=x='{x_expr}':y='{y_expr}':shortest=1[v]"
    )

def build_split_h_filter(inputs: list) -> str:
    """Split Horizontal: 2 streams side-by-side"""
    return (
        "[0:v]fps=30,scale=960:-2:force_original_aspect_ratio=decrease,"
        "pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[left];"
        "[1:v]fps=30,scale=960:-2:force_original_aspect_ratio=decrease,"
        "pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[right];"
        "[left][right]hstack=inputs=2:shortest=0[v]"
    )

def build_split_v_filter(inputs: list) -> str:
    """Split Vertical: 2 streams stacked"""
    return (
        "[0:v]fps=30,scale=1920:540:force_original_aspect_ratio=decrease,"
        "pad=1920:540:(ow-iw)/2:(oh-ih)/2,setsar=1[top];"
        "[1:v]fps=30,scale=1920:540:force_original_aspect_ratio=decrease,"
        "pad=1920:540:(ow-iw)/2:(oh-ih)/2,setsar=1[bottom];"
        "[top][bottom]vstack=inputs=2:shortest=0[v]"
    )

def build_grid_2x2_filter(inputs: list) -> str:
    """2x2 Grid: 4 equal streams"""
    return (
        "[0:v]fps=30,scale=960:540:force_original_aspect_ratio=decrease,"
        "pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[s0];"
        "[1:v]fps=30,scale=960:540:force_original_aspect_ratio=decrease,"
        "pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[s1];"
        "[2:v]fps=30,scale=960:540:force_original_aspect_ratio=decrease,"
        "pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[s2];"
        "[3:v]fps=30,scale=960:540:force_original_aspect_ratio=decrease,"
        "pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[s3];"
        "[s0][s1]hstack=inputs=2:shortest=0[top];"
        "[s2][s3]hstack=inputs=2:shortest=0[bottom];"
        "[top][bottom]vstack=inputs=2:shortest=0[v]"
    )

def build_multi_pip_2_filter(inputs: list) -> str:
    """Multi-PiP (2): 1 main + 2 small insets"""
    inset_w = 480
    inset_h = 270
    margin = 20
    return (
        "[0:v]fps=30,scale=1920:-2:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];"
        f"[1:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip1];"
        f"[2:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip2];"
        f"[base][pip1]overlay=W-w-{margin}:H-h-{margin}:shortest=0[tmp];"
        f"[tmp][pip2]overlay=W-w-{margin}:H-h-{margin}-{inset_h+8+10}:shortest=0[v]"
    )

def build_multi_pip_3_filter(inputs: list) -> str:
    """Multi-PiP (3): 1 main + 3 small insets"""
    inset_w = 384
    inset_h = 216
    margin = 20
    gap = 10
    return (
        "[0:v]fps=30,scale=1920:-2:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];"
        f"[1:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip1];"
        f"[2:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip2];"
        f"[3:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip3];"
        f"[base][pip1]overlay=W-w-{margin}:H-h-{margin}:shortest=0[tmp1];"
        f"[tmp1][pip2]overlay=W-w-{margin}:H-h-{margin}-{inset_h+8+gap}:shortest=0[tmp2];"
        f"[tmp2][pip3]overlay=W-w-{margin}:H-h-{margin}-2*({inset_h+8+gap}):shortest=0[v]"
    )

def build_multi_pip_4_filter(inputs: list) -> str:
    """Multi-PiP (4): 1 main + 4 small insets"""
    inset_w = 384
    inset_h = 216
    margin = 20
    gap = 10
    return (
        "[0:v]fps=30,scale=1920:-2:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];"
        f"[1:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip1];"
        f"[2:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip2];"
        f"[3:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip3];"
        f"[4:v]fps=30,scale={inset_w}:-2:force_original_aspect_ratio=decrease,setsar=1,"
        f"pad={inset_w+8}:{inset_h+8}:4:4:color=white[pip4];"
        f"[base][pip1]overlay=W-w-{margin}:H-h-{margin}:shortest=0[tmp1];"
        f"[tmp1][pip2]overlay=W-w-{margin}:H-h-{margin}-{inset_h+8+gap}:shortest=0[tmp2];"
        f"[tmp2][pip3]overlay=W-w-{margin}:{margin}:shortest=0[tmp3];"
        f"[tmp3][pip4]overlay=W-w-{margin}:{margin}+{inset_h+8+gap}:shortest=0[v]"
    )

def build_custom_layout_filter(slots: list) -> str:
    """
    Custom Layout: User-defined slot positions and sizes.

    Args:
        slots: List of dicts with keys: x, y, width, height, border (all in pixels, border is boolean)

    Returns:
        FFmpeg filter_complex string
    """
    if not slots or len(slots) > 5:
        raise ValueError("Custom layout must have 1-5 slots")

    # Sort slots by size (largest first) for z-ordering
    sorted_slots = sorted(slots, key=lambda s: s['width'] * s['height'], reverse=True)

    # Build filter string
    parts = []

    # Scale each input to its slot dimensions
    for i, slot in enumerate(sorted_slots):
        w = slot['width']
        h = slot['height']
        has_border = slot.get('border', False)

        # Base scale and pad to ensure content fits
        filter_chain = f"[{i}:v]fps=30,scale={w}:{h}:force_original_aspect_ratio=decrease," \
                      f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1"

        # Add white border if enabled (8px on all sides)
        if has_border:
            border_width = w + 16  # 8px on each side
            border_height = h + 16
            filter_chain += f",pad={border_width}:{border_height}:8:8:color=white"

        filter_chain += f"[s{i}]"
        parts.append(filter_chain)

    # Create black 1920x1080 base
    parts.append("color=c=black:s=1920x1080:r=30[base]")

    # Chain overlays
    prev_label = "base"
    for i, slot in enumerate(sorted_slots):
        x = slot['x']
        y = slot['y']
        has_border = slot.get('border', False)

        # Adjust position if border is enabled (offset by -8px to account for border)
        if has_border:
            x = max(0, x - 8)
            y = max(0, y - 8)

        if i == len(sorted_slots) - 1:
            # Last overlay outputs to [v]
            parts.append(f"[{prev_label}][s{i}]overlay={x}:{y}:shortest=0[v]")
        else:
            # Intermediate overlays
            parts.append(f"[{prev_label}][s{i}]overlay={x}:{y}:shortest=0[tmp{i}]")
            prev_label = f"tmp{i}"

    return ";".join(parts)

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

def stop_to_idle():
    """Stop FFmpeg completely and enter idle mode (zero GPU usage)."""
    global PROC, MODE, CUR_IN1, CUR_IN2, CUR_AUDIO_MODE, LAST_HIT, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, CURRENT_LAYOUT, LAST_LAYOUT

    # Save current layout to LAST_LAYOUT before clearing (for cold start)
    with CURRENT_LAYOUT_LOCK:
        if CURRENT_LAYOUT:
            with LAST_LAYOUT_LOCK:
                LAST_LAYOUT = CURRENT_LAYOUT.copy()
                print(f"Saved layout '{LAST_LAYOUT.get('layout')}' for cold start")

    with LOCK:
        stop_ffmpeg()
        clean_outdir()
        MODE = "idle"
        # Don't clear layout globals - keep them for cold start via LAST_LAYOUT
        # CUR_LAYOUT, CUR_INPUTS, etc. stay populated for restart_last_layout()
        # Legacy vars cleared
        CUR_IN1 = CUR_IN2 = None
        CUR_AUDIO_MODE = 0
        LAST_HIT = time.time()

    # Clear current layout state (but LAST_LAYOUT persists)
    with CURRENT_LAYOUT_LOCK:
        CURRENT_LAYOUT = None

    print(f"Entered idle mode (no FFmpeg process, layout saved for cold start)")

def start_black():
    """Legacy black screen mode - kept for compatibility."""
    global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2, CUR_AUDIO_MODE, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, CURRENT_LAYOUT
    with LOCK:
        stop_ffmpeg()
        clean_outdir()
        # Capture stdout for broadcasting to HTTP clients
        PROC = subprocess.Popen(
            build_black_cmd(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0
        )
        MODE = "black"
        CUR_IN1 = CUR_IN2 = None
        CUR_AUDIO_MODE = 0
        CUR_LAYOUT = None
        CUR_INPUTS = []
        CUR_AUDIO_INDEX = 0
        CUR_CUSTOM_SLOTS = None
        LAST_HIT = time.time()
    # Clear current layout when stopping
    with CURRENT_LAYOUT_LOCK:
        CURRENT_LAYOUT = None

def start_live(in1: str, in2: str):
    global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2
    with LOCK:
        stop_ffmpeg()
        clean_outdir()
        # Capture stdout for broadcasting to HTTP clients
        PROC = subprocess.Popen(
            build_live_cmd(in1, in2, AUDIO_SOURCE),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0
        )
        MODE = "live"
        CUR_IN1, CUR_IN2 = in1, in2
        LAST_HIT = time.time()

def get_expected_slots_for_layout(layout: str) -> list:
    """Return the expected slot IDs for a given layout type."""
    LAYOUT_SLOTS = {
        'pip': ['main', 'inset'],
        'dvd_pip': ['main', 'inset'],
        'split_h': ['left', 'right'],
        'split_v': ['top', 'bottom'],
        'grid_2x2': ['slot1', 'slot2', 'slot3', 'slot4'],
        'multi_pip_2': ['main', 'inset1', 'inset2'],
        'multi_pip_3': ['main', 'inset1', 'inset2', 'inset3'],
        'multi_pip_4': ['main', 'inset1', 'inset2', 'inset3', 'inset4'],
    }
    return LAYOUT_SLOTS.get(layout, [])

def ensure_running():
    """Legacy: ensure FFmpeg is running - now starts in idle mode instead."""
    # No longer auto-starts black screen
    # Streams start on-demand when /stream is accessed
    pass

def restart_last_layout():
    """Restart FFmpeg with the last known layout configuration."""
    global PROC, MODE, LAST_HIT, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_IN1, CUR_IN2, CUR_AUDIO_MODE, CUR_CUSTOM_SLOTS

    if not CUR_LAYOUT or not CUR_INPUTS:
        print("Cannot restart: no layout configured")
        return False

    # Get audio_volumes from current layout
    with CURRENT_LAYOUT_LOCK:
        audio_volumes = CURRENT_LAYOUT.get("audio_volumes", {}) if CURRENT_LAYOUT else {}

    # Convert slot-based volumes to index-based volumes
    audio_volumes_by_index = {}
    if audio_volumes and CURRENT_LAYOUT:
        # Get expected slots - handle custom layouts
        if CUR_LAYOUT == 'custom' and CUR_CUSTOM_SLOTS:
            sorted_slots = sorted(CUR_CUSTOM_SLOTS, key=lambda s: s['width'] * s['height'], reverse=True)
            expected_slots = [slot['id'] for slot in sorted_slots]
        else:
            expected_slots = get_expected_slots_for_layout(CUR_LAYOUT)

        for slot_id, channel_id in CURRENT_LAYOUT.get("streams", {}).items():
            if slot_id in audio_volumes and slot_id in expected_slots:
                index = expected_slots.index(slot_id)
                audio_volumes_by_index[index] = audio_volumes[slot_id]

    try:
        with LOCK:
            stop_ffmpeg()
            clean_outdir()

            PROC = subprocess.Popen(
                build_layout_cmd(CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, audio_volumes_by_index),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0
            )
            MODE = "live"
            # Update legacy vars for backward compatibility
            if len(CUR_INPUTS) >= 2:
                CUR_IN1, CUR_IN2 = CUR_INPUTS[0], CUR_INPUTS[1]
                CUR_AUDIO_MODE = CUR_AUDIO_INDEX if CUR_AUDIO_INDEX in [0, 1] else 0
            LAST_HIT = time.time()

        print(f"Restarted layout '{CUR_LAYOUT}' with {len(CUR_INPUTS)} streams")
        return True
    except Exception as e:
        print(f"Failed to restart layout: {e}")
        return False

def restart_current_stream():
    """Restart FFmpeg with the same settings to prevent file size growth."""
    global MODE, CUR_IN1, CUR_IN2, CUR_AUDIO_MODE, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, PROC, LAST_HIT
    if MODE == "black":
        start_black()
    elif MODE == "live":
        # Use new layout system if available, otherwise fall back to legacy
        if CUR_LAYOUT and CUR_INPUTS:
            # Get audio_volumes from current layout
            with CURRENT_LAYOUT_LOCK:
                audio_volumes = CURRENT_LAYOUT.get("audio_volumes", {}) if CURRENT_LAYOUT else {}

            # Convert slot-based volumes to index-based volumes
            audio_volumes_by_index = {}
            if audio_volumes and CURRENT_LAYOUT:
                # Get expected slots - handle custom layouts
                if CUR_LAYOUT == 'custom' and CUR_CUSTOM_SLOTS:
                    sorted_slots = sorted(CUR_CUSTOM_SLOTS, key=lambda s: s['width'] * s['height'], reverse=True)
                    expected_slots = [slot['id'] for slot in sorted_slots]
                else:
                    expected_slots = get_expected_slots_for_layout(CUR_LAYOUT)

                for slot_id, channel_id in CURRENT_LAYOUT.get("streams", {}).items():
                    if slot_id in audio_volumes and slot_id in expected_slots:
                        index = expected_slots.index(slot_id)
                        audio_volumes_by_index[index] = audio_volumes[slot_id]

            with LOCK:
                stop_ffmpeg()
                clean_outdir()

                PROC = subprocess.Popen(
                    build_layout_cmd(CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, audio_volumes_by_index),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0
                )
                MODE = "live"
                LAST_HIT = time.time()
        elif CUR_IN1 and CUR_IN2:
            # Legacy restart
            with LOCK:
                stop_ffmpeg()
                clean_outdir()

                PROC = subprocess.Popen(
                    build_live_cmd(CUR_IN1, CUR_IN2, CUR_AUDIO_MODE),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0
                )
                MODE = "live"
                LAST_HIT = time.time()

def idle_watchdog():
    global MODE, LAST_CLIENT_DISCONNECT
    while True:
        time.sleep(5)

        # Get current client count
        with BROADCAST_LOCK:
            client_count = len(BROADCAST_CLIENTS)

        # Track when last client disconnected
        if client_count == 0 and MODE == "live":
            if LAST_CLIENT_DISCONNECT == 0:
                LAST_CLIENT_DISCONNECT = time.time()
            elif time.time() - LAST_CLIENT_DISCONNECT > IDLE_TIMEOUT:
                print(f"No clients for {IDLE_TIMEOUT}s, entering idle mode")
                stop_to_idle()
                LAST_CLIENT_DISCONNECT = 0
        else:
            LAST_CLIENT_DISCONNECT = 0  # Reset when clients are connected

        # Note: HLS segments auto-delete old content, no file size monitoring needed

def broadcast_reader():
    """
    Background task that reads from FFmpeg stdout and broadcasts to all connected clients.
    Runs in a separate thread.
    """
    global PROC, BROADCAST_CLIENTS

    while True:
        if PROC and PROC.stdout and PROC.poll() is None:
            try:
                # Read chunk from FFmpeg stdout
                # MPEG-TS packets are 188 bytes, read multiples for efficiency
                chunk = PROC.stdout.read(188 * 20)  # 3760 bytes

                if chunk:
                    # Broadcast to all connected clients
                    with BROADCAST_LOCK:
                        dead_clients = []
                        for client_queue in BROADCAST_CLIENTS.copy():
                            try:
                                # Non-blocking put with size limit to prevent memory issues
                                if client_queue.qsize() < 100:  # Max 100 chunks buffered
                                    client_queue.put_nowait(chunk)
                                else:
                                    # Client is too slow, disconnect them
                                    dead_clients.append(client_queue)
                            except queue.Full:
                                dead_clients.append(client_queue)
                            except Exception as e:
                                print(f"Error broadcasting to client: {e}")
                                dead_clients.append(client_queue)

                        # Remove dead clients
                        for dead in dead_clients:
                            BROADCAST_CLIENTS.discard(dead)
                else:
                    # No data, wait a bit
                    time.sleep(0.01)
            except Exception as e:
                print(f"Broadcast reader error: {e}")
                time.sleep(0.1)
        else:
            # No active process, wait
            time.sleep(0.5)

threading.Thread(target=idle_watchdog, daemon=True).start()
threading.Thread(target=broadcast_reader, daemon=True).start()

@app.on_event("startup")
def boot():
    load_channels()  # Load channels on startup
    # Start in idle mode (no FFmpeg process until first client connects)

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
    stop_to_idle()
    return {"status":"idle"}

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

    # Get connected client count
    with BROADCAST_LOCK:
        client_count = len(BROADCAST_CLIENTS)

    # Calculate time until idle timeout
    time_since_hit = time.time() - LAST_HIT
    time_until_timeout = max(0, IDLE_TIMEOUT - time_since_hit)

    # Get current layout
    with CURRENT_LAYOUT_LOCK:
        current_layout = CURRENT_LAYOUT.copy() if CURRENT_LAYOUT else None

    # Get last layout (for cold start info)
    with LAST_LAYOUT_LOCK:
        last_layout = LAST_LAYOUT.copy() if LAST_LAYOUT else None

    return {
        "proc_running": running,
        "mode": MODE,
        "in1": CUR_IN1,
        "in2": CUR_IN2,
        "idle_timeout_sec": IDLE_TIMEOUT,
        "last_hit_epoch": LAST_HIT,
        "time_until_idle": int(time_until_timeout),
        "connected_clients": client_count,
        "current_layout": current_layout,
        "last_layout": last_layout,  # Layout that will be restored on cold start
        "encoder": {
            "type": SELECTED_ENCODER,
            "name": SELECTED_ENCODER_CONFIG['name'],
            "codec": SELECTED_ENCODER_CONFIG['codec'],
            "preference": ENCODER_PREFERENCE
        },
        "stream_url": f"http://localhost:{port}/stream",
    }

@app.get("/stream")
async def stream():
    """
    HDHomeRun-style MPEG-TS streaming.
    Each client starts receiving from the current live point.
    Multiple clients can connect simultaneously.
    """
    global LAST_HIT, BROADCAST_CLIENTS, MODE, LAST_LAYOUT, CURRENT_LAYOUT, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, PROC
    LAST_HIT = time.time()

    # Start FFmpeg on-demand if in idle mode (cold start)
    # Use LOCK to prevent race conditions with multiple simultaneous stream requests
    should_start = False
    with LOCK:
        if MODE == "idle":
            should_start = True
            MODE = "starting"  # Prevent other requests from starting simultaneously

    if should_start:
        try:
            # Copy LAST_LAYOUT outside of lock to avoid deadlock
            saved_layout = None
            with LAST_LAYOUT_LOCK:
                if LAST_LAYOUT:
                    saved_layout = LAST_LAYOUT.copy()

            if not saved_layout:
                with LOCK:
                    MODE = "idle"  # Reset mode
                raise HTTPException(status_code=503, detail="No saved layout available for cold start")

            print(f"Client connected while idle, restoring layout '{saved_layout.get('layout')}'...")

            # Restore layout state from saved copy
            with CURRENT_LAYOUT_LOCK:
                CURRENT_LAYOUT = saved_layout.copy()

            # Extract layout parameters for restart
            layout_type = saved_layout.get("layout")
            streams = saved_layout.get("streams", {})
            audio_volumes = saved_layout.get("audio_volumes", {})
            custom_slots = saved_layout.get("custom_slots")

            # Build input URLs in correct order
            if layout_type == 'custom' and custom_slots:
                sorted_slots = sorted(custom_slots, key=lambda s: s['width'] * s['height'], reverse=True)
                expected_slots = [slot['id'] for slot in sorted_slots]
            else:
                expected_slots = get_expected_slots_for_layout(layout_type)

            # Get channel URLs
            input_urls = []
            for slot_id in expected_slots:
                channel_id = streams.get(slot_id)
                if channel_id:
                    channel = get_channel_by_id(channel_id)
                    if channel:
                        input_urls.append(channel['url'])

            if not input_urls:
                with LOCK:
                    MODE = "idle"
                raise HTTPException(status_code=503, detail="No valid channel URLs found")

            # Find audio index
            audio_source = saved_layout.get("audio_source")
            audio_index = expected_slots.index(audio_source) if audio_source in expected_slots else 0

            # Convert slot-based audio volumes to index-based
            audio_volumes_by_index = {}
            for slot_id, volume in audio_volumes.items():
                if slot_id in expected_slots:
                    idx = expected_slots.index(slot_id)
                    audio_volumes_by_index[idx] = volume

            # Build custom slots for ffmpeg if needed
            custom_slots_for_ffmpeg = None
            if layout_type == 'custom' and custom_slots:
                custom_slots_for_ffmpeg = sorted(custom_slots, key=lambda s: s['width'] * s['height'], reverse=True)

            # Start FFmpeg directly (don't use restart_last_layout to avoid complexity)
            with LOCK:
                stop_ffmpeg()
                clean_outdir()

                PROC = subprocess.Popen(
                    build_layout_cmd(layout_type, input_urls, audio_index, custom_slots_for_ffmpeg, audio_volumes_by_index),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0
                )
                MODE = "live"
                CUR_LAYOUT = layout_type
                CUR_INPUTS = input_urls
                CUR_AUDIO_INDEX = audio_index
                CUR_CUSTOM_SLOTS = custom_slots_for_ffmpeg
                LAST_HIT = time.time()

            print(f"Cold start successful: layout '{layout_type}' with {len(input_urls)} streams")

            # Wait for FFmpeg to stabilize and start producing MPEG-TS output
            # Streams need time to connect, buffer, and begin encoding
            await asyncio.sleep(5)

            # Check if FFmpeg is still running
            if not PROC or PROC.poll() is not None:
                with LOCK:
                    MODE = "idle"
                raise HTTPException(status_code=503, detail="FFmpeg process died during cold start")

        except Exception as e:
            import traceback
            traceback.print_exc()
            with LOCK:
                MODE = "idle"
            raise HTTPException(status_code=503, detail=f"Cold start failed: {str(e)}")

    # Create a queue for this client (threading.Queue, not asyncio)
    client_queue = queue.Queue(maxsize=100)

    # Register this client with the broadcaster
    with BROADCAST_LOCK:
        BROADCAST_CLIENTS.add(client_queue)

    async def generate():
        global LAST_HIT, PROC
        try:
            while True:
                # Wait for data from the broadcaster (blocking with timeout)
                try:
                    # Use run_in_executor to make blocking queue.get() non-blocking for asyncio
                    loop = asyncio.get_event_loop()
                    chunk = await loop.run_in_executor(
                        None,
                        lambda: client_queue.get(timeout=1.0)
                    )
                    # Update LAST_HIT to prevent idle timeout while client is actively streaming
                    LAST_HIT = time.time()
                    yield chunk
                except queue.Empty:
                    # No data for 1 second, check if process is still alive
                    if not PROC or PROC.poll() is not None:
                        break
                    continue
        except Exception as e:
            print(f"Client stream error: {e}")
        finally:
            # Unregister this client
            with BROADCAST_LOCK:
                BROADCAST_CLIENTS.discard(client_queue)

    return StreamingResponse(
        generate(),
        media_type="video/mp2t",
        headers={
            "Content-Type": "video/mp2t",
            "Cache-Control": "no-cache, no-store, must-revalidate",
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

@app.get("/api/proxy-image")
async def proxy_image(url: str):
    """
    Proxy channel icons from internal Docker networks to the frontend.
    This allows browser clients to access images at host.docker.internal URLs.
    """
    try:
        # Fetch the image from the internal URL
        req = UrlRequest(url, headers={'User-Agent': DEFAULT_UA})
        with urlopen(req, timeout=5) as response:
            image_data = response.read()
            content_type = response.headers.get('Content-Type', 'image/jpeg')

        return Response(content=image_data, media_type=content_type)
    except Exception as e:
        print(f"Error proxying image {url}: {e}")
        raise HTTPException(status_code=404, detail="Image not found")

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

    Supports all layout types: pip, split_h, split_v, grid_2x2, multi_pip_2, multi_pip_3, multi_pip_4, custom

    Expects:
    - layout: Layout type string
    - streams: { slotId: channelId } mapping
    - audio_source: slotId providing audio
    - custom_slots: (for custom layouts) list of slot definitions
    """
    global CURRENT_LAYOUT, PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2, CUR_AUDIO_MODE, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS

    # Define slot order for each layout type (must match filter builders)
    LAYOUT_SLOTS = {
        'pip': ['main', 'inset'],
        'dvd_pip': ['main', 'inset'],
        'split_h': ['left', 'right'],
        'split_v': ['top', 'bottom'],
        'grid_2x2': ['slot1', 'slot2', 'slot3', 'slot4'],
        'multi_pip_2': ['main', 'inset1', 'inset2'],
        'multi_pip_3': ['main', 'inset1', 'inset2', 'inset3'],
        'multi_pip_4': ['main', 'inset1', 'inset2', 'inset3', 'inset4'],
    }

    # Handle custom layouts
    if config.layout == 'custom':
        if not config.custom_slots:
            raise HTTPException(status_code=400, detail="Custom layout requires custom_slots")

        # Validate custom slots
        if len(config.custom_slots) < 1 or len(config.custom_slots) > 5:
            raise HTTPException(status_code=400, detail="Custom layout must have 1-5 slots")

        # Extract slot IDs from custom_slots
        expected_slots = [slot['id'] for slot in config.custom_slots]

        # Validate all required slots are assigned
        for slot_id in expected_slots:
            if slot_id not in config.streams:
                raise HTTPException(status_code=400, detail=f"Custom layout requires slot '{slot_id}' to be assigned.")

        # Validate audio_source is a valid slot
        if config.audio_source not in expected_slots:
            raise HTTPException(status_code=400, detail=f"Invalid audio_source: {config.audio_source}. Must be one of {expected_slots}.")

        # Look up channel URLs in slot order (sorted by size for z-ordering)
        sorted_slots = sorted(config.custom_slots, key=lambda s: s['width'] * s['height'], reverse=True)
        sorted_slot_ids = [slot['id'] for slot in sorted_slots]

        input_urls = []
        channel_names = []
        for slot_id in sorted_slot_ids:
            channel_id = config.streams[slot_id]
            channel = get_channel_by_id(channel_id)
            if not channel:
                raise HTTPException(status_code=404, detail=f"Channel not found: {channel_id}")
            input_urls.append(channel['url'])
            channel_names.append(channel['name'])

        # Find audio index from audio_source slot (in sorted order)
        audio_index = sorted_slot_ids.index(config.audio_source)

        # Prepare custom slots for FFmpeg (sorted by size)
        custom_slots_for_ffmpeg = sorted_slots

    else:
        # Validate layout type
        if config.layout not in LAYOUT_SLOTS:
            raise HTTPException(status_code=400, detail=f"Unknown layout type: {config.layout}")

        expected_slots = LAYOUT_SLOTS[config.layout]

        # Validate all required slots are assigned
        for slot in expected_slots:
            if slot not in config.streams:
                raise HTTPException(status_code=400, detail=f"Layout '{config.layout}' requires slot '{slot}' to be assigned.")

        # Validate audio_source is a valid slot
        if config.audio_source not in expected_slots:
            raise HTTPException(status_code=400, detail=f"Invalid audio_source: {config.audio_source}. Must be one of {expected_slots}.")

        # Look up channel URLs in slot order
        input_urls = []
        channel_names = []
        for slot in expected_slots:
            channel_id = config.streams[slot]
            channel = get_channel_by_id(channel_id)
            if not channel:
                raise HTTPException(status_code=404, detail=f"Channel not found: {channel_id}")
            input_urls.append(channel['url'])
            channel_names.append(channel['name'])

        # Find audio index from audio_source slot
        audio_index = expected_slots.index(config.audio_source)

        custom_slots_for_ffmpeg = None

    # Convert slot-based audio_volumes to index-based volumes
    audio_volumes_by_index = {}
    if config.audio_volumes:
        for slot_id, volume in config.audio_volumes.items():
            if slot_id in expected_slots:
                index = expected_slots.index(slot_id)
                audio_volumes_by_index[index] = volume

    # Initialize default volumes for slots without explicit volumes
    # First slot gets 1.0, others get 0.0 if not specified
    for i, slot_id in enumerate(expected_slots):
        if i not in audio_volumes_by_index:
            # First slot defaults to 1.0 (100%), all others to 0.0 (muted)
            if i == 0:
                audio_volumes_by_index[i] = 1.0
            else:
                audio_volumes_by_index[i] = 0.0

    # Start the stream - optimistic restart for speed
    try:
        with LOCK:
            # Start new process first
            new_proc = subprocess.Popen(
                build_layout_cmd(config.layout, input_urls, audio_index, custom_slots_for_ffmpeg, audio_volumes_by_index),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0
            )

            # Kill old process immediately (no graceful wait, no cleanup)
            old_proc = PROC
            if old_proc and old_proc.poll() is None:
                try:
                    old_proc.kill()
                except:
                    pass

            # Swap to new process
            PROC = new_proc
            MODE = "live"
            # Update new layout globals
            CUR_LAYOUT = config.layout
            CUR_INPUTS = input_urls
            CUR_AUDIO_INDEX = audio_index
            CUR_CUSTOM_SLOTS = custom_slots_for_ffmpeg
            # Update legacy globals for backward compatibility
            if len(input_urls) >= 2:
                CUR_IN1, CUR_IN2 = input_urls[0], input_urls[1]
                CUR_AUDIO_MODE = audio_index if audio_index in [0, 1] else 0
            LAST_HIT = time.time()

        # Store current layout config (with slot-based volumes)
        with CURRENT_LAYOUT_LOCK:
            config_dict = config.dict()
            # Store the converted index-based volumes back as slot-based for consistency
            if not config_dict.get("audio_volumes"):
                config_dict["audio_volumes"] = {}
            for i, volume in audio_volumes_by_index.items():
                if i < len(expected_slots):
                    config_dict["audio_volumes"][expected_slots[i]] = volume
            CURRENT_LAYOUT = config_dict

            # Also save to LAST_LAYOUT for cold start persistence
            with LAST_LAYOUT_LOCK:
                LAST_LAYOUT = config_dict.copy()

        return {
            "status": "success",
            "message": f"Layout '{config.layout}' started with {len(input_urls)} streams",
            "audio_source": config.audio_source,
            "streams": {slot: name for slot, name in zip(expected_slots, channel_names)},
            "audio_volumes": audio_volumes_by_index,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to start layout: {str(e)}")

@app.get("/api/layout/current")
async def get_current_layout():
    """Get current layout configuration."""
    with CURRENT_LAYOUT_LOCK:
        if CURRENT_LAYOUT is None:
            return {"layout": None, "message": "No layout is currently active"}
        return CURRENT_LAYOUT

# ========== Audio Control API ==========

class VolumeControlModel(BaseModel):
    slot_id: str  # Slot ID (e.g., 'main', 'inset', 'left', 'right')
    volume: float  # Volume level (0.0-1.0)

@app.post("/api/audio/volume")
async def set_audio_volume(control: VolumeControlModel):
    """
    Set volume for a specific slot in the current layout.
    Applies change via smart restart (1-2 second interruption).

    Args:
        slot_id: Slot identifier (e.g., 'main', 'inset', 'left', 'right')
        volume: Volume level from 0.0 (mute) to 1.0 (full volume)

    Returns:
        Status and updated volume information
    """
    global MODE, PROC, LAST_HIT, CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS

    # Validate volume range
    if not 0.0 <= control.volume <= 1.0:
        raise HTTPException(status_code=400, detail="Volume must be between 0.0 and 1.0")

    with CURRENT_LAYOUT_LOCK:
        if not CURRENT_LAYOUT:
            raise HTTPException(status_code=400, detail="No layout is currently active")

        layout_type = CURRENT_LAYOUT.get("layout")
        streams = CURRENT_LAYOUT.get("streams", {})

        # Validate slot exists in current layout
        if control.slot_id not in streams:
            raise HTTPException(status_code=404, detail=f"Slot '{control.slot_id}' not found in current layout")

        # Get expected slots for the layout
        if layout_type == 'custom':
            # For custom layouts, get slots from the custom_slots config
            custom_slots = CURRENT_LAYOUT.get("custom_slots", [])
            if custom_slots:
                # Sort by size (same order as used in set_layout)
                sorted_slots = sorted(custom_slots, key=lambda s: s['width'] * s['height'], reverse=True)
                expected_slots = [slot['id'] for slot in sorted_slots]
            else:
                raise HTTPException(status_code=400, detail="Custom layout missing slot definitions")
        else:
            expected_slots = get_expected_slots_for_layout(layout_type)

        if control.slot_id not in expected_slots:
            raise HTTPException(status_code=404, detail=f"Slot '{control.slot_id}' is not valid for layout '{layout_type}'")

        # Update stored volume in layout config
        if "audio_volumes" not in CURRENT_LAYOUT:
            CURRENT_LAYOUT["audio_volumes"] = {}
        CURRENT_LAYOUT["audio_volumes"][control.slot_id] = control.volume

        # Also update LAST_LAYOUT for cold start persistence
        with LAST_LAYOUT_LOCK:
            if LAST_LAYOUT:
                if "audio_volumes" not in LAST_LAYOUT:
                    LAST_LAYOUT["audio_volumes"] = {}
                LAST_LAYOUT["audio_volumes"][control.slot_id] = control.volume

        # Find the stream index for this slot
        stream_index = expected_slots.index(control.slot_id)

    # Convert slot-based volumes to index-based for FFmpeg
    audio_volumes_by_index = {}
    with CURRENT_LAYOUT_LOCK:
        # Get expected slots again (outside the lock we had it, but need it here too)
        layout_type = CURRENT_LAYOUT.get("layout")
        if layout_type == 'custom':
            custom_slots = CURRENT_LAYOUT.get("custom_slots", [])
            if custom_slots:
                sorted_slots = sorted(custom_slots, key=lambda s: s['width'] * s['height'], reverse=True)
                expected_slots_for_index = [slot['id'] for slot in sorted_slots]
            else:
                expected_slots_for_index = expected_slots
        else:
            expected_slots_for_index = expected_slots

        for slot_id, volume in CURRENT_LAYOUT.get("audio_volumes", {}).items():
            if slot_id in expected_slots_for_index:
                idx = expected_slots_for_index.index(slot_id)
                audio_volumes_by_index[idx] = volume

    # Restart FFmpeg with new volumes (smart restart for minimal interruption)
    try:
        with LOCK:
            if MODE != "live" or not CUR_LAYOUT or not CUR_INPUTS:
                return {
                    "status": "success",
                    "slot_id": control.slot_id,
                    "volume": control.volume,
                    "message": "Volume updated in state (stream not active)"
                }

            # Start new process with updated volumes
            new_proc = subprocess.Popen(
                build_layout_cmd(CUR_LAYOUT, CUR_INPUTS, CUR_AUDIO_INDEX, CUR_CUSTOM_SLOTS, audio_volumes_by_index),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0
            )

            # Kill old process immediately
            old_proc = PROC
            if old_proc and old_proc.poll() is None:
                try:
                    old_proc.kill()
                except:
                    pass

            # Swap to new process
            PROC = new_proc
            LAST_HIT = time.time()

        return {
            "status": "success",
            "slot_id": control.slot_id,
            "volume": control.volume,
            "stream_index": stream_index,
            "message": "Volume updated (stream restarted)"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to apply volume change: {str(e)}")

@app.get("/api/audio/volumes")
async def get_audio_volumes():
    """Get current volume levels for all slots in the active layout."""
    with CURRENT_LAYOUT_LOCK:
        if not CURRENT_LAYOUT:
            return {"volumes": {}, "message": "No layout is currently active"}

        return {
            "volumes": CURRENT_LAYOUT.get("audio_volumes", {}),
            "layout": CURRENT_LAYOUT.get("layout"),
            "streams": CURRENT_LAYOUT.get("streams", {}),
        }
