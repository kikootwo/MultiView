'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Channel } from '@/types';

interface VolumeControlProps {
  slotId: string;
  channelId: string;
  channels: Channel[];
  initialVolume?: number;
}

const VOLUME_PRESETS = [
  { label: 'Mute', value: 0 },
  { label: 'Sub', value: 0.33 },
  { label: 'Full', value: 1.0 },
];

export default function VolumeControl({
  slotId,
  channelId,
  channels,
  initialVolume = 1.0,
}: VolumeControlProps) {
  const [volume, setVolume] = useState(initialVolume);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get channel name for display
  const channel = channels.find(c => c.id === channelId);
  const channelName = channel?.name || slotId;

  // Update local state when initialVolume changes
  useEffect(() => {
    setVolume(initialVolume);
  }, [initialVolume]);

  const handleVolumeChange = async (newVolume: number) => {
    setVolume(newVolume);
    setIsSending(true);
    setError(null);
    try {
      await api.setVolume(slotId, newVolume);
    } catch (err) {
      console.error('Failed to set volume:', err);
      setError('Failed to set volume');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {channelName}
        </span>
        {isSending && <span className="text-xs text-primary">⟳</span>}
      </div>
      <div className="flex gap-2">
        {VOLUME_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handleVolumeChange(preset.value)}
            disabled={isSending}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
              Math.abs(volume - preset.value) < 0.05
                ? 'bg-primary text-white shadow-md'
                : 'bg-card border border-card-border text-foreground hover:bg-primary hover:bg-opacity-10'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
