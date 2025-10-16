FROM linuxserver/ffmpeg:latest

# Universal FFmpeg build with ALL hardware encoders:
# - NVIDIA NVENC (h264_nvenc)
# - Intel QuickSync (h264_qsv via libvpl)
# - AMD/Intel VAAPI (h264_vaapi)
# - CPU (libx264)

# Install Python and dependencies (bypass PEP 668 for container)
RUN apt-get update \
 && apt-get install -y python3 python3-pip fonts-dejavu-core curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py

# Use --break-system-packages for containerized environment (safe in Docker)
RUN pip3 install --break-system-packages --no-cache-dir fastapi uvicorn[standard] pyzmq

# Environment variables with defaults
ENV PORT=9292
ENV ENCODER_PREFERENCE=auto
ENV M3U_SOURCE=http://127.0.0.1:9191/output/m3u?direct=true
ENV IDLE_TIMEOUT=60

EXPOSE 9292

# Clear the inherited entrypoint from linuxserver/ffmpeg
# (allows our Python command to execute directly instead of being passed to ffmpeg)
ENTRYPOINT []

# Hardware acceleration runtime requirements:
# - NVIDIA: --gpus flag + NVIDIA Container Toolkit
# - Intel/AMD: --device /dev/dri:/dev/dri
# - CPU: No additional requirements (always available)
CMD ["python3","-m","uvicorn","server:app","--host","0.0.0.0","--port","9292"]
