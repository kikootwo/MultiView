# Hardware Encoding Setup for MultiView

This guide covers setting up hardware-accelerated video encoding with NVIDIA, Intel, or AMD hardware.

## Why Hardware Encoding?

Hardware encoders provide significant benefits over CPU-based encoding:
- **Lower CPU usage**: Frees up CPU cores for other tasks
- **Better efficiency**: More efficient encoding at same bitrate
- **Lower latency**: Hardware encoding is faster than software
- **Higher capacity**: Can encode more streams simultaneously

MultiView supports three hardware encoder types:
1. **NVIDIA NVENC** (RTX/GTX 1000+ series) - Up to 8 concurrent sessions on consumer cards
2. **Intel QuickSync** (6th gen+ CPUs with integrated graphics) - Up to 7-10 concurrent sessions
3. **AMD VAAPI** (Radeon RX 400+ GPUs) - Multiple concurrent sessions

Auto-detection will select the best available encoder at startup.

**Universal Docker Image**: The default `Dockerfile` includes ALL hardware encoders:
- ✅ **NVIDIA NVENC** (h264_nvenc) - Requires NVIDIA Container Toolkit + `--gpus` flag
- ✅ **Intel QuickSync** (h264_qsv) - Requires `/dev/dri` access (already in docker-compose.yml)
- ✅ **AMD VAAPI** (h264_vaapi) - Requires `/dev/dri` access (already in docker-compose.yml)
- ✅ **CPU fallback** (libx264) - Always available

**No configuration needed!** The `docker-compose.yml` is already set up to support all encoder types. Just deploy and auto-detection will select the best available encoder.

**Verify which encoder was detected:**

```bash
docker-compose logs backend | grep "Encoder"

# Will show one of:
# Selected Encoder: NVIDIA NVENC (h264_nvenc)
# Selected Encoder: Intel QuickSync (h264_qsv)
# Selected Encoder: AMD VAAPI (h264_vaapi)
# Selected Encoder: CPU (libx264)
```

---

## NVIDIA Setup (NVENC)

### Prerequisites

#### 1. NVIDIA Drivers

Ensure you have NVIDIA drivers installed:

```bash
# Check if drivers are installed
nvidia-smi

# Should show your GPU:
# GPU 0: NVIDIA GeForce RTX 3090
# Driver Version: 535.xx or higher
```

If not installed:
- **Linux**: Install via package manager or NVIDIA's official installer
- **Windows + WSL2**: Install NVIDIA drivers on Windows (WSL2 will use them automatically)

#### 2. NVIDIA Container Toolkit

Docker needs the NVIDIA Container Toolkit to access your GPU.

**Ubuntu/Debian**:

```bash
# Add NVIDIA package repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# Install nvidia-container-toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker
sudo systemctl restart docker
```

**WSL2 (Windows)**:

```bash
# Install nvidia-container-toolkit in WSL2
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker Desktop from Windows
```

#### 3. Verify GPU Access in Docker

Test that Docker can see your GPU:

```bash
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

Should display the RTX 3090 info.

## MultiView Configuration

### Option 1: Docker Compose (Recommended)

Your `docker-compose.yml` is already configured for GPU! Just deploy:

```bash
docker-compose up -d --build
```

The configuration includes:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu, video]
```

### Option 2: Docker Run (Manual)

```bash
docker run -d \
  --name multiview \
  --gpus all \
  --device /dev/dri:/dev/dri \
  --network host \
  -v $(pwd)/out:/out \
  -e ENCODER_PREFERENCE=auto \
  -e M3U_SOURCE=http://host.docker.internal:9191/output/m3u?direct=true \
  multiview-backend
```

## Verify GPU is Being Used

### 1. Check FFmpeg Encoder

Look at the backend logs:

```bash
docker-compose logs backend | grep codec

# Should see:
# Using codec: h264_nvenc (NVIDIA hardware encoder)
```

### 2. Monitor GPU Usage

While streaming, monitor GPU utilization:

```bash
watch -n 1 nvidia-smi

# Look for:
# - GPU Utilization: Should show some % when encoding
# - Encoder Utilization: Shows NVENC usage
# - Memory Usage: Video encoding uses minimal VRAM
```

Example output during 4-stream encoding:
```
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 535.154.05   Driver Version: 535.154.05   CUDA Version: 12.2   |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|                               |                      |               MIG M. |
|===============================+======================+======================|
|   0  NVIDIA GeForce ...  On   | 00000000:01:00.0  On |                  N/A |
| 30%   55C    P2    85W / 350W |    450MiB / 24576MiB |      8%      Default |
|                               |                      |                  N/A |
+-------------------------------+----------------------+----------------------+

# Encoder Utilization: ~15% (shows NVENC is active)
```

### 3. Check Server Status

```bash
curl http://localhost:9292/control/status | jq '.encoder'

# Should show:
# {
#   "type": "nvidia",
#   "name": "NVIDIA NVENC",
#   "codec": "h264_nvenc",
#   "preference": "auto"
# }
```

---

## Intel Setup (QuickSync)

**Note**: The universal Docker image already includes Intel QuickSync support. These instructions help verify your hardware is configured correctly.

### Prerequisites

#### 1. Intel CPU with Integrated Graphics

Intel QuickSync requires a CPU with integrated graphics (6th gen+):
- **Recommended**: 8th gen+ (Coffee Lake or newer)
- **Minimum**: 6th gen (Skylake)

Check if you have integrated graphics:
```bash
lspci | grep VGA

# Should show something like:
# 00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 630
```

#### 2. Verify /dev/dri Exists

Intel QuickSync uses `/dev/dri` devices:

```bash
ls -la /dev/dri

# Should show:
# /dev/dri/renderD128  # Primary render node
# /dev/dri/card0       # Display card
```

If `/dev/dri` doesn't exist, your iGPU might be disabled in BIOS.

### Docker Configuration

The `docker-compose.yml` already includes `/dev/dri` device mapping. No additional configuration needed - auto-detection will find your hardware!

### Verify QuickSync is Being Used

Check startup logs:
```bash
docker-compose logs backend | grep "Encoder"

# Should see:
# Selected Encoder: Intel QuickSync (h264_qsv)
```

Check status endpoint:
```bash
curl http://localhost:9292/control/status | jq '.encoder'

# Should show:
# {
#   "type": "intel",
#   "name": "Intel QuickSync",
#   "codec": "h264_qsv",
#   "preference": "auto"
# }
```

### Force Intel Encoder

If auto-detection isn't selecting Intel, force it:

```yaml
# docker-compose.yml
environment:
  - ENCODER_PREFERENCE=intel
```

---

## AMD Setup (VAAPI)

**Note**: The universal Docker image already includes AMD VAAPI support. These instructions help verify your hardware is configured correctly.

### Prerequisites

#### 1. AMD GPU with VAAPI Support

AMD VAAPI requires a Radeon GPU (RX 400 series or newer):
- **Recommended**: RX 6000 series (RDNA 2)
- **Supported**: RX 400+ (Polaris and newer)

Check if you have an AMD GPU:
```bash
lspci | grep VGA

# Should show something like:
# 01:00.0 VGA compatible controller: Advanced Micro Devices [AMD/ATI] Navi 10
```

#### 2. Verify /dev/dri Exists

AMD VAAPI uses `/dev/dri` devices:

```bash
ls -la /dev/dri

# Should show:
# /dev/dri/renderD128  # Primary render node
# /dev/dri/card0       # Display card
```

#### 3. AMD Drivers

Ensure AMD drivers are installed:
```bash
# Check driver
lsmod | grep amdgpu

# Should show amdgpu module loaded
```

For Ubuntu/Debian, install mesa-va-drivers:
```bash
sudo apt-get install mesa-va-drivers vainfo

# Verify VAAPI:
vainfo

# Should list H.264 encoding profiles
```

### Docker Configuration

The `docker-compose.yml` already includes `/dev/dri` device mapping. No additional configuration needed - auto-detection will find your hardware!

### Verify VAAPI is Being Used

Check startup logs:
```bash
docker-compose logs backend | grep "Encoder"

# Should see:
# Selected Encoder: AMD VAAPI (h264_vaapi)
```

Check status endpoint:
```bash
curl http://localhost:9292/control/status | jq '.encoder'

# Should show:
# {
#   "type": "amd",
#   "name": "AMD VAAPI",
#   "codec": "h264_vaapi",
#   "preference": "auto"
# }
```

### Force AMD Encoder

If auto-detection isn't selecting AMD, force it:

```yaml
# docker-compose.yml
environment:
  - ENCODER_PREFERENCE=amd
```

---

## Performance Comparison

### Hardware vs CPU Encoding (4 streams @ 6Mbps)

| Metric | NVIDIA | Intel QSV | AMD VAAPI | CPU (libx264) |
|--------|---------|-----------|-----------|---------------|
| CPU Usage | ~5-10% | ~10-15% | ~10-15% | ~60-80% |
| Encoding Latency | <50ms | <70ms | <70ms | ~100-200ms |
| Quality | Excellent | Very Good | Very Good | Very Good |
| Max Streams | 8 | 7-10 | 6-8 | 4-5 |
| Power Usage | +50W | +15W | +40W | +100W |

## Encoding Settings

MultiView automatically configures encoder-specific settings in `server.py`. Each encoder has optimized presets:

**NVIDIA NVENC**:
```python
"-c:v", "h264_nvenc",
"-preset", "p5",            # Quality preset (p1-p7)
"-rc", "vbr",              # Variable bitrate
"-spatial_aq", "1",        # Adaptive quantization
```

**Intel QuickSync**:
```python
"-c:v", "h264_qsv",
"-preset", "medium",       # Preset: veryfast, fast, medium, slow
"-look_ahead", "1",        # Enable look-ahead
```

**AMD VAAPI**:
```python
"-c:v", "h264_vaapi",
"-init_hw_device", "vaapi=va:/dev/dri/renderD128",
"-vf", "format=nv12,hwupload",
```

All encoders use:
- **Bitrate**: 6000k target, 6500k max
- **Framerate**: 30fps
- **GOP size**: 60 frames (2 seconds)

To customize settings, edit the `ENCODER_CONFIGS` dictionary in `server.py` (lines 48-95).

## Troubleshooting

### Error: "no CUDA-capable device is detected"

**Cause**: Docker can't access GPU

**Fix**:
```bash
# Check nvidia-smi works on host
nvidia-smi

# Reinstall nvidia-container-toolkit
sudo apt-get install --reinstall nvidia-container-toolkit
sudo systemctl restart docker

# Verify with test
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

### Error: "Cannot load libcuda.so"

**Cause**: NVIDIA drivers not installed or wrong version

**Fix**:
```bash
# Update NVIDIA drivers
sudo ubuntu-drivers autoinstall
sudo reboot
```

### Encoder Not Detected

**Logs show**: `Selected Encoder: CPU (libx264)`

**Cause**: Hardware encoder not accessible or ENCODER_PREFERENCE set to cpu

**Fix**:
```bash
# Check environment variable
docker-compose config | grep ENCODER_PREFERENCE
# Should show: ENCODER_PREFERENCE=auto (or your preferred encoder)

# Check startup logs for detection process
docker-compose logs backend | grep "Encoder"

# Check status endpoint
curl http://localhost:9292/control/status | jq '.encoder'

# Force specific encoder if auto-detection fails
# Edit docker-compose.yml:
environment:
  - ENCODER_PREFERENCE=nvidia  # or intel, amd

# Rebuild
docker-compose down
docker-compose up -d --build
```

### Low GPU utilization

**GPU shows 0-2% usage even when streaming**

**Cause**: NVENC encoding uses dedicated hardware, not main GPU cores

**What to check**:
- Look at "Encoder Utilization" in nvidia-smi (not GPU Utilization)
- Check memory usage (should be 200-500MB when encoding)
- Verify h264_nvenc in logs

This is **normal** - NVENC doesn't use the main CUDA cores much!

### WSL2 Specific Issues

**Error**: "nvidia-smi not found in container"

**Fix**:
```bash
# Make sure Windows NVIDIA drivers are installed
# In Windows, verify with: nvidia-smi in PowerShell

# In WSL2, verify:
ls /usr/lib/wsl/lib/nvidia-smi
```

## Advanced: Multiple GPUs

If you have multiple GPUs, specify which one to use:

**docker-compose.yml**:
```yaml
environment:
  - NVIDIA_VISIBLE_DEVICES=0  # Use first GPU (0-indexed)
```

Or in FFmpeg command (edit server.py):
```python
"-hwaccel_device", "0",  # Select GPU 0
```

## Performance Tuning

### For Maximum Quality

Edit `ENCODER_CONFIGS` in `server.py` to increase bitrate:

```python
# For all encoders:
"-b:v", "8000k",          # Higher bitrate
"-maxrate", "9000k",

# NVIDIA specific:
"-preset", "p7",          # Slowest preset (best quality)

# Intel specific:
"-preset", "slow",        # Slower preset
```

### For Minimum Latency

```python
# NVIDIA:
"-preset", "p1",          # Fastest preset
"-rc", "cbr",            # Constant bitrate
"-tune", "ll",           # Low-latency tuning

# Intel:
"-preset", "veryfast",   # Fastest preset
```

### For Maximum Streams

MultiView supports up to 5 concurrent streams. Hardware encoders can handle:
- **NVIDIA**: 8 sessions (consumer GPU limit)
- **Intel QuickSync**: 7-10 sessions
- **AMD VAAPI**: 6-8 sessions

---
