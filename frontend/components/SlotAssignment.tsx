'use client';

import { Channel, LayoutType } from '@/types';
import { getLayoutDefinition, getSlotLabel } from '@/lib/layouts';
import Image from 'next/image';

interface SlotAssignmentProps {
  layoutType: LayoutType;
  slotAssignments: Record<string, string>; // slotId -> channelId
  channels: Channel[];
  audioSource: string | null;
  onSlotClick: (slotId: string) => void;
  onAudioSourceChange: (slotId: string) => void;
}

export default function SlotAssignment({
  layoutType,
  slotAssignments,
  channels,
  audioSource,
  onSlotClick,
  onAudioSourceChange,
}: SlotAssignmentProps) {
  const layout = getLayoutDefinition(layoutType);

  if (!layout) {
    return <div className="p-4 text-gray-500">Invalid layout selected</div>;
  }

  const getChannelById = (channelId: string | null): Channel | null => {
    if (!channelId) return null;
    return channels.find(c => c.id === channelId) || null;
  };

  const assignedSlots = layout.slots.filter(slotId => slotAssignments[slotId]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Stream Assignment</h2>
        <div className="text-sm text-gray-500">
          {assignedSlots.length} / {layout.slots.length} slots filled
        </div>
      </div>

      <div className="space-y-3">
        {layout.slots.map((slotId) => {
          const channelId = slotAssignments[slotId];
          const channel = getChannelById(channelId);
          const isAudioSource = audioSource === slotId;

          return (
            <div
              key={slotId}
              className={`border-2 rounded-lg overflow-hidden transition-all ${
                channel
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <button
                onClick={() => onSlotClick(slotId)}
                className="w-full p-4 flex items-center gap-3 hover:bg-blue-100 transition-colors"
              >
                {/* Slot label */}
                <div className="flex-shrink-0">
                  <div className="text-sm font-medium text-gray-700">
                    {getSlotLabel(slotId)}
                  </div>
                </div>

                {/* Channel info or empty state */}
                {channel ? (
                  <>
                    {/* Channel icon */}
                    <div className="relative w-10 h-10 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                      {channel.icon ? (
                        <Image
                          src={channel.icon}
                          alt={channel.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          ?
                        </div>
                      )}
                    </div>

                    {/* Channel name */}
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900">{channel.name}</div>
                    </div>

                    {/* Audio indicator */}
                    {isAudioSource && (
                      <div className="flex-shrink-0 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                        🔊 Audio
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 text-left text-gray-400">
                    Click to assign channel
                  </div>
                )}
              </button>

              {/* Audio source selector (only show if slot has a channel) */}
              {channel && !isAudioSource && (
                <div className="border-t border-blue-200 px-4 py-2 bg-white">
                  <button
                    onClick={() => onAudioSourceChange(slotId)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Set as audio source
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
