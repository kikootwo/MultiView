# Dynamic Audio Control Enhancement

> Enable audio volume control with minimal interruption using smart FFmpeg restarts.

## Overview

This enhancement allows users to adjust the volume mix of multiple streams with minimal interruption (1-2 second glitch). Users can control individual stream volumes via UI sliders, with changes applied within 1-3 seconds via optimistic FFmpeg restart.

## Goals

- **Minimal Interruption**: Volume changes apply via fast restart (1-2 second glitch)
- **Quick Application**: Changes reflected in 1-3 seconds
- **Independent Control**: Each stream has its own volume slider (0-100%)
- **Persistent State**: Volume settings survive across layout changes
- **Simple & Reliable**: Uses standard FFmpeg volume filters

## Architecture

### Smart Restart Approach

Volume changes are applied by restarting FFmpeg with updated volume parameters. The restart is optimized for minimal interruption.

**Key Components:**
1. **Volume State Management**: Backend stores volume levels per slot in `CURRENT_LAYOUT`
2. **Standard Volume Filters**: Each audio stream uses FFmpeg's built-in `volume` filter
3. **Optimistic Restart**: New FFmpeg process starts before old one is killed
4. **amix Filter**: Mixes volume-adjusted audio streams into final output

### Filter Graph Changes

**Before (Single Audio):**
```
[0:a] → aformat → [aout]
```

**After (Multi-Stream with Volume Control):**
```
[0:a] → aformat → volume=0.2 → [a0]
[1:a] → aformat → volume=1.0 → [a1]
[a0][a1] → amix=inputs=2:duration=longest:normalize=0 → [aout]
```

Each audio stream gets:
- Individual `volume` filter with specified level (0.0-1.0)
- Default volume based on audio_source selection
- Mixed into final output via amix

### State Management

**Backend (`server.py`):**
```python
CURRENT_LAYOUT = {
    "layout": "split_h",
    "streams": {...},
    "audio_volumes": {
        0: 1.0,  # Stream index → volume (0.0-1.0)
        1: 0.5
    }
}
```

**New Endpoints:**
- `POST /api/audio/volume` - Set volume for specific stream
- `GET /api/audio/volumes` - Get current volume levels

## Implementation Details

### Backend Components

#### 1. ZeroMQ Communication Layer

```python
import zmq
import threading

class AudioVolumeController:
    def __init__(self):
        self.context = zmq.Context()
        self.sockets = {}  # stream_index → socket

    def create_socket(self, stream_index: int) -> str:
        """Create ZMQ socket for stream, return bind address"""
        socket = self.context.socket(zmq.REQ)
        address = f"ipc:///tmp/zmq-stream-{stream_index}"
        socket.connect(address)
        self.sockets[stream_index] = socket
        return address

    def set_volume(self, stream_index: int, volume: float):
        """Send volume command to FFmpeg via ZMQ"""
        if stream_index not in self.sockets:
            raise ValueError(f"No socket for stream {stream_index}")

        # Send ZMQ command: "volume <value>"
        command = f"volume {volume}"
        self.sockets[stream_index].send_string(command)
        self.sockets[stream_index].recv()  # Wait for ACK
```

#### 2. FFmpeg Filter Graph Generator

**Modifications to `build_filter_complex()`:**

```python
def build_filter_complex(layout: str, streams: dict, audio_volumes: dict):
    """Generate filter_complex with ZeroMQ audio controls"""

    # Video filters (unchanged)
    video_filters = build_video_filters(layout, streams)

    # Audio filters with ZMQ
    audio_filters = []
    stream_indices = list(streams.keys())

    for idx, stream_idx in enumerate(stream_indices):
        volume = audio_volumes.get(stream_idx, 1.0)
        zmq_addr = f"ipc:///tmp/zmq-stream-{idx}"

        # azmq filter with bind address and initial volume
        audio_filter = (
            f"[{idx}:a]"
            f"aformat=sample_rates=48000:channel_layouts=stereo,"
            f"azmq=bind_address='{zmq_addr}':volume={volume}"
            f"[a{idx}]"
        )
        audio_filters.append(audio_filter)

    # Mix all audio streams
    if len(stream_indices) > 1:
        inputs = ''.join(f"[a{i}]" for i in range(len(stream_indices)))
        mix_filter = f"{inputs}amix=inputs={len(stream_indices)}:duration=longest:normalize=0[aout]"
        audio_filters.append(mix_filter)
    else:
        audio_filters.append(f"[a0]anull[aout]")

    return ";".join(video_filters + audio_filters)
```

#### 3. API Endpoint

```python
@app.post("/api/audio/volume")
async def set_audio_volume(stream_index: int, volume: float):
    """Set volume for specific stream (0.0-1.0)"""

    # Validate
    if not 0.0 <= volume <= 1.0:
        raise HTTPException(400, "Volume must be 0.0-1.0")

    with CURRENT_LAYOUT_LOCK:
        if stream_index not in CURRENT_LAYOUT.get("streams", {}):
            raise HTTPException(404, "Stream not active")

        # Update state
        if "audio_volumes" not in CURRENT_LAYOUT:
            CURRENT_LAYOUT["audio_volumes"] = {}
        CURRENT_LAYOUT["audio_volumes"][stream_index] = volume

        # Send to FFmpeg via ZMQ
        audio_controller.set_volume(stream_index, volume)

    return {"status": "ok", "stream_index": stream_index, "volume": volume}
```

### Frontend Components

#### 1. Volume Slider Component

```typescript
interface VolumeSliderProps {
  streamIndex: number;
  channelName: string;
  initialVolume: number;
  onChange: (volume: number) => void;
}

export function VolumeSlider({ streamIndex, channelName, initialVolume, onChange }: VolumeSliderProps) {
  const [volume, setVolume] = useState(initialVolume);

  const handleChange = useMemo(
    () => debounce((value: number) => onChange(value), 300),
    [onChange]
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{channelName}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          setVolume(val);
          handleChange(val / 100);
        }}
        className="w-full"
      />
      <span className="text-sm text-gray-500">{volume}%</span>
    </div>
  );
}
```

#### 2. API Client

```typescript
export async function setStreamVolume(streamIndex: number, volume: number) {
  const res = await fetch(`${API_BASE}/api/audio/volume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stream_index: streamIndex, volume })
  });

  if (!res.ok) throw new Error('Failed to set volume');
  return res.json();
}
```

## Technical Considerations

### Performance
- **Minimal Overhead**: ZeroMQ adds <1% CPU overhead per stream
- **Memory**: ~50KB per ZeroMQ socket (negligible)
- **Latency**: 1-3 seconds for volume changes to reflect in output

### Thread Safety
- All ZeroMQ operations wrapped in `CURRENT_LAYOUT_LOCK`
- Socket creation/destruction synchronized with FFmpeg lifecycle
- Volume state persisted for layout reapplication

### Error Handling
- **Socket Failures**: Log error, fall back to restart-based volume change
- **Invalid Volumes**: Clamp to 0.0-1.0 range
- **Stale Sockets**: Clean up on FFmpeg restart

### Limitations
- Requires FFmpeg compiled with `--enable-libzmq`
- ZeroMQ bind addresses limited by OS (typically ~1024 sockets)
- Volume changes not sample-accurate (frame-level granularity)

## Testing Checklist

- [ ] Two streams with independent volume control
- [ ] Rapid volume changes (no crashes or memory leaks)
- [ ] Volume at 0% fully mutes stream
- [ ] Volume at 100% maintains original loudness
- [ ] No audio pops/clicks during transitions
- [ ] Stream stays connected during volume changes
- [ ] Plex LiveTV maintains playback
- [ ] VLC maintains playback
- [ ] Volume persists across layout reapplications
- [ ] Error handling for invalid stream indices

## Future Enhancements

1. **Audio Crossfading**: Smooth transitions between audio sources
2. **Volume Presets**: Save/load volume configurations
3. **Audio Ducking**: Auto-lower background streams when main stream is active
4. **Normalization**: Auto-level streams to match perceived loudness
5. **Visual Feedback**: Real-time audio level meters alongside sliders
