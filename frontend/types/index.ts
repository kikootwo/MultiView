// Channel types
export interface Channel {
  id: string;
  name: string;
  icon: string;
  url: string;
}

// Layout types
export type LayoutType =
  | 'pip'           // Picture-in-Picture: 1 main + 1 inset
  | 'dvd_pip'       // DVD Screensaver PiP: 1 main + 1 bouncing inset
  | 'multi_pip_2'   // 1 main + 2 small insets
  | 'multi_pip_3'   // 1 main + 3 small insets
  | 'multi_pip_4'   // 1 main + 4 small insets
  | 'split_h'       // 2 streams side-by-side (horizontal)
  | 'split_v'       // 2 streams top/bottom (vertical)
  | 'grid_2x2'      // 4 streams in 2x2 grid
  | 'custom';       // User-created custom layout

export interface LayoutSlot {
  slotId: string;
  channelId: string | null;
}

export interface LayoutConfig {
  layout: LayoutType;
  streams: Record<string, string>; // slotId -> channelId
  audio_source: string; // slotId providing audio
  custom_slots?: Array<{id: string; name: string; x: number; y: number; width: number; height: number; border?: boolean}>; // For custom layouts
}

// API Response types
export interface StatusResponse {
  proc_running: boolean;
  mode: 'idle' | 'black' | 'live';
  in1: string | null;
  in2: string | null;
  idle_timeout_sec: number;
  last_hit_epoch: number;
}

export interface LayoutSetResponse {
  status: string;
  message?: string;
}

export interface ChannelsResponse {
  channels: Channel[];
  count: number;
}

// Custom Layout types
export interface CustomLayoutSlot {
  id: string;              // Unique slot ID
  name: string;            // User-defined name (e.g., "Main Camera")
  x: number;               // X position in pixels (0-1920, snap to 20px grid)
  y: number;               // Y position in pixels (0-1080, snap to 20px grid)
  width: number;           // Width in pixels (320-1920, maintains 16:9)
  height: number;          // Height in pixels (180-1080, maintains 16:9)
  border: boolean;         // Whether to show white border around slot
}

export interface CustomLayout {
  id: string;              // UUID
  name: string;            // User-defined layout name
  type: 'custom';          // Always 'custom' to distinguish from base layouts
  slots: CustomLayoutSlot[];
  createdAt: number;       // Timestamp
}
