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
  | 'multi_pip_2'   // 1 main + 2 small insets
  | 'multi_pip_3'   // 1 main + 3 small insets
  | 'multi_pip_4'   // 1 main + 4 small insets
  | 'split_h'       // 2 streams side-by-side (horizontal)
  | 'split_v'       // 2 streams top/bottom (vertical)
  | 'grid_2x2';     // 4 streams in 2x2 grid

export interface LayoutSlot {
  slotId: string;
  channelId: string | null;
}

export interface LayoutConfig {
  layout: LayoutType;
  streams: Record<string, string>; // slotId -> channelId
  audio_source: string; // slotId providing audio
}

// API Response types
export interface StatusResponse {
  proc_running: boolean;
  mode: 'black' | 'live';
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
