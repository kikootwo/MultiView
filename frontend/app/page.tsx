'use client';

import { useState, useEffect } from 'react';
import { Channel, LayoutType } from '@/types';
import { api } from '@/lib/api';
import ChannelList from '@/components/ChannelList';
import LayoutSelector from '@/components/LayoutSelector';
import SlotAssignment from '@/components/SlotAssignment';

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('pip');
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'layout' | 'channels'>('layout');

  // Load channels on mount
  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const channelData = await api.getChannels();
      setChannels(channelData);
    } catch (err) {
      setError('Failed to load channels. Make sure backend is running.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshChannels = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const channelData = await api.refreshChannels();
      setChannels(channelData);
    } catch (err) {
      setError('Failed to refresh channels.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSlotClick = (slotId: string) => {
    setActiveSlot(slotId);
    setView('channels');
  };

  const handleChannelSelect = (channel: Channel) => {
    if (activeSlot) {
      const newAssignments = { ...slotAssignments, [activeSlot]: channel.id };
      setSlotAssignments(newAssignments);

      // Auto-set first assigned channel as audio source
      if (!audioSource) {
        setAudioSource(activeSlot);
      }

      setActiveSlot(null);
      setView('layout');
    }
  };

  const handleAudioSourceChange = (slotId: string) => {
    setAudioSource(slotId);
  };

  const handleApplyLayout = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Convert slot assignments to channel URLs
      const streams: Record<string, string> = {};
      Object.entries(slotAssignments).forEach(([slotId, channelId]) => {
        const channel = channels.find(c => c.id === channelId);
        if (channel) {
          streams[slotId] = channelId;
        }
      });

      if (!audioSource) {
        setError('Please select an audio source');
        return;
      }

      await api.setLayout({
        layout: selectedLayout,
        streams,
        audio_source: audioSource,
      });

      alert('Layout applied successfully!');
    } catch (err) {
      setError('Failed to apply layout. Backend API may not be ready yet.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await api.stop();
      alert('Stream stopped (standby mode)');
    } catch (err) {
      setError('Failed to stop stream');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const canApply = Object.keys(slotAssignments).length > 0 && audioSource !== null;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">MultiView Control</h1>
          <button
            onClick={handleRefreshChannels}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-sm font-medium disabled:opacity-50"
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {/* Mobile view switcher */}
        <div className="md:hidden border-b border-gray-200 bg-white">
          <div className="flex">
            <button
              onClick={() => setView('layout')}
              className={`flex-1 py-3 text-sm font-medium ${
                view === 'layout'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500'
              }`}
            >
              Layout Setup
            </button>
            <button
              onClick={() => setView('channels')}
              className={`flex-1 py-3 text-sm font-medium ${
                view === 'channels'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500'
              }`}
            >
              Channels {activeSlot && '(Select)'}
            </button>
          </div>
        </div>

        {/* Desktop/Tablet layout */}
        <div className="h-full flex flex-col md:flex-row">
          {/* Layout configuration (left side on desktop) */}
          <div className={`${view === 'layout' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-y-auto bg-white border-r border-gray-200`}>
            <LayoutSelector
              selectedLayout={selectedLayout}
              onLayoutSelect={setSelectedLayout}
            />
            <div className="border-t border-gray-200">
              <SlotAssignment
                layoutType={selectedLayout}
                slotAssignments={slotAssignments}
                channels={channels}
                audioSource={audioSource}
                onSlotClick={handleSlotClick}
                onAudioSourceChange={handleAudioSourceChange}
              />
            </div>
          </div>

          {/* Channel list (right side on desktop) */}
          <div className={`${view === 'channels' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-96 bg-white`}>
            {activeSlot && (
              <div className="p-4 bg-blue-50 border-b border-blue-200">
                <div className="text-sm font-medium text-blue-900">
                  Select channel for: {activeSlot}
                </div>
                <button
                  onClick={() => {
                    setActiveSlot(null);
                    setView('layout');
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  ← Cancel
                </button>
              </div>
            )}
            <ChannelList
              channels={channels}
              onChannelSelect={handleChannelSelect}
              selectedChannelId={activeSlot ? slotAssignments[activeSlot] : null}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-3">
          <button
            onClick={handleApplyLayout}
            disabled={!canApply || isLoading}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Applying...' : '▶ Apply Layout'}
          </button>
          <button
            onClick={handleStop}
            disabled={isLoading}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            ⏹ Stop
          </button>
        </div>
      </div>
    </div>
  );
}
