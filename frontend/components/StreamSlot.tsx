'use client';

import { CustomLayoutSlot } from '@/types';
import { getSlotColor, updateSlotPosition, updateSlotWidth } from '@/lib/layoutEditorUtils';
import { useState, useRef, useEffect } from 'react';

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | null;

interface StreamSlotProps {
  slot: CustomLayoutSlot;
  index: number;
  selected: boolean;
  scale: number; // Display scale factor (canvas to screen)
  onSelect: () => void;
  onUpdate: (slot: CustomLayoutSlot) => void;
}

export default function StreamSlot({
  slot,
  index,
  selected,
  scale,
  onSelect,
  onUpdate,
}: StreamSlotProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null);
  const dragStartRef = useRef<{ x: number; y: number; slotX: number; slotY: number } | null>(null);
  const resizeStartRef = useRef<{
    x: number;
    y: number;
    slotX: number;
    slotY: number;
    slotWidth: number;
    slotHeight: number;
  } | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  // Handle global mouse events for drag/resize
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isResizing && resizeStartRef.current && activeHandle) {
        e.preventDefault();
        // Resize gesture
        const deltaX = (e.clientX - resizeStartRef.current.x) / scale;
        const deltaY = (e.clientY - resizeStartRef.current.y) / scale;

        let newWidth = resizeStartRef.current.slotWidth;
        let newX = resizeStartRef.current.slotX;
        let newY = resizeStartRef.current.slotY;

        // Calculate new dimensions based on which handle is being dragged
        switch (activeHandle) {
          case 'br': // Bottom-right: increase width/height
            newWidth = resizeStartRef.current.slotWidth + deltaX;
            break;
          case 'bl': // Bottom-left: decrease width from left, increase height
            newWidth = resizeStartRef.current.slotWidth - deltaX;
            newX = resizeStartRef.current.slotX + deltaX;
            break;
          case 'tr': // Top-right: increase width, decrease height from top
            newWidth = resizeStartRef.current.slotWidth + deltaX;
            newY = resizeStartRef.current.slotY + deltaY;
            break;
          case 'tl': // Top-left: decrease both from top-left
            newWidth = resizeStartRef.current.slotWidth - deltaX;
            newX = resizeStartRef.current.slotX + deltaX;
            newY = resizeStartRef.current.slotY + deltaY;
            break;
        }

        // Apply width change (this maintains 16:9 aspect ratio)
        const updatedSlot = updateSlotWidth({ ...slot, x: newX, y: newY }, newWidth);

        // Ensure slot stays within canvas bounds
        const clampedSlot = updateSlotPosition(updatedSlot, updatedSlot.x, updatedSlot.y);
        onUpdate(clampedSlot);

      } else if (isDragging && dragStartRef.current) {
        e.preventDefault();
        // Drag gesture - move slot
        const deltaX = (e.clientX - dragStartRef.current.x) / scale;
        const deltaY = (e.clientY - dragStartRef.current.y) / scale;

        const newX = dragStartRef.current.slotX + deltaX;
        const newY = dragStartRef.current.slotY + deltaY;

        const updatedSlot = updateSlotPosition(slot, newX, newY);
        onUpdate(updatedSlot);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setActiveHandle(null);
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, isResizing, activeHandle, scale, slot, onUpdate]);

  // Handle slot mouse down (drag)
  const handleSlotMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      slotX: slot.x,
      slotY: slot.y,
    };

    setIsDragging(true);
    onSelect();
  };

  // Handle slot touch start (drag)
  const handleSlotTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      dragStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        slotX: slot.x,
        slotY: slot.y,
      };

      setIsDragging(true);
      onSelect();
    }
  };

  // Handle resize handle mouse down
  const handleResizeMouseDown = (handle: ResizeHandle) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      slotX: slot.x,
      slotY: slot.y,
      slotWidth: slot.width,
      slotHeight: slot.height,
    };

    setIsResizing(true);
    setActiveHandle(handle);
    onSelect();
  };

  // Handle resize handle touch start
  const handleResizeTouchStart = (handle: ResizeHandle) => (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      resizeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        slotX: slot.x,
        slotY: slot.y,
        slotWidth: slot.width,
        slotHeight: slot.height,
      };

      setIsResizing(true);
      setActiveHandle(handle);
      onSelect();
    }
  };

  // Handle touch move (drag or resize)
  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];

    if (isResizing && resizeStartRef.current && activeHandle) {
      // Resize gesture
      const deltaX = (touch.clientX - resizeStartRef.current.x) / scale;
      const deltaY = (touch.clientY - resizeStartRef.current.y) / scale;

      let newWidth = resizeStartRef.current.slotWidth;
      let newX = resizeStartRef.current.slotX;
      let newY = resizeStartRef.current.slotY;

      // Calculate new dimensions based on which handle is being dragged
      switch (activeHandle) {
        case 'br': // Bottom-right: increase width/height
          newWidth = resizeStartRef.current.slotWidth + deltaX;
          break;
        case 'bl': // Bottom-left: decrease width from left, increase height
          newWidth = resizeStartRef.current.slotWidth - deltaX;
          newX = resizeStartRef.current.slotX + deltaX;
          break;
        case 'tr': // Top-right: increase width, decrease height from top
          newWidth = resizeStartRef.current.slotWidth + deltaX;
          newY = resizeStartRef.current.slotY + deltaY;
          break;
        case 'tl': // Top-left: decrease both from top-left
          newWidth = resizeStartRef.current.slotWidth - deltaX;
          newX = resizeStartRef.current.slotX + deltaX;
          newY = resizeStartRef.current.slotY + deltaY;
          break;
      }

      // Apply width change (this maintains 16:9 aspect ratio)
      const updatedSlot = updateSlotWidth({ ...slot, x: newX, y: newY }, newWidth);

      // Ensure slot stays within canvas bounds
      const clampedSlot = updateSlotPosition(updatedSlot, updatedSlot.x, updatedSlot.y);
      onUpdate(clampedSlot);

    } else if (isDragging && dragStartRef.current) {
      // Drag gesture - move slot
      const deltaX = (touch.clientX - dragStartRef.current.x) / scale;
      const deltaY = (touch.clientY - dragStartRef.current.y) / scale;

      const newX = dragStartRef.current.slotX + deltaX;
      const newY = dragStartRef.current.slotY + deltaY;

      const updatedSlot = updateSlotPosition(slot, newX, newY);
      onUpdate(updatedSlot);
    }
  };

  // Handle touch end
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();

    if (e.touches.length === 0) {
      setIsDragging(false);
      setIsResizing(false);
      setActiveHandle(null);
      dragStartRef.current = null;
      resizeStartRef.current = null;
    }
  };

  // Handle click to select
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  // Prevent context menu on long press
  const handleContextMenu = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
  };

  const colorClass = getSlotColor(index);
  const handleSize = 44; // Touch target size (44x44px)
  const handleOffset = handleSize / 2; // Half the handle size

  return (
    <div
      ref={slotRef}
      className={`absolute cursor-move touch-none select-none ${colorClass} ${
        selected ? 'border-4 ring-4 ring-white/50' : 'border-2'
      }`}
      style={{
        left: `${slot.x * scale}px`,
        top: `${slot.y * scale}px`,
        width: `${slot.width * scale}px`,
        height: `${slot.height * scale}px`,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onMouseDown={handleSlotMouseDown}
      onTouchStart={handleSlotTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Slot label */}
      <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium pointer-events-none">
        {slot.name}
      </div>

      {/* Size indicator */}
      <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs pointer-events-none">
        {slot.width}×{slot.height}
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="absolute top-2 right-2 bg-primary text-white px-2 py-1 rounded text-xs font-medium pointer-events-none">
          Selected
        </div>
      )}

      {/* Resize handles - only show when selected */}
      {selected && (
        <>
          {/* Top-left handle */}
          <div
            className="absolute cursor-nwse-resize z-10 flex items-center justify-center"
            style={{
              width: `${handleSize}px`,
              height: `${handleSize}px`,
              left: `-${handleOffset}px`,
              top: `-${handleOffset}px`,
              touchAction: 'none',
            }}
            onMouseDown={handleResizeMouseDown('tl')}
            onTouchStart={handleResizeTouchStart('tl')}
          >
            <div className="w-5 h-5 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border-2 border-primary/80 ring-2 ring-white/30" />
          </div>

          {/* Top-right handle */}
          <div
            className="absolute cursor-nesw-resize z-10 flex items-center justify-center"
            style={{
              width: `${handleSize}px`,
              height: `${handleSize}px`,
              right: `-${handleOffset}px`,
              top: `-${handleOffset}px`,
              touchAction: 'none',
            }}
            onMouseDown={handleResizeMouseDown('tr')}
            onTouchStart={handleResizeTouchStart('tr')}
          >
            <div className="w-5 h-5 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border-2 border-primary/80 ring-2 ring-white/30" />
          </div>

          {/* Bottom-left handle */}
          <div
            className="absolute cursor-nesw-resize z-10 flex items-center justify-center"
            style={{
              width: `${handleSize}px`,
              height: `${handleSize}px`,
              left: `-${handleOffset}px`,
              bottom: `-${handleOffset}px`,
              touchAction: 'none',
            }}
            onMouseDown={handleResizeMouseDown('bl')}
            onTouchStart={handleResizeTouchStart('bl')}
          >
            <div className="w-5 h-5 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border-2 border-primary/80 ring-2 ring-white/30" />
          </div>

          {/* Bottom-right handle */}
          <div
            className="absolute cursor-nwse-resize z-10 flex items-center justify-center"
            style={{
              width: `${handleSize}px`,
              height: `${handleSize}px`,
              right: `-${handleOffset}px`,
              bottom: `-${handleOffset}px`,
              touchAction: 'none',
            }}
            onMouseDown={handleResizeMouseDown('br')}
            onTouchStart={handleResizeTouchStart('br')}
          >
            <div className="w-5 h-5 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border-2 border-primary/80 ring-2 ring-white/30" />
          </div>
        </>
      )}
    </div>
  );
}
