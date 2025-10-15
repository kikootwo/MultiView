import { LayoutType } from '@/types';

export interface LayoutDefinition {
  type: LayoutType;
  name: string;
  description: string;
  slots: string[]; // Array of slot IDs
  maxStreams: number;
}

export const LAYOUT_DEFINITIONS: LayoutDefinition[] = [
  {
    type: 'pip',
    name: 'Picture-in-Picture',
    description: '1 main stream + 1 small inset',
    slots: ['main', 'inset'],
    maxStreams: 2,
  },
  {
    type: 'split_h',
    name: 'Split Horizontal',
    description: '2 streams side-by-side',
    slots: ['left', 'right'],
    maxStreams: 2,
  },
  {
    type: 'split_v',
    name: 'Split Vertical',
    description: '2 streams stacked',
    slots: ['top', 'bottom'],
    maxStreams: 2,
  },
  {
    type: 'grid_2x2',
    name: '2x2 Grid',
    description: '4 equal streams',
    slots: ['slot1', 'slot2', 'slot3', 'slot4'],
    maxStreams: 4,
  },
  {
    type: 'multi_pip_2',
    name: 'Multi-PiP (2)',
    description: '1 main + 2 small insets',
    slots: ['main', 'inset1', 'inset2'],
    maxStreams: 3,
  },
  {
    type: 'multi_pip_3',
    name: 'Multi-PiP (3)',
    description: '1 main + 3 small insets',
    slots: ['main', 'inset1', 'inset2', 'inset3'],
    maxStreams: 4,
  },
  {
    type: 'multi_pip_4',
    name: 'Multi-PiP (4)',
    description: '1 main + 4 small insets',
    slots: ['main', 'inset1', 'inset2', 'inset3', 'inset4'],
    maxStreams: 5,
  },
  {
    type: 'dvd_pip',
    name: 'DVD Screensaver PiP',
    description: '1 main + 1 bouncing inset',
    slots: ['main', 'inset'],
    maxStreams: 2,
  },
];

/**
 * Get layout definition by type
 */
export function getLayoutDefinition(type: LayoutType): LayoutDefinition | undefined {
  return LAYOUT_DEFINITIONS.find(l => l.type === type);
}

/**
 * Get slot label for display
 */
export function getSlotLabel(slotId: string): string {
  // Convert slot IDs to friendly names
  const labels: Record<string, string> = {
    main: 'Main',
    inset: 'Inset',
    inset1: 'Inset 1',
    inset2: 'Inset 2',
    inset3: 'Inset 3',
    inset4: 'Inset 4',
    left: 'Left',
    right: 'Right',
    top: 'Top',
    bottom: 'Bottom',
    slot1: 'Slot 1',
    slot2: 'Slot 2',
    slot3: 'Slot 3',
    slot4: 'Slot 4',
  };
  return labels[slotId] || slotId;
}
