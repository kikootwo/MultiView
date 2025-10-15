import { CustomLayout } from '@/types';

const STORAGE_KEY = 'multiview_custom_layouts';

/**
 * Load all custom layouts from localStorage
 */
export function loadCustomLayouts(): CustomLayout[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const layouts = JSON.parse(stored) as CustomLayout[];
    return layouts;
  } catch (error) {
    console.error('Failed to load custom layouts:', error);
    return [];
  }
}

/**
 * Save a new custom layout to localStorage
 */
export function saveCustomLayout(layout: CustomLayout): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = loadCustomLayouts();
    const updated = [...existing, layout];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save custom layout:', error);
    throw error;
  }
}

/**
 * Update an existing custom layout
 */
export function updateCustomLayout(layout: CustomLayout): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = loadCustomLayouts();
    const updated = existing.map(l => l.id === layout.id ? layout : l);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to update custom layout:', error);
    throw error;
  }
}

/**
 * Delete a custom layout by ID
 */
export function deleteCustomLayout(id: string): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = loadCustomLayouts();
    const updated = existing.filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to delete custom layout:', error);
    throw error;
  }
}

/**
 * Get a single custom layout by ID
 */
export function getCustomLayoutById(id: string): CustomLayout | null {
  const layouts = loadCustomLayouts();
  return layouts.find(l => l.id === id) || null;
}

/**
 * Validate custom layout slots
 */
export function validateCustomLayout(layout: CustomLayout): { valid: boolean; error?: string } {
  // Check slot count
  if (layout.slots.length < 1 || layout.slots.length > 5) {
    return { valid: false, error: 'Layout must have 1-5 slots' };
  }

  // Check each slot
  for (const slot of layout.slots) {
    // Check bounds
    if (slot.x < 0 || slot.x > 1920 || slot.y < 0 || slot.y > 1080) {
      return { valid: false, error: `Slot ${slot.name} is out of bounds` };
    }

    // Check size
    if (slot.width < 320 || slot.width > 1920 || slot.height < 180 || slot.height > 1080) {
      return { valid: false, error: `Slot ${slot.name} has invalid size` };
    }

    // Check aspect ratio (should be 16:9)
    const aspectRatio = slot.width / slot.height;
    if (Math.abs(aspectRatio - (16 / 9)) > 0.01) {
      return { valid: false, error: `Slot ${slot.name} must maintain 16:9 aspect ratio` };
    }

    // Check if slot extends beyond canvas
    if (slot.x + slot.width > 1920 || slot.y + slot.height > 1080) {
      return { valid: false, error: `Slot ${slot.name} extends beyond canvas` };
    }
  }

  return { valid: true };
}
