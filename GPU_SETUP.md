# GPU Setup for MultiView

This guide covers setting up NVIDIA GPU support for hardware-accelerated video encoding with your RTX 3090.

## Why GPU Encoding?

**NVIDIA NVENC** (hardware encoder) provides:
- **Lower CPU usage**: Frees up your 24 cores for other tasks
- **Better quality/bitrate**: More efficient encoding at same bitrate
- **Lower latency**: Hardware encoding is faster than software
- **Higher capacity**: Can encode more streams simultaneously

The **RTX 3090** supports up to **8 concurrent NVENC sessions** (consumer limit), perfect for MultiView's 5-stream max.

## Prerequisites

### 1. NVIDIA Drivers

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

### 2. NVIDIA Container Toolkit

Docker needs the NVIDIA Container Toolkit to access your GPU.

#### Ubuntu/Debian

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

#### WSL2 (Windows)

```bash
# Install nvidia-container-toolkit in WSL2
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker Desktop from Windows
```

### 3. Verify GPU Access in Docker

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
  --network host \
  -v $(pwd)/out:/out \
  -e FORCE_CPU=0 \
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
curl http://localhost:9292/control/status
```

The backend doesn't explicitly report GPU usage, but check logs for "h264_nvenc" mentions.

## Performance Comparison

### RTX 3090 (GPU) vs 24-Core CPU

| Metric | GPU (NVENC) | CPU (libx264) |
|--------|-------------|---------------|
| CPU Usage (4 streams) | ~5-10% | ~60-80% |
| Encoding Latency | <50ms | ~100-200ms |
| Quality @ 6Mbps | Excellent | Very Good |
| Max Streams | 8 (NVENC limit) | 5 (CPU limit) |
| Power Usage | +50W GPU | +100W CPU |

## Encoding Settings

MultiView uses these NVENC settings (server.py:46-53):

```python
"-c:v", "h264_nvenc",      # NVIDIA hardware encoder
"-preset", "p5",            # Quality preset (p1=fastest, p7=slowest)
"-rc", "vbr",              # Variable bitrate
"-b:v", "6000k",           # Target bitrate
"-maxrate", "6500k",       # Max bitrate
"-bufsize", "12M",         # Buffer size
"-spatial_aq", "1",        # Adaptive quantization
"-aq-strength", "8",       # AQ strength
```

**Preset Options** (if you want to customize):
- `p1` - Fastest (lowest quality)
- `p3` - Fast
- `p5` - Medium (default, recommended)
- `p6` - Slow (better quality)
- `p7` - Slowest (best quality)

To change preset, edit `server.py:49`:
```python
"-preset", "p6",  # Better quality, slightly higher latency
```

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

### FFmpeg falls back to CPU

**Logs show**: `Using codec: libx264`

**Cause**: FORCE_CPU=1 or GPU not accessible

**Fix**:
```bash
# Check environment variable
docker-compose config | grep FORCE_CPU
# Should show: FORCE_CPU=0

# Rebuild with GPU support
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
```python
# In server.py, change:
"-preset", "p7",           # Slowest preset (best quality)
"-b:v", "8000k",          # Higher bitrate
"-maxrate", "9000k",
```

### For Minimum Latency
```python
# In server.py, change:
"-preset", "p1",           # Fastest preset
"-rc", "cbr",             # Constant bitrate
"-tune", "ll",            # Low-latency tuning
```

### For Maximum Streams (8 concurrent)
Current limit is 5 streams (CPU constraint for layout management). If you upgrade the limit, NVENC can handle 8 simultaneous encodes on RTX 3090.

---
