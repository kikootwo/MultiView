FROM jrottenberg/ffmpeg:6.1-nvidia

# Python + FastAPI + a known font for drawtext
RUN apt-get update \
 && apt-get install -y python3 python3-pip fonts-dejavu-core curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py
RUN pip3 install --no-cache-dir fastapi uvicorn[standard]

# Environment variables with defaults
ENV PORT=9292
ENV FORCE_CPU=0
ENV M3U_SOURCE=http://127.0.0.1:9191/output/m3u?direct=true
ENV IDLE_TIMEOUT=60

EXPOSE 9292

# Clear ffmpeg's entrypoint so we can run uvicorn
ENTRYPOINT []
CMD ["python3","-m","uvicorn","server:app","--host","0.0.0.0","--port","9292"]
