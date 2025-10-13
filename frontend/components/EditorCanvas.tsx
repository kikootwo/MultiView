'use client';

import { CustomLayoutSlot } from '@/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, sortSlotsBySize } from '@/lib/layoutEditorUtils';
import StreamSlot from './StreamSlot';
import { useState, useRef, useEffect } from 'react';

interface EditorCanvasProps {
  slots: CustomLayoutSlot[];
  selectedSlotId: string | null;
  onSlotSelect: (slotId: string | null) => void;
  onSlotUpdate: (slotId: string, updatedSlot: CustomLayoutSlot) => void;
}

export default function EditorCanvas({
  slots,
  selectedSlotId,
  onSlotSelect,
  onSlotUpdate,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calculate scale factor to fit canvas in viewport
  useEffect(() => {
    const updateScale = () => {
      if (!canvasRef.current) return;

      const container = canvasRef.current.parentElement;
      if (!container) return;

      const containerWidth = container.clientWidth - 32; // Account for padding
      const containerHeight = container.clientHeight - 32;

      // Calculate scale to fit, maintaining 16:9 aspect ratio
      const scaleX = containerWidth / CANVAS_WIDTH;
      const scaleY = containerHeight / CANVAS_HEIGHT;
      const newScale = Math.min(scaleX, scaleY, 1); // Max scale of 1 (100%)

      setScale(newScale);
    };

    updateScale();

    // Use both resize and orientationchange
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', () => {
      // Delay to allow browser to settle after rotation
      setTimeout(updateScale, 100);
    });

    return () => {
      window.removeEventListener('resize', updateScale);
      window.removeEventListener('orientationchange', updateScale);
    };
  }, []);

  // Deselect when clicking canvas background
  const handleCanvasClick = () => {
    onSlotSelect(null);
  };

  // Sort slots by size for proper z-ordering (largest on bottom)
  const sortedSlots = sortSlotsBySize(slots);

  // Create a map to preserve original indices for colors
  const slotIndexMap = new Map(slots.map((slot, idx) => [slot.id, idx]));

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-900 overflow-auto p-4" style={{ userSelect: 'none', WebkitUserSelect: 'none', minHeight: 0 }}>
      <div
        ref={canvasRef}
        className="relative bg-black shadow-2xl flex-shrink-0"
        style={{
          width: `${CANVAS_WIDTH * scale}px`,
          height: `${CANVAS_HEIGHT * scale}px`,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onClick={handleCanvasClick}
      >
        {/* Grid overlay (subtle) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: `${20 * scale}px ${20 * scale}px`,
          }}
        />

        {/* Render slots in z-order (largest to smallest) */}
        {sortedSlots.map((slot) => (
          <StreamSlot
            key={slot.id}
            slot={slot}
            index={slotIndexMap.get(slot.id) || 0}
            selected={slot.id === selectedSlotId}
            scale={scale}
            onSelect={() => onSlotSelect(slot.id)}
            onUpdate={(updatedSlot) => onSlotUpdate(slot.id, updatedSlot)}
          />
        ))}

        {/* Empty state */}
        {slots.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-center p-8">
            <div>
              <p className="text-lg font-medium">No slots yet</p>
              <p className="text-sm mt-2">Tap &quot;Add Slot&quot; to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
