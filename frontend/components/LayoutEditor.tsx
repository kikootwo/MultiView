'use client';

import { useState, useEffect } from 'react';
import { CustomLayout, CustomLayoutSlot } from '@/types';
import { createDefaultSlot, validateAllSlots, updateSlotPosition } from '@/lib/layoutEditorUtils';
import { saveCustomLayout, updateCustomLayout, getCustomLayoutById, validateCustomLayout } from '@/lib/customLayouts';
import EditorCanvas from './EditorCanvas';
import { X, Plus, Save, Trash2 } from 'lucide-react';

interface LayoutEditorProps {
  layoutId?: string; // If provided, load existing layout for editing
  onClose: () => void;
  onSave: () => void;
}

export default function LayoutEditor({ layoutId, onClose, onSave }: LayoutEditorProps) {
  const [layoutName, setLayoutName] = useState('');
  const [slots, setSlots] = useState<CustomLayoutSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing layout if editing
  useEffect(() => {
    if (layoutId) {
      const existing = getCustomLayoutById(layoutId);
      if (existing) {
        setLayoutName(existing.name);
        // Validate slots on load to fix any out-of-bounds positions
        setSlots(validateAllSlots(existing.slots));
      }
    }
  }, [layoutId]);

  // Validate slots on orientation/window changes
  useEffect(() => {
    const handleOrientationChange = () => {
      // Wait for layout to settle after orientation change
      setTimeout(() => {
        setSlots(prevSlots => validateAllSlots(prevSlots));
      }, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  // Add a new slot
  const handleAddSlot = () => {
    if (slots.length >= 5) {
      setError('Maximum 5 slots allowed');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const newSlot = createDefaultSlot(`Slot ${slots.length + 1}`);
    setSlots([...slots, newSlot]);
    setSelectedSlotId(newSlot.id);
  };

  // Update a slot
  const handleSlotUpdate = (slotId: string, updatedSlot: CustomLayoutSlot) => {
    setSlots(slots.map((s) => (s.id === slotId ? updatedSlot : s)));
  };

  // Delete a slot
  const handleSlotDelete = () => {
    if (!selectedSlotId) return;
    setSlots(slots.filter((s) => s.id !== selectedSlotId));
    setSelectedSlotId(null);
  };

  // Update slot name
  const handleSlotNameChange = (name: string) => {
    if (!selectedSlotId) return;
    setSlots(slots.map((s) => (s.id === selectedSlotId ? { ...s, name } : s)));
  };

  // Toggle slot border
  const handleSlotBorderToggle = (border: boolean) => {
    if (!selectedSlotId) return;
    setSlots(slots.map((s) => (s.id === selectedSlotId ? { ...s, border } : s)));
  };

  // Update slot width (maintains 16:9 aspect ratio) - only on blur
  const handleSlotWidthBlur = (width: number) => {
    if (!selectedSlotId) return;
    const clampedWidth = Math.max(320, Math.min(1920, width));
    const newHeight = Math.round(clampedWidth / (16/9));
    setSlots(slots.map((s) => {
      if (s.id === selectedSlotId) {
        const updatedSlot = { ...s, width: clampedWidth, height: newHeight };
        // Validate position to keep slot within bounds after resize
        return updateSlotPosition(updatedSlot, updatedSlot.x, updatedSlot.y);
      }
      return s;
    }));
  };

  // Update slot height (maintains 16:9 aspect ratio) - only on blur
  const handleSlotHeightBlur = (height: number) => {
    if (!selectedSlotId) return;
    const clampedHeight = Math.max(180, Math.min(1080, height));
    const newWidth = Math.round(clampedHeight * (16/9));
    setSlots(slots.map((s) => {
      if (s.id === selectedSlotId) {
        const updatedSlot = { ...s, width: newWidth, height: clampedHeight };
        // Validate position to keep slot within bounds after resize
        return updateSlotPosition(updatedSlot, updatedSlot.x, updatedSlot.y);
      }
      return s;
    }));
  };

  // Temporary state for editing width/height
  const [editingWidth, setEditingWidth] = useState<string>('');
  const [editingHeight, setEditingHeight] = useState<string>('');
  const [isEditingWidth, setIsEditingWidth] = useState(false);
  const [isEditingHeight, setIsEditingHeight] = useState(false);

  // Get currently selected slot
  const selectedSlot = slots.find(s => s.id === selectedSlotId);

  // Save layout
  const handleSave = () => {
    // Validate
    if (!layoutName.trim()) {
      setError('Please enter a layout name');
      return;
    }

    if (slots.length === 0) {
      setError('Please add at least one slot');
      return;
    }

    const layout: CustomLayout = {
      id: layoutId || `custom_${Date.now()}`,
      name: layoutName.trim(),
      type: 'custom',
      slots,
      createdAt: Date.now(),
    };

    const validation = validateCustomLayout(layout);
    if (!validation.valid) {
      setError(validation.error || 'Invalid layout');
      return;
    }

    // Save to localStorage
    try {
      if (layoutId) {
        updateCustomLayout(layout);
      } else {
        saveCustomLayout(layout);
      }

      onSave();
      onClose();
    } catch (err) {
      setError('Failed to save layout');
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Toolbar */}
      <div className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] text-white shadow-lg flex-shrink-0">
        <div className="px-4 py-3 flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-manipulation"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <X size={24} />
          </button>

          <input
            type="text"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            placeholder="Layout name"
            className="flex-1 bg-white/10 text-white px-4 py-2 rounded-lg border-2 border-white/20 focus:border-primary focus:outline-none touch-manipulation"
            style={{ minHeight: '44px' }}
          />

          <button
            onClick={handleAddSlot}
            disabled={slots.length >= 5}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors touch-manipulation font-medium"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Add Slot</span>
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors touch-manipulation font-medium"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <Save size={20} />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-500/20 border-l-4 border-red-500 p-3">
            <p className="text-sm font-medium text-white">{error}</p>
          </div>
        )}

        {/* Info banner */}
        <div className="bg-primary/20 border-l-4 border-primary p-3">
          <p className="text-xs text-white/80">
            {slots.length}/5 slots • Drag to move • Pinch to resize • Tap to select
          </p>
        </div>
      </div>

      {/* Canvas */}
      <EditorCanvas
        slots={slots}
        selectedSlotId={selectedSlotId}
        onSlotSelect={setSelectedSlotId}
        onSlotUpdate={handleSlotUpdate}
      />

      {/* Slot Controls - Below Canvas (scrollable if needed) */}
      {selectedSlot && (
        <div className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] text-white p-4 flex-shrink-0 border-t border-white/10 overflow-y-auto" style={{ maxHeight: '40vh' }}>
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="text-sm font-medium text-white/70">
              Selected Slot: {selectedSlot.name}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Name Input */}
              <div>
                <label className="block text-xs text-white/70 mb-2">Slot Name</label>
                <input
                  type="text"
                  value={selectedSlot.name}
                  onChange={(e) => handleSlotNameChange(e.target.value)}
                  className="w-full bg-white/10 text-white px-3 py-2 rounded-lg border-2 border-white/20 focus:border-primary focus:outline-none"
                  placeholder="Slot name"
                  style={{ minHeight: '44px' }}
                />
              </div>

              {/* Width Input */}
              <div>
                <label className="block text-xs text-white/70 mb-2">Width (px)</label>
                <input
                  type="number"
                  min="320"
                  max="1920"
                  step="20"
                  value={isEditingWidth ? editingWidth : selectedSlot.width}
                  onChange={(e) => {
                    setIsEditingWidth(true);
                    setEditingWidth(e.target.value);
                  }}
                  onFocus={() => {
                    setIsEditingWidth(true);
                    setEditingWidth(selectedSlot.width.toString());
                  }}
                  onBlur={() => {
                    setIsEditingWidth(false);
                    handleSlotWidthBlur(parseInt(editingWidth) || 320);
                  }}
                  className="w-full bg-white/10 text-white px-3 py-2 rounded-lg border-2 border-white/20 focus:border-primary focus:outline-none"
                  style={{ minHeight: '44px' }}
                />
              </div>

              {/* Height Input */}
              <div>
                <label className="block text-xs text-white/70 mb-2">Height (px)</label>
                <input
                  type="number"
                  min="180"
                  max="1080"
                  step="20"
                  value={isEditingHeight ? editingHeight : selectedSlot.height}
                  onChange={(e) => {
                    setIsEditingHeight(true);
                    setEditingHeight(e.target.value);
                  }}
                  onFocus={() => {
                    setIsEditingHeight(true);
                    setEditingHeight(selectedSlot.height.toString());
                  }}
                  onBlur={() => {
                    setIsEditingHeight(false);
                    handleSlotHeightBlur(parseInt(editingHeight) || 180);
                  }}
                  className="w-full bg-white/10 text-white px-3 py-2 rounded-lg border-2 border-white/20 focus:border-primary focus:outline-none"
                  style={{ minHeight: '44px' }}
                />
              </div>
            </div>

            {/* Quick Size Presets */}
            <div>
              <label className="block text-xs text-white/70 mb-2">Quick Sizes</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  onClick={() => handleSlotWidthBlur(1920)}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors text-xs font-medium"
                  style={{ minHeight: '44px' }}
                >
                  100%<br/>1920×1080
                </button>
                <button
                  onClick={() => handleSlotWidthBlur(1280)}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors text-xs font-medium"
                  style={{ minHeight: '44px' }}
                >
                  67%<br/>1280×720
                </button>
                <button
                  onClick={() => handleSlotWidthBlur(960)}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors text-xs font-medium"
                  style={{ minHeight: '44px' }}
                >
                  50%<br/>960×540
                </button>
                <button
                  onClick={() => handleSlotWidthBlur(640)}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors text-xs font-medium"
                  style={{ minHeight: '44px' }}
                >
                  33%<br/>640×360
                </button>
                <button
                  onClick={() => handleSlotWidthBlur(480)}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors text-xs font-medium"
                  style={{ minHeight: '44px' }}
                >
                  25%<br/>480×270
                </button>
              </div>
            </div>

            {/* Border Toggle */}
            <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
              <input
                type="checkbox"
                id="slot-border"
                checked={selectedSlot.border}
                onChange={(e) => handleSlotBorderToggle(e.target.checked)}
                className="w-6 h-6 rounded border-2 border-white/20 bg-white/10 checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              />
              <label htmlFor="slot-border" className="text-sm text-white cursor-pointer flex-1">
                Show white border around slot
              </label>
            </div>

            {/* Delete Button */}
            <button
              onClick={handleSlotDelete}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              style={{ minHeight: '44px' }}
            >
              <Trash2 size={20} />
              Delete Slot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
