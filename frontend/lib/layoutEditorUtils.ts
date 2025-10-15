import { CustomLayoutSlot } from '@/types';

// Canvas dimensions
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const ASPECT_RATIO = 16 / 9;

// Slot constraints
export const MIN_SLOT_WIDTH = 320;
export const MIN_SLOT_HEIGHT = 180;
export const MAX_SLOT_WIDTH = CANVAS_WIDTH;
export const MAX_SLOT_HEIGHT = CANVAS_HEIGHT;

// Grid snapping
export const GRID_SIZE = 20;

/**
 * Snap a value to the grid
 */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Update slot width while maintaining 16:9 aspect ratio
 */
export function updateSlotWidth(slot: CustomLayoutSlot, newWidth: number): CustomLayoutSlot {
  const clampedWidth = clamp(snapToGrid(newWidth), MIN_SLOT_WIDTH, MAX_SLOT_WIDTH);
  const newHeight = Math.round(clampedWidth / ASPECT_RATIO);

  return {
    ...slot,
    width: clampedWidth,
    height: clamp(newHeight, MIN_SLOT_HEIGHT, MAX_SLOT_HEIGHT),
  };
}

/**
 * Update slot height while maintaining 16:9 aspect ratio
 */
export function updateSlotHeight(slot: CustomLayoutSlot, newHeight: number): CustomLayoutSlot {
  const clampedHeight = clamp(snapToGrid(newHeight), MIN_SLOT_HEIGHT, MAX_SLOT_HEIGHT);
  const newWidth = Math.round(clampedHeight * ASPECT_RATIO);

  return {
    ...slot,
    width: clamp(newWidth, MIN_SLOT_WIDTH, MAX_SLOT_WIDTH),
    height: clampedHeight,
  };
}

/**
 * Scale slot uniformly (for pinch gesture)
 */
export function scaleSlot(slot: CustomLayoutSlot, scaleFactor: number): CustomLayoutSlot {
  const newWidth = slot.width * scaleFactor;
  return updateSlotWidth(slot, newWidth);
}

/**
 * Update slot position with bounds checking and grid snapping
 */
export function updateSlotPosition(
  slot: CustomLayoutSlot,
  newX: number,
  newY: number
): CustomLayoutSlot {
  const snappedX = snapToGrid(newX);
  const snappedY = snapToGrid(newY);

  // Ensure slot doesn't go out of bounds
  const clampedX = clamp(snappedX, 0, CANVAS_WIDTH - slot.width);
  const clampedY = clamp(snappedY, 0, CANVAS_HEIGHT - slot.height);

  return {
    ...slot,
    x: clampedX,
    y: clampedY,
  };
}

/**
 * Sort slots by size (largest first) for z-ordering
 */
export function sortSlotsBySize(slots: CustomLayoutSlot[]): CustomLayoutSlot[] {
  return [...slots].sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

/**
 * Get a unique color for each slot (for visual differentiation)
 */
export function getSlotColor(index: number): string {
  const colors = [
    'bg-blue-500/30 border-blue-500',
    'bg-green-500/30 border-green-500',
    'bg-purple-500/30 border-purple-500',
    'bg-orange-500/30 border-orange-500',
    'bg-pink-500/30 border-pink-500',
  ];
  return colors[index % colors.length];
}

/**
 * Convert canvas coordinates to display coordinates
 */
export function canvasToDisplay(
  coord: number,
  canvasSize: number,
  displaySize: number
): number {
  return (coord / canvasSize) * displaySize;
}

/**
 * Convert display coordinates to canvas coordinates
 */
export function displayToCanvas(
  coord: number,
  displaySize: number,
  canvasSize: number
): number {
  return (coord / displaySize) * canvasSize;
}

/**
 * Generate a unique slot ID
 */
export function generateSlotId(): string {
  return `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new slot at default position (center, half max size)
 */
export function createDefaultSlot(name: string): CustomLayoutSlot {
  const width = 960; // Half of 1920
  const height = 540; // Half of 1080

  return {
    id: generateSlotId(),
    name,
    x: (CANVAS_WIDTH - width) / 2, // Center X
    y: (CANVAS_HEIGHT - height) / 2, // Center Y
    width,
    height,
    border: false, // No border by default
  };
}

/**
 * Calculate distance between two points (for pinch gesture)
 */
export function getDistance(touch1: React.Touch, touch2: React.Touch): number {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get center point between two touches (for pinch gesture)
 */
export function getTouchCenter(touch1: React.Touch, touch2: React.Touch): { x: number; y: number } {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

/**
 * Validate and fix slot positions to ensure they're within canvas bounds
 */
export function validateSlotPosition(slot: CustomLayoutSlot): CustomLayoutSlot {
  let { x, y } = slot;
  const { width, height } = slot;

  // Clamp slot dimensions first if they exceed canvas
  const clampedWidth = Math.min(width, CANVAS_WIDTH);
  const clampedHeight = Math.min(height, CANVAS_HEIGHT);

  // Ensure slot is within canvas bounds
  if (x + clampedWidth > CANVAS_WIDTH) {
    x = CANVAS_WIDTH - clampedWidth;
  }
  if (y + clampedHeight > CANVAS_HEIGHT) {
    y = CANVAS_HEIGHT - clampedHeight;
  }
  if (x < 0) {
    x = 0;
  }
  if (y < 0) {
    y = 0;
  }

  // Snap to grid
  x = snapToGrid(x);
  y = snapToGrid(y);

  return {
    ...slot,
    x,
    y,
    width: clampedWidth,
    height: clampedHeight,
    border: slot.border ?? false, // Preserve border setting, default to false for old layouts
  };
}

/**
 * Validate all slots in a layout and fix any out-of-bounds positions
 */
export function validateAllSlots(slots: CustomLayoutSlot[]): CustomLayoutSlot[] {
  return slots.map(validateSlotPosition);
}
