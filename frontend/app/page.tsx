'use client';

import { useState, useEffect } from 'react';
import { Channel, LayoutType, CustomLayout } from '@/types';
import { api } from '@/lib/api';
import { getCustomLayoutById, loadCustomLayouts } from '@/lib/customLayouts';
import ChannelList from '@/components/ChannelList';
import LayoutSelector from '@/components/LayoutSelector';
import SlotAssignment from '@/components/SlotAssignment';
import StatusDisplay from '@/components/StatusDisplay';

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('pip');
  const [selectedCustomLayoutId, setSelectedCustomLayoutId] = useState<string | null>(null);
  const [selectedCustomLayout, setSelectedCustomLayout] = useState<CustomLayout | null>(null);
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

  const loadCurrentLayout = async () => {
    try {
      const layout = await api.getCurrentLayout();
      if (layout && layout.layout) {
        setSelectedLayout(layout.layout as LayoutType);
        setSlotAssignments(layout.streams || {});
        setAudioSource(layout.audio_source || null);

        // Handle custom layout restoration
        if (layout.layout === 'custom' && layout.custom_slots) {
          // Try to find matching custom layout in localStorage
          const customLayouts = loadCustomLayouts();

          // Match by comparing slot configurations
          const matchingLayout = customLayouts.find(cl => {
            if (!layout.custom_slots || cl.slots.length !== layout.custom_slots.length) return false;

            // Check if all slots match (by comparing id, x, y, width, height)
            return layout.custom_slots.every((apiSlot) => {
              const matchingSlot = cl.slots.find(s =>
                s.id === apiSlot.id &&
                s.x === apiSlot.x &&
                s.y === apiSlot.y &&
                s.width === apiSlot.width &&
                s.height === apiSlot.height
              );
              return !!matchingSlot;
            });
          });

          if (matchingLayout) {
            setSelectedCustomLayoutId(matchingLayout.id);
            setSelectedCustomLayout(matchingLayout);
          }
        }
      }
    } catch (err) {
      console.log('No active layout or failed to load:', err);
    }
  };

  const handleLayoutSelect = (layout: LayoutType, customLayoutId?: string) => {
    // User manually changed layout - clear assignments
    setSelectedLayout(layout);
    setSlotAssignments({});
    setAudioSource(null);
    setActiveSlot(null);

    // Handle custom layout selection
    if (layout === 'custom' && customLayoutId) {
      setSelectedCustomLayoutId(customLayoutId);
      const customLayout = getCustomLayoutById(customLayoutId);
      setSelectedCustomLayout(customLayout);
    } else {
      setSelectedCustomLayoutId(null);
      setSelectedCustomLayout(null);
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

  // Get list of channel IDs already assigned to OTHER slots (not the active one)
  const getAssignedChannelIds = (): string[] => {
    if (!activeSlot) return [];
    return Object.entries(slotAssignments)
      .filter(([slotId]) => slotId !== activeSlot)
      .map(([, channelId]) => channelId);
  };

  const handleAudioSourceChange = (slotId: string) => {
    setAudioSource(slotId);
  };

  const handleApplyLayout = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess('🔄 Starting stream...');

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
        setSuccess(null);
        setIsLoading(false);
        return;
      }

      // Prepare layout request
      interface LayoutRequest {
        layout: LayoutType;
        streams: Record<string, string>;
        audio_source: string;
        custom_slots?: Array<{id: string; name: string; x: number; y: number; width: number; height: number}>;
      }

      const layoutRequest: LayoutRequest = {
        layout: selectedLayout,
        streams,
        audio_source: audioSource,
      };

      // Include custom slots if it's a custom layout
      if (selectedLayout === 'custom' && selectedCustomLayout) {
        layoutRequest.custom_slots = selectedCustomLayout.slots;
      }

      // Send layout request
      await api.setLayout(layoutRequest);

      // Poll status until stream is confirmed running
      setSuccess('⏳ Connecting to streams...');

      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max

      const pollStatus = async (): Promise<boolean> => {
        try {
          const status = await api.getStatus();

          if (status.mode === 'live' && status.proc_running) {
            return true; // Stream is live!
          }

          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Stream startup timeout');
          }

          // Update progress message
          const elapsed = attempts;
          setSuccess(`⏳ Connecting to streams... (${elapsed}s)`);

          // Wait 1 second and try again
          await new Promise(resolve => setTimeout(resolve, 1000));
          return pollStatus();
        } catch {
          throw new Error('Failed to verify stream status');
        }
      };

      await pollStatus();

      setSuccess('⭐ Layout applied successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply layout';
      setError(errorMessage);
      setSuccess(null);
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
      // Clear the UI state
      setSlotAssignments({});
      setAudioSource(null);
      setActiveSlot(null);
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
            <p className="text-sm font-medium text-white">{success}</p>
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
                selectedCustomLayoutId={selectedCustomLayoutId}
                onLayoutSelect={handleLayoutSelect}
              />
              <div className="border-t border-card-border">
                <SlotAssignment
                  layoutType={selectedLayout}
                  customLayout={selectedCustomLayout}
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
              disabledChannelIds={getAssignedChannelIds()}
              onRefresh={handleRefreshChannels}
              isRefreshing={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
