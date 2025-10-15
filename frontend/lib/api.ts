import {
  Channel,
  ChannelsResponse,
  LayoutConfig,
  LayoutSetResponse,
  StatusResponse,
} from '@/types';

// Dynamic API URL based on current hostname
// This allows the app to work from localhost, LAN IP, or any hostname
function getApiBaseUrl(): string {
  // Server-side: use environment variable
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9292';
  }

  // Client-side: use same hostname as current page
  // If accessing from localhost:9393 -> use localhost:9292
  // If accessing from 192.168.117.2:9393 -> use 192.168.117.2:9292
  const hostname = window.location.hostname;
  return `http://${hostname}:9292`;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getApiBaseUrl();
  }

  /**
   * Get the base URL for API requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Fetch all available channels from M3U source
   */
  async getChannels(): Promise<Channel[]> {
    const response = await fetch(`${this.baseUrl}/api/channels`);
    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }
    const data: ChannelsResponse = await response.json();
    return data.channels;
  }

  /**
   * Refresh channel list from M3U source
   */
  async refreshChannels(): Promise<Channel[]> {
    const response = await fetch(`${this.baseUrl}/api/channels/refresh`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`Failed to refresh channels: ${response.statusText}`);
    }
    const data: ChannelsResponse = await response.json();
    return data.channels;
  }

  /**
   * Get current system status
   */
  async getStatus(): Promise<StatusResponse> {
    const response = await fetch(`${this.baseUrl}/control/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch status: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Set layout configuration with streams and audio source
   */
  async setLayout(config: LayoutConfig): Promise<LayoutSetResponse> {
    const response = await fetch(`${this.baseUrl}/api/layout/set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`Failed to set layout: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get current layout configuration
   */
  async getCurrentLayout(): Promise<LayoutConfig> {
    const response = await fetch(`${this.baseUrl}/api/layout/current`);
    if (!response.ok) {
      throw new Error(`Failed to get current layout: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Swap audio source without restarting layout
   */
  async swapAudioSource(slotId: string): Promise<LayoutSetResponse> {
    const response = await fetch(`${this.baseUrl}/api/layout/swap-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_source: slotId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to swap audio source: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Stop streaming (switch to standby mode)
   */
  async stop(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/control/stop`);
    if (!response.ok) {
      throw new Error(`Failed to stop: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Set volume for a specific slot
   */
  async setVolume(slotId: string, volume: number): Promise<{ status: string; slot_id: string; volume: number }> {
    const response = await fetch(`${this.baseUrl}/api/audio/volume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slot_id: slotId, volume }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set volume: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get current volume levels for all slots
   */
  async getVolumes(): Promise<{ volumes: Record<string, number>; layout: string; streams: Record<string, string> }> {
    const response = await fetch(`${this.baseUrl}/api/audio/volumes`);
    if (!response.ok) {
      throw new Error(`Failed to get volumes: ${response.statusText}`);
    }
    return response.json();
  }
}

// Export singleton instance
export const api = new ApiClient();
