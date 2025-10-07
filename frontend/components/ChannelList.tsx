'use client';

import { Channel } from '@/types';
import Image from 'next/image';
import { useState } from 'react';

interface ChannelListProps {
  channels: Channel[];
  onChannelSelect: (channel: Channel) => void;
  selectedChannelId?: string | null;
}

export default function ChannelList({
  channels,
  onChannelSelect,
  selectedChannelId,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChannels = channels.filter(channel =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-4 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search channels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {filteredChannels.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            No channels found
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 p-4">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => onChannelSelect(channel)}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all hover:bg-blue-50 ${
                  selectedChannelId === channel.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
              >
                {/* Channel icon */}
                <div className="relative w-12 h-12 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                  {channel.icon ? (
                    <Image
                      src={channel.icon}
                      alt={channel.name}
                      fill
                      className="object-cover"
                      unoptimized // For external URLs
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      No Icon
                    </div>
                  )}
                </div>

                {/* Channel name */}
                <div className="flex-1 text-left">
                  <div className="font-medium text-gray-900">{channel.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
