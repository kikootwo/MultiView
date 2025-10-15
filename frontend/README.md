# MultiView Frontend

Mobile-friendly Next.js control panel for MultiView multi-stream video composition.

## Features

- 📱 **Mobile-First Design** - Touch-friendly interface optimized for phones and tablets
- 🎬 **Multiple Layout Types** - PiP, split-screen, grids, multi-PiP
- 🔊 **Audio Source Control** - Select which stream provides audio
- 📺 **Channel Management** - Browse and assign channels from M3U playlist
- ⚡ **Real-Time Control** - Instant layout and stream switching

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MultiView backend server running (default: http://localhost:9292)

### Installation

```bash
npm install
```

### Configuration

**No configuration needed!** The frontend automatically detects the backend URL from the current hostname:
- `localhost:9393` → connects to `localhost:9292`
- `192.168.1.100:9393` → connects to `192.168.1.100:9292`

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx       # Root layout with metadata
│   └── page.tsx         # Main control interface
├── components/
│   ├── ChannelList.tsx      # Channel browser with search
│   ├── LayoutSelector.tsx   # Visual layout picker
│   └── SlotAssignment.tsx   # Stream slot configuration
├── lib/
│   ├── api.ts           # Backend API client
│   └── layouts.ts       # Layout definitions and helpers
└── types/
    └── index.ts         # TypeScript interfaces
```

## Usage

### Mobile

1. Select a layout type from the "Layout Setup" tab
2. Tap a slot to assign a channel
3. Switch to "Channels" tab to browse and select
4. Choose audio source (tap "Set as audio source" button)
5. Tap "▶ Apply Layout" to start streaming

### Desktop

- Left panel: Layout selection and slot assignment
- Right panel: Channel list
- Click slots to assign channels
- All controls visible simultaneously

## API Integration

The frontend expects these backend endpoints:

- `GET /api/channels` - Get channel list
- `POST /api/channels/refresh` - Refresh M3U
- `POST /api/layout/set` - Apply layout configuration
- `POST /api/layout/swap-audio` - Change audio source
- `POST /api/audio/volume` - Set stream volume
- `GET /api/audio/volumes` - Get current volumes
- `GET /control/status` - Get system status
- `GET /control/stop` - Stop streaming

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Responsive styling
- **React Hooks** - State management

## Development Notes

- All components are client-side (`'use client'`)
- Mobile-first responsive design (Tailwind `md:` breakpoints)
- No external state management library (React hooks only)
- Images are unoptimized (external channel icons)
