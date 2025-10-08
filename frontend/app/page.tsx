'use client';

import { useState, useEffect } from 'react';
import { Channel, LayoutType } from '@/types';
import { api } from '@/lib/api';
import ChannelList from '@/components/ChannelList';
import LayoutSelector from '@/components/LayoutSelector';
import SlotAssignment from '@/components/SlotAssignment';
import StatusDisplay from '@/components/StatusDisplay';

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('pip');
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [view, setView] = useState<'layout' | 'channels'>('layout');

  // Load channels and current layout on mount
  useEffect(() => {
    loadChannels();
    loadCurrentLayout();
  }, []);

  // Clear slot assignments when layout type changes
  useEffect(() => {
    setSlotAssignments({});
    setAudioSource(null);
    setActiveSlot(null);
  }, [selectedLayout]);

  const loadCurrentLayout = async () => {
    try {
      const layout = await api.getCurrentLayout();
      if (layout && layout.layout) {
        // Pre-populate form with current layout
        setSelectedLayout(layout.layout as LayoutType);
        setSlotAssignments(layout.streams || {});
        setAudioSource(layout.audio_source || null);
      }
    } catch (err) {
      // No current layout or error - just use defaults
      console.log('No active layout or failed to load:', err);
    }
  };

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
      setSuccess(null);

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

      setSuccess('Layout applied successfully! 🎉');
      setTimeout(() => setSuccess(null), 3000);
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
      setSuccess(null);
      await api.stop();
      setSuccess('Stream stopped (standby mode)');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to stop stream');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const canApply = Object.keys(slotAssignments).length > 0 && audioSource !== null;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header - Fixed */}
      <header className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] text-white shadow-lg flex-shrink-0 z-10">
        <div className="px-4 py-3">
          <StatusDisplay />
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-danger bg-opacity-10 border-l-4 border-danger p-3 animate-in slide-in-from-top">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div className="bg-success bg-opacity-10 border-l-4 border-success p-3 animate-in slide-in-from-top">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">{success}</p>
          </div>
        )}
      </header>

      {/* Main content - Scrollable */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Mobile view switcher */}
        <div className="md:hidden border-b border-card-border bg-card flex-shrink-0">
          <div className="flex">
            <button
              onClick={() => setView('layout')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                view === 'layout'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted'
              }`}
            >
              Layout Setup
            </button>
            <button
              onClick={() => setView('channels')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                view === 'channels'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted'
              }`}
            >
              Channels {activeSlot && '(Select)'}
            </button>
          </div>
        </div>

        {/* Desktop/Tablet layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Layout configuration (left side on desktop) */}
          <div className={`${view === 'layout' ? 'flex' : 'hidden'} md:flex flex-col flex-1 bg-card border-r border-card-border overflow-hidden`}>
            <div className="flex-1 overflow-y-auto min-h-0">
              <LayoutSelector
                selectedLayout={selectedLayout}
                onLayoutSelect={setSelectedLayout}
              />
              <div className="border-t border-card-border">
                <SlotAssignment
                  layoutType={selectedLayout}
                  slotAssignments={slotAssignments}
                  channels={channels}
                  audioSource={audioSource}
                  onSlotClick={handleSlotClick}
                  onAudioSourceChange={handleAudioSourceChange}
                  onApplyLayout={handleApplyLayout}
                  onStop={handleStop}
                  isLoading={isLoading}
                  canApply={canApply}
                />
              </div>
            </div>
          </div>

          {/* Channel list (right side on desktop) */}
          <div className={`${view === 'channels' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-96 bg-card overflow-hidden`}>
            {activeSlot && (
              <div className="p-4 bg-primary bg-opacity-10 border-b border-primary border-opacity-30 flex-shrink-0">
                <div className="text-sm font-medium text-foreground">
                  Select channel for: {activeSlot}
                </div>
                <button
                  onClick={() => {
                    setActiveSlot(null);
                    setView('layout');
                  }}
                  className="mt-2 text-sm text-primary hover:text-primary-hover transition-colors"
                >
                  ← Cancel
                </button>
              </div>
            )}
            <ChannelList
              channels={channels}
              onChannelSelect={handleChannelSelect}
              selectedChannelId={activeSlot ? slotAssignments[activeSlot] : null}
              onRefresh={handleRefreshChannels}
              isRefreshing={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
