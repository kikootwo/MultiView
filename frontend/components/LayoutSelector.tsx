'use client';

import { LayoutType } from '@/types';
import { LAYOUT_DEFINITIONS } from '@/lib/layouts';

interface LayoutSelectorProps {
  selectedLayout: LayoutType;
  onLayoutSelect: (layout: LayoutType) => void;
}

export default function LayoutSelector({
  selectedLayout,
  onLayoutSelect,
}: LayoutSelectorProps) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4 text-foreground">Select Layout</h2>
      <div className="grid grid-cols-2 gap-3">
        {LAYOUT_DEFINITIONS.map((layout) => (
          <button
            key={layout.type}
            onClick={() => onLayoutSelect(layout.type)}
            className={`p-4 rounded-lg border-2 transition-all shadow-sm hover:shadow-md ${
              selectedLayout === layout.type
                ? 'border-primary bg-gradient-to-br from-primary/10 to-accent/10 shadow-md'
                : 'border-card-border hover:border-primary'
            }`}
          >
            <div className="mb-2">
              {/* Layout visual preview */}
              <LayoutPreview type={layout.type} selected={selectedLayout === layout.type} />
            </div>
            <div className="text-sm font-medium text-foreground">{layout.name}</div>
            <div className="text-xs text-muted mt-1">{layout.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Visual preview of layout types
 */
function LayoutPreview({ type, selected }: { type: LayoutType; selected: boolean }) {
  const bgClass = selected ? 'bg-card-border' : 'bg-background';
  const previewClass = selected ? 'bg-gradient-to-br from-primary to-accent rounded' : 'bg-muted rounded';

  switch (type) {
    case 'pip':
      return (
        <div className={`w-full h-16 ${bgClass} rounded relative`}>
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute bottom-3 right-3 w-6 h-6 ${previewClass} border-2 border-card`} />
        </div>
      );

    case 'split_h':
      return (
        <div className={`w-full h-16 ${bgClass} rounded p-1 flex gap-1`}>
          <div className={`flex-1 ${previewClass}`} />
          <div className={`flex-1 ${previewClass}`} />
        </div>
      );

    case 'split_v':
      return (
        <div className={`w-full h-16 ${bgClass} rounded p-1 flex flex-col gap-1`}>
          <div className={`flex-1 ${previewClass}`} />
          <div className={`flex-1 ${previewClass}`} />
        </div>
      );

    case 'grid_2x2':
      return (
        <div className={`w-full h-16 ${bgClass} rounded p-1 grid grid-cols-2 grid-rows-2 gap-1`}>
          <div className={previewClass} />
          <div className={previewClass} />
          <div className={previewClass} />
          <div className={previewClass} />
        </div>
      );

    case 'multi_pip_2':
      return (
        <div className={`w-full h-16 ${bgClass} rounded relative`}>
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute bottom-3 right-3 w-5 h-5 ${previewClass} border border-card`} />
          <div className={`absolute bottom-3 right-9 w-5 h-5 ${previewClass} border border-card`} />
        </div>
      );

    case 'multi_pip_3':
      return (
        <div className={`w-full h-16 ${bgClass} rounded relative`}>
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute bottom-3 right-3 w-4 h-4 ${previewClass} border border-card`} />
          <div className={`absolute bottom-3 right-8 w-4 h-4 ${previewClass} border border-card`} />
          <div className={`absolute bottom-3 right-13 w-4 h-4 ${previewClass} border border-card`} />
        </div>
      );

    case 'multi_pip_4':
      return (
        <div className={`w-full h-16 ${bgClass} rounded relative`}>
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute top-3 right-3 w-4 h-4 ${previewClass} border border-card`} />
          <div className={`absolute top-3 right-8 w-4 h-4 ${previewClass} border border-card`} />
          <div className={`absolute bottom-3 right-3 w-4 h-4 ${previewClass} border border-card`} />
          <div className={`absolute bottom-3 right-8 w-4 h-4 ${previewClass} border border-card`} />
        </div>
      );

    default:
      return <div className={`w-full h-16 ${previewClass}`} />;
  }
}
