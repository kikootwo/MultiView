FROM jrottenberg/ffmpeg:6.1-nvidia

# Python + FastAPI + a known font for drawtext
RUN apt-get update \
 && apt-get install -y python3 python3-pip fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py
RUN pip3 install --no-cache-dir fastapi uvicorn[standard]

ENV PORT=9292
EXPOSE 9292

# Clear ffmpeg's entrypoint so we can run uvicorn
ENTRYPOINT []
CMD ["python3","-m","uvicorn","server:app","--host","0.0.0.0","--port","9292"]
