'use client';

import { Channel } from '@/types';
import { useState } from 'react';

interface ChannelListProps {
  channels: Channel[];
  onChannelSelect: (channel: Channel) => void;
  selectedChannelId?: string | null;
  disabledChannelIds?: string[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function ChannelList({
  channels,
  onChannelSelect,
  selectedChannelId,
  disabledChannelIds = [],
  onRefresh,
  isRefreshing = false,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChannels = channels.filter(channel =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Refresh button */}
      {onRefresh && (
        <div className="p-4 border-b border-card-border flex-shrink-0">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-primary to-accent hover:from-primary-hover hover:to-primary text-white font-medium rounded-lg disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
            {isRefreshing ? 'Refreshing...' : 'Refresh Channels'}
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="p-4 border-b border-card-border flex-shrink-0">
        <input
          type="text"
          placeholder="🔍 Search channels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all text-foreground placeholder:text-muted"
        />
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredChannels.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted">
            No channels found
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {filteredChannels.map((channel) => {
              const isDisabled = disabledChannelIds.includes(channel.id);
              const isSelected = selectedChannelId === channel.id;

              return (
                <button
                  key={channel.id}
                  onClick={() => !isDisabled && onChannelSelect(channel)}
                  disabled={isDisabled}
                  className={`w-full flex items-center gap-3 p-3 transition-all ${
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-primary hover:bg-opacity-5 hover:shadow-sm'
                  } ${
                    isSelected
                      ? 'bg-primary bg-opacity-10 shadow-sm'
                      : ''
                  }`}
                >
                  {/* Channel icon */}
                  <div className="w-10 h-10 flex-shrink-0 bg-background rounded overflow-hidden flex items-center justify-center border border-card-border">
                    {getImageUrl(channel.icon) ? (
                      <img
                        src={getImageUrl(channel.icon)!}
                        alt={channel.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Hide broken images
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-muted text-xs">📺</div>
                    )}
                  </div>

                  {/* Channel name */}
                  <div className="flex-1 text-left">
                    <div className="font-medium text-foreground">
                      {channel.name}
                      {isDisabled && <span className="ml-2 text-xs text-muted">(assigned)</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
