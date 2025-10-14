'use client';

import { Channel, LayoutType, CustomLayout } from '@/types';
import { getLayoutDefinition, getSlotLabel } from '@/lib/layouts';

interface SlotAssignmentProps {
  layoutType: LayoutType;
  customLayout?: CustomLayout | null;
  slotAssignments: Record<string, string>; // slotId -> channelId
  channels: Channel[];
  audioSource: string | null;
  onSlotClick: (slotId: string) => void;
  onAudioSourceChange: (slotId: string) => void;
  onApplyLayout: () => void;
  onStop: () => void;
  isLoading: boolean;
  canApply: boolean;
}

export default function SlotAssignment({
  layoutType,
  customLayout,
  slotAssignments,
  channels,
  audioSource,
  onSlotClick,
  onAudioSourceChange,
  onApplyLayout,
  onStop,
  isLoading,
  canApply,
}: SlotAssignmentProps) {
  // Handle custom layouts
  let slots: string[] = [];

  if (layoutType === 'custom' && customLayout) {
    slots = customLayout.slots.map(s => s.id);
  } else {
    const layout = getLayoutDefinition(layoutType);
    if (!layout) {
      return <div className="p-4 text-muted">Invalid layout selected</div>;
    }
    slots = layout.slots;
  }

  const getChannelById = (channelId: string | null): Channel | null => {
    if (!channelId) return null;
    return channels.find(c => c.id === channelId) || null;
  };

  // Get proxied image URL to work around Docker internal hostnames
  const getImageUrl = (iconUrl: string | undefined): string | null => {
    if (!iconUrl) return null;
    // If browser-accessible, use directly
    if (iconUrl.startsWith('http://') && !iconUrl.includes('host.docker.internal')) {
      return iconUrl;
    }
    // Otherwise proxy through backend
    const apiUrl = typeof window !== 'undefined'
      ? `http://${window.location.hostname}:9292`
      : 'http://localhost:9292';
    return `${apiUrl}/api/proxy-image?url=${encodeURIComponent(iconUrl)}`;
  };

  const assignedSlots = slots.filter(slotId => slotAssignments[slotId]);

  // Get slot display name
  const getSlotDisplayName = (slotId: string): string => {
    if (layoutType === 'custom' && customLayout) {
      const slot = customLayout.slots.find(s => s.id === slotId);
      return slot?.name || slotId;
    }
    return getSlotLabel(slotId);
  };

  return (
    <div className="p-4 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Stream Assignment</h2>
        <div className="text-sm text-muted">
          {assignedSlots.length} / {slots.length} slots filled
        </div>
      </div>

      <div className="space-y-3">
        {slots.map((slotId) => {
          const channelId = slotAssignments[slotId];
          const channel = getChannelById(channelId);
          const isAudioSource = audioSource === slotId;

          return (
            <div
              key={slotId}
              className={`border-2 rounded-lg overflow-hidden transition-all shadow-sm hover:shadow-md ${
                channel
                  ? 'border-primary bg-gradient-to-br from-primary/5 to-accent/5'
                  : 'border-card-border bg-card'
              }`}
            >
              <button
                onClick={() => onSlotClick(slotId)}
                className="w-full p-4 flex items-center gap-3 hover:bg-primary hover:bg-opacity-5 transition-colors"
              >
                {/* Slot label */}
                <div className="flex-shrink-0">
                  <div className="text-sm font-medium text-foreground">
                    {getSlotDisplayName(slotId)}
                  </div>
                </div>

                {/* Channel info or empty state */}
                {channel ? (
                  <>
                    {/* Channel icon */}
                    <div className="w-10 h-10 flex-shrink-0 bg-background rounded overflow-hidden flex items-center justify-center">
                      {getImageUrl(channel.icon) ? (
                        <img
                          src={getImageUrl(channel.icon)!}
                          alt={channel.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="text-muted text-xs">📺</div>
                      )}
                    </div>

                    {/* Channel name */}
                    <div className="flex-1 text-left">
                      <div className="font-medium text-foreground">{channel.name}</div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 text-left text-muted">
                    Click to assign channel
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="mt-6 pt-6 border-t border-card-border">
        <div className="flex gap-3">
          <button
            onClick={onApplyLayout}
            disabled={!canApply || isLoading}
            className="flex-1 py-3 bg-gradient-to-r from-success to-emerald-500 hover:from-emerald-600 hover:to-success text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            {isLoading ? '⏳ Applying...' : '▶ Apply Layout'}
          </button>
          <button
            onClick={onStop}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-danger to-rose-500 hover:from-rose-600 hover:to-danger text-white font-semibold rounded-lg disabled:opacity-50 transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            ⏹ Stop
          </button>
        </div>
      </div>
    </div>
  );
}
