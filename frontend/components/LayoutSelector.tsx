'use client';

import { useState, useEffect } from 'react';
import { LayoutType, CustomLayout } from '@/types';
import { LAYOUT_DEFINITIONS } from '@/lib/layouts';
import { loadCustomLayouts, deleteCustomLayout } from '@/lib/customLayouts';
import { Plus, Edit, Trash2 } from 'lucide-react';
import LayoutEditor from './LayoutEditor';

interface LayoutSelectorProps {
  selectedLayout: LayoutType;
  selectedCustomLayoutId?: string | null;
  onLayoutSelect: (layout: LayoutType, customLayoutId?: string) => void;
}

export default function LayoutSelector({
  selectedLayout,
  selectedCustomLayoutId,
  onLayoutSelect,
}: LayoutSelectorProps) {
  const [customLayouts, setCustomLayouts] = useState<CustomLayout[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<string | undefined>(undefined);

  // Load custom layouts on mount and when editor closes
  useEffect(() => {
    refreshCustomLayouts();
  }, []);

  const refreshCustomLayouts = () => {
    setCustomLayouts(loadCustomLayouts());
  };

  const handleCreateNew = () => {
    setEditingLayoutId(undefined);
    setShowEditor(true);
  };

  const handleEdit = (layoutId: string) => {
    setEditingLayoutId(layoutId);
    setShowEditor(true);
  };

  const handleDelete = (layoutId: string) => {
    if (confirm('Are you sure you want to delete this custom layout?')) {
      deleteCustomLayout(layoutId);
      refreshCustomLayouts();

      // Deselect if deleted layout was selected
      if (selectedCustomLayoutId === layoutId) {
        onLayoutSelect('pip');
      }
    }
  };

  const handleEditorClose = () => {
    setShowEditor(false);
    setEditingLayoutId(undefined);
    refreshCustomLayouts();
  };

  return (
    <>
      <div className="p-4">
        {/* Base Layouts */}
        <h2 className="text-lg font-semibold mb-4 text-foreground">Base Layouts</h2>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {LAYOUT_DEFINITIONS.map((layout) => (
            <button
              key={layout.type}
              onClick={() => onLayoutSelect(layout.type)}
              className={`p-4 rounded-lg border-2 transition-all shadow-sm hover:shadow-md ${
                selectedLayout === layout.type && !selectedCustomLayoutId
                  ? 'border-primary bg-gradient-to-br from-primary/10 to-accent/10 shadow-md'
                  : 'border-card-border hover:border-primary'
              }`}
            >
              <div className="mb-2">
                <LayoutPreview
                  type={layout.type}
                  selected={selectedLayout === layout.type && !selectedCustomLayoutId}
                />
              </div>
              <div className="text-sm font-medium text-foreground">{layout.name}</div>
              <div className="text-xs text-muted mt-1">{layout.description}</div>
            </button>
          ))}
        </div>

        {/* Custom Layouts */}
        <div className="border-t border-card-border pt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Custom Layouts</h2>
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium touch-manipulation"
              style={{ minHeight: '44px' }}
            >
              <Plus size={16} />
              Create New
            </button>
          </div>

          {customLayouts.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <p className="text-sm">No custom layouts yet</p>
              <p className="text-xs mt-1">Create your first custom layout!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {customLayouts.map((layout) => (
                <div
                  key={layout.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedCustomLayoutId === layout.id
                      ? 'border-primary bg-gradient-to-br from-primary/10 to-accent/10'
                      : 'border-card-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => onLayoutSelect('custom', layout.id)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-foreground">{layout.name}</div>
                      <div className="text-xs text-muted mt-1">
                        {layout.slots.length} slot{layout.slots.length !== 1 ? 's' : ''}
                      </div>
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(layout.id)}
                        className="p-2 hover:bg-primary/10 rounded-lg transition-colors touch-manipulation"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                        title="Edit"
                      >
                        <Edit size={16} className="text-primary" />
                      </button>
                      <button
                        onClick={() => handleDelete(layout.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors touch-manipulation"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                        title="Delete"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Layout Editor Modal */}
      {showEditor && (
        <LayoutEditor
          layoutId={editingLayoutId}
          onClose={handleEditorClose}
          onSave={handleEditorClose}
        />
      )}
    </>
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

    case 'dvd_pip':
      return (
        <div className={`w-full h-16 ${bgClass} rounded relative`}>
          <div className={`absolute inset-2 ${previewClass}`} />
          {/* Show inset in center-ish position to suggest movement */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 ${previewClass} border-2 border-card`} />
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
