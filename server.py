import os, subprocess, threading, time, signal, pathlib
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from starlette.staticfiles import StaticFiles

app = FastAPI()

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
# ------------------------------------------------

PROC = None
LOCK = threading.Lock()
LAST_HIT = 0.0
MODE = "black"  # "black" or "live"
CUR_IN1 = None
CUR_IN2 = None

app.mount("/hls", StaticFiles(directory=OUTDIR), name="hls")

@app.middleware("http")
async def touch_last_hit(request: Request, call_next):
    global LAST_HIT
    if request.url.path.startswith("/hls"):
        LAST_HIT = time.time()
    return await call_next(request)

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

def _hls_parts():
    return [
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-fflags", "+genpts", "-flags", "low_delay",
        "-f", "hls",
        "-hls_time", HLS_TIME,
        "-hls_list_size", HLS_LIST_SIZE,
        "-hls_flags", "delete_segments+omit_endlist+independent_segments+temp_file",
        "-hls_delete_threshold", HLS_DELETE_THRESHOLD,
        "-hls_segment_filename", f"{OUTDIR}/seg_%05d.ts",
        f"{OUTDIR}/multiview.m3u8",
    ]

def build_black_cmd():
    # Pure black video + silent audio; no text overlay (avoids drawtext dependency)
    cmd = [
        "ffmpeg","-loglevel","warning","-hide_banner","-nostdin",
        "-re","-f","lavfi","-i","color=c=black:s=1920x1080:r=30",
        "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000",
        "-map","0:v","-map","1:a",
    ]
    cmd += _gpu_or_cpu_parts() + _hls_parts()
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
    cmd += amap + _gpu_or_cpu_parts() + _hls_parts()
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
    for p in pathlib.Path(OUTDIR).glob("*"):
        try: p.unlink()
        except: pass

def start_black():
    global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2
    with LOCK:
        stop_ffmpeg()
        clean_outdir()
        PROC = subprocess.Popen(build_black_cmd())
        MODE = "black"
        CUR_IN1 = CUR_IN2 = None
        LAST_HIT = time.time()

def start_live(in1: str, in2: str):
    global PROC, LAST_HIT, MODE, CUR_IN1, CUR_IN2
    with LOCK:
        stop_ffmpeg()
        clean_outdir()
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
    start_black()

@app.get("/")
async def home(in1: str | None = None, in2: str | None = None):
    if in1 and in2:
        start_live(in1, in2)
        return RedirectResponse(url="/hls/multiview.m3u8", status_code=302)
    return PlainTextResponse(
        "Multiview PiP is running.\n\n"
        "Start with:\n"
        "  /control/start?in1=<url>&in2=<url>\n"
        "Stop (to standby):\n"
        "  /control/stop\n\n"
        "Play it:\n"
        "  /hls/multiview.m3u8\n"
    )

@app.get("/control/start")
async def control_start(in1: str, in2: str):
    start_live(in1, in2)
    return JSONResponse({"status":"live","playlist":f"http://localhost:{os.getenv('PORT','9292')}/hls/multiview.m3u8"})

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
    return {
        "proc_running": running,
        "mode": MODE,
        "in1": CUR_IN1, "in2": CUR_IN2,
        "idle_timeout_sec": IDLE_TIMEOUT,
        "last_hit_epoch": LAST_HIT,
    }
