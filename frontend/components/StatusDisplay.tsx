'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface SystemStatus {
  proc_running: boolean;
  mode: 'black' | 'live';
  time_until_idle: number;
  connected_clients: number;
}

export default function StatusDisplay() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Poll status every 2 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await fetch(`${api.getBaseUrl()}/control/status`).then(r => r.json());
        setStatus(data);
        setCountdown(data.time_until_idle);
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Update countdown every second
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(Math.max(0, countdown - 1)), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-white text-opacity-70">
        <div className="w-2 h-2 bg-white bg-opacity-50 rounded-full animate-pulse"></div>
        <span>Loading...</span>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 text-sm flex-wrap text-white">
      {/* Mode indicator */}
      <div className="flex items-center gap-2">
        {status.mode === 'live' ? (
          <>
            <div className="relative">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75"></div>
            </div>
            <span className="font-semibold text-green-400">Live</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full"></div>
            <span className="font-medium text-white text-opacity-90">Standby</span>
          </>
        )}
      </div>

      {/* Active clients */}
      <div className="flex items-center gap-2 text-white text-opacity-90">
        <span>👥</span>
        <span className="font-medium">{status.connected_clients} viewer{status.connected_clients !== 1 ? 's' : ''}</span>
      </div>

      {/* Countdown timer (only show when live and no clients) */}
      {status.mode === 'live' && status.connected_clients === 0 && countdown > 0 && (
        <div className="flex items-center gap-2 text-red-400">
          <span>⏱️</span>
          <span className="font-mono font-medium">{formatTime(countdown)}</span>
        </div>
      )}
    </div>
  );
}
