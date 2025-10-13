# Custom Layout Builder - Implementation Plan

## Overview
Allow users to create custom stream layouts with drag, pinch-to-scale, and save to localStorage.

## Data Structure

```typescript
interface CustomLayoutSlot {
  id: string;              // Unique slot ID
  name: string;            // User-defined name (e.g., "Main Camera")
  x: number;               // X position in pixels (0-1920, snap to 20px grid)
  y: number;               // Y position in pixels (0-1080, snap to 20px grid)
  width: number;           // Width in pixels (320-1920, maintains 16:9)
  height: number;          // Height in pixels (180-1080, maintains 16:9)
}

interface CustomLayout {
  id: string;              // UUID
  name: string;            // User-defined layout name
  type: 'custom';          // Always 'custom' to distinguish from base layouts
  slots: CustomLayoutSlot[];
  createdAt: number;       // Timestamp
}
```

## Backend Changes

### New Function: `build_custom_layout_filter(slots: list) -> str`
- Takes array of slot definitions with x, y, width, height
- Generates FFmpeg filter_complex dynamically
- Sort slots by size (largest first) for z-ordering
- Process:
  1. Scale each input to slot dimensions: `[N:v]scale=W:H,setsar=1[sN]`
  2. Create black 1920x1080 base: `color=c=black:s=1920x1080[base]`
  3. Chain overlays in size order: `[base][s0]overlay=X:Y[tmp0]`
  4. Final output labeled `[v]`

### Update `/api/layout/set`
- Accept `layout.type === 'custom'` with embedded slot definitions
- Validate custom layouts:
  - All slots within bounds (0-1920, 0-1080)
  - Minimum size 320x180, maximum 1920x1080
  - 1-5 slots maximum
- Pass to `build_custom_layout_filter()` if custom

### Update `LAYOUT_SLOTS` handling
- For custom layouts, extract slot IDs dynamically from config
- Audio source validation uses custom slot list

## Frontend - Storage

### localStorage utility (`lib/customLayouts.ts`)
```typescript
const STORAGE_KEY = 'multiview_custom_layouts';

saveCustomLayout(layout: CustomLayout): void
loadCustomLayouts(): CustomLayout[]
deleteCustomLayout(id: string): void
updateCustomLayout(layout: CustomLayout): void
```

## Frontend - Components

### 1. `LayoutEditor` (new page/modal)
- Full-screen editor with 16:9 canvas
- Toolbar at top: layout name input, "Add Slot", "Save", "Cancel"
- Canvas container maintains aspect ratio, scales to fit screen
- Coordinate system: internal 1920x1080, scales for display

### 2. `EditorCanvas`
- 16:9 div with black background
- Renders all StreamSlot components
- Handles canvas-level touch events (deselect)
- Shows grid lines (optional, subtle)

### 3. `StreamSlot`
- Positioned absolutely within canvas (transform: translate + scale)
- Color-coded background (unique per slot)
- Displays slot name
- Touch gestures:
  - **Single touch drag**: Move slot, snap to 20px grid
  - **Pinch**: Scale uniformly (maintains 16:9)
  - **Tap**: Select slot (show border + controls)
- When selected: shows trash icon, name edit field
- Clamps position/size to min/max bounds

### 4. Update `LayoutSelector`
- New section: "Custom Layouts" below base layouts
- Each custom layout shows: name, edit button, delete button
- "Create New Layout" button opens LayoutEditor
- Edit button opens LayoutEditor with layout data pre-loaded

## User Flow

### Creating Custom Layout
1. User taps "Create Custom Layout" in LayoutSelector
2. LayoutEditor opens with empty black canvas
3. User taps "Add Slot" → new slot appears at center (960x540)
4. User drags slot to position (snaps to grid)
5. User pinches slot to resize (maintains 16:9)
6. User taps slot → edits name, or deletes
7. Repeat for up to 5 slots
8. User enters layout name, taps "Save"
9. Layout saved to localStorage, returns to LayoutSelector
10. Custom layout appears in selector, ready to use

### Using Custom Layout
1. User selects custom layout from LayoutSelector
2. SlotAssignment shows custom slot names
3. User assigns channels to slots normally
4. Apply sends custom layout definition to backend
5. Backend generates filter and starts stream

### Editing Custom Layout
1. User taps edit icon on custom layout
2. LayoutEditor opens with existing slots loaded
3. User modifies slots, saves changes
4. localStorage updated, UI refreshes

## Technical Details

### Grid Snapping (20px)
```typescript
const snap = (value: number) => Math.round(value / 20) * 20;
```

### 16:9 Aspect Lock
```typescript
const updateWidth = (width: number) => {
  slot.width = clamp(width, 320, 1920);
  slot.height = Math.round(slot.width / (16/9));
};
```

### Z-Order by Size
```typescript
const sortedSlots = [...slots].sort((a, b) =>
  (b.width * b.height) - (a.width * a.height)
);
```

### Coordinate Translation (display ↔ canvas)
```typescript
const canvasToDisplay = (coord: number, canvasSize: number, displaySize: number) =>
  (coord / canvasSize) * displaySize;
```
