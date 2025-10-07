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
      <h2 className="text-lg font-semibold mb-4 text-gray-900">Select Layout</h2>
      <div className="grid grid-cols-2 gap-3">
        {LAYOUT_DEFINITIONS.map((layout) => (
          <button
            key={layout.type}
            onClick={() => onLayoutSelect(layout.type)}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedLayout === layout.type
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="mb-2">
              {/* Layout visual preview */}
              <LayoutPreview type={layout.type} />
            </div>
            <div className="text-sm font-medium text-gray-900">{layout.name}</div>
            <div className="text-xs text-gray-500 mt-1">{layout.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Visual preview of layout types
 */
function LayoutPreview({ type }: { type: LayoutType }) {
  const previewClass = 'bg-gray-300 rounded';

  switch (type) {
    case 'pip':
      return (
        <div className="w-full h-16 bg-gray-200 rounded relative">
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute bottom-3 right-3 w-6 h-6 ${previewClass} border-2 border-white`} />
        </div>
      );

    case 'split_h':
      return (
        <div className="w-full h-16 flex gap-1">
          <div className={`flex-1 ${previewClass}`} />
          <div className={`flex-1 ${previewClass}`} />
        </div>
      );

    case 'split_v':
      return (
        <div className="w-full h-16 flex flex-col gap-1">
          <div className={`flex-1 ${previewClass}`} />
          <div className={`flex-1 ${previewClass}`} />
        </div>
      );

    case 'grid_2x2':
      return (
        <div className="w-full h-16 grid grid-cols-2 grid-rows-2 gap-1">
          <div className={previewClass} />
          <div className={previewClass} />
          <div className={previewClass} />
          <div className={previewClass} />
        </div>
      );

    case 'multi_pip_2':
      return (
        <div className="w-full h-16 bg-gray-200 rounded relative">
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute bottom-3 right-3 w-5 h-5 ${previewClass} border border-white`} />
          <div className={`absolute bottom-3 right-9 w-5 h-5 ${previewClass} border border-white`} />
        </div>
      );

    case 'multi_pip_3':
      return (
        <div className="w-full h-16 bg-gray-200 rounded relative">
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute bottom-3 right-3 w-4 h-4 ${previewClass} border border-white`} />
          <div className={`absolute bottom-3 right-8 w-4 h-4 ${previewClass} border border-white`} />
          <div className={`absolute bottom-3 right-13 w-4 h-4 ${previewClass} border border-white`} />
        </div>
      );

    case 'multi_pip_4':
      return (
        <div className="w-full h-16 bg-gray-200 rounded relative">
          <div className={`absolute inset-2 ${previewClass}`} />
          <div className={`absolute top-3 right-3 w-4 h-4 ${previewClass} border border-white`} />
          <div className={`absolute top-3 right-8 w-4 h-4 ${previewClass} border border-white`} />
          <div className={`absolute bottom-3 right-3 w-4 h-4 ${previewClass} border border-white`} />
          <div className={`absolute bottom-3 right-8 w-4 h-4 ${previewClass} border border-white`} />
        </div>
      );

    case 'grid_3x3':
      return (
        <div className="w-full h-16 grid grid-cols-3 grid-rows-3 gap-0.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={previewClass} />
          ))}
          {[...Array(4)].map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-100 rounded" />
          ))}
        </div>
      );

    default:
      return <div className={`w-full h-16 ${previewClass}`} />;
  }
}
