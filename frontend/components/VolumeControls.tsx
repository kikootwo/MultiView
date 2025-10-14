'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Channel, LayoutType } from '@/types';
import VolumeControl from './VolumeControl';

interface VolumeControlsProps {
  slotAssignments: Record<string, string>; // slotId -> channelId
  channels: Channel[];
  layoutType: LayoutType;
}

export default function VolumeControls({
  slotAssignments,
  channels,
  layoutType,
}: VolumeControlsProps) {
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  const loadVolumes = useCallback(async () => {
    try {
      setIsLoading(true);
      const volumeData = await api.getVolumes();
      // Use the volumes from backend, or default first slot to 1.0, rest to 0.0
      if (volumeData.volumes && Object.keys(volumeData.volumes).length > 0) {
        setVolumes(volumeData.volumes);
      } else {
        // Initialize with default volumes if none exist
        const defaultVolumes: Record<string, number> = {};
        const slots = Object.keys(slotAssignments);
        slots.forEach((slotId, index) => {
          defaultVolumes[slotId] = index === 0 ? 1.0 : 0.0; // First slot 100%, rest muted
        });
        setVolumes(defaultVolumes);
      }
    } catch (err) {
      console.error('Failed to load volumes:', err);
      // Initialize with default volumes if loading fails
      const defaultVolumes: Record<string, number> = {};
      const slots = Object.keys(slotAssignments);
      slots.forEach((slotId, index) => {
        defaultVolumes[slotId] = index === 0 ? 1.0 : 0.0; // First slot 100%, rest muted
      });
      setVolumes(defaultVolumes);
    } finally {
      setIsLoading(false);
    }
  }, [slotAssignments]);

  // Load current volumes when component mounts or layout changes
  useEffect(() => {
    loadVolumes();
  }, [layoutType, loadVolumes]);

  // Filter assigned slots
  const assignedSlots = Object.keys(slotAssignments).filter(
    slotId => slotAssignments[slotId]
  );

  if (assignedSlots.length === 0) {
    return null; // Don't show volume controls if no slots assigned
  }

  return (
    <div className="p-4 pb-6 border-t border-card-border bg-gradient-to-br from-card to-background">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span>🎚️</span>
          <span>Audio Mix</span>
        </h2>
        {isLoading && (
          <span className="text-xs text-muted">Loading...</span>
        )}
      </div>

      <div className="space-y-3">
        {assignedSlots.map((slotId, index) => {
          const channelId = slotAssignments[slotId];
          // Default: first slot at 100%, rest at 0%
          const volume = volumes[slotId] ?? (index === 0 ? 1.0 : 0.0);

          return (
            <div
              key={slotId}
              className="p-3 bg-card border border-card-border rounded-lg shadow-sm"
            >
              <VolumeControl
                slotId={slotId}
                channelId={channelId}
                channels={channels}
                initialVolume={volume}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
