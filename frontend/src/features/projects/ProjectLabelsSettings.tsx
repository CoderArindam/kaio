import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Tag,
  Search,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { getBoardLabels, createLabel, updateLabel, deleteLabel, type Label } from '../../services/labelsApi';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#64748B', // Slate
  '#14B8A6', // Teal
  '#84CC16', // Lime
  '#D946EF', // Fuchsia
];

export const ProjectLabelsSettings: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const parsedBoardId = boardId ? parseInt(boardId, 10) : null;

  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete modal state
  const [labelToDelete, setLabelToDelete] = useState<Label | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadLabels = async () => {
    if (!parsedBoardId) return;
    setIsLoading(true);
    try {
      const data = await getBoardLabels(parsedBoardId);
      setLabels(data);
    } catch (error) {
      console.error('Failed to load project labels:', error);
      toast.error('Failed to load project labels');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLabels();
  }, [parsedBoardId]);

  const filteredLabels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return labels;
    return labels.filter((l) => l.name.toLowerCase().includes(q));
  }, [labels, searchQuery]);

  const handleOpenCreateModal = () => {
    setEditingLabel(null);
    setName('');
    setColor(PRESET_COLORS[0]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (label: Label) => {
    setEditingLabel(label);
    setName(label.name);
    setColor(label.color);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedBoardId || !name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingLabel) {
        await updateLabel(editingLabel.id, { name: name.trim(), color });
        toast.success('Label updated successfully');
      } else {
        await createLabel(parsedBoardId, { name: name.trim(), color });
        toast.success('Label created successfully');
      }
      setIsModalOpen(false);
      await loadLabels();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save label');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!labelToDelete) return;
    setIsDeleting(true);
    try {
      await deleteLabel(labelToDelete.id);
      toast.success('Label deleted');
      setLabelToDelete(null);
      await loadLabels();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete label');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-brand-border/40">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-6 h-6 text-brand-primary" />
            <h1 className="text-2xl font-bold text-brand-text">Project Labels</h1>
            <span className="ml-2 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-primary/10 text-brand-primary">
              {labels.length}
            </span>
          </div>
          <p className="text-sm text-brand-text-muted mt-1">
            Create, edit, and organize labels to tag and categorize tasks in this project.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus size={16} />
          <span>Create Label</span>
        </button>
      </div>

      {/* Toolbar & Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search labels by name..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-brand-surface-low border border-brand-border rounded-lg text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-brand-text-muted gap-3">
          <Loader2 size={32} className="animate-spin text-brand-primary" />
          <p className="text-sm">Loading project labels...</p>
        </div>
      ) : filteredLabels.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-16 bg-brand-surface/40 border border-dashed border-brand-border/60 rounded-xl text-center px-4">
          <Tag size={48} className="text-brand-text-muted mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-brand-text">
            {searchQuery ? 'No labels match your search' : 'No labels created yet'}
          </h3>
          <p className="text-sm text-brand-text-muted mt-1 max-w-md">
            {searchQuery
              ? 'Try searching for a different label name.'
              : 'Add labels to help group, filter, and track tasks effectively.'}
          </p>
          {!searchQuery && (
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              <span>Create Your First Label</span>
            </button>
          )}
        </div>
      ) : (
        /* Labels Grid / List */
        <div className="bg-brand-surface border border-brand-border/60 rounded-xl overflow-hidden shadow-sm divide-y divide-brand-border/40">
          {filteredLabels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between p-4 hover:bg-brand-surface-hover/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                {/* Live Badge Preview */}
                <span
                  className="px-3 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                  style={{
                    backgroundColor: `${label.color}1E`,
                    color: label.color,
                    border: `1px solid ${label.color}40`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </span>

                <span className="text-xs font-mono text-brand-text-muted">{label.color}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleOpenEditModal(label)}
                  className="p-2 text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low rounded-lg transition-colors"
                  title="Edit Label"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => setLabelToDelete(label)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete Label"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-brand-surface border border-brand-border rounded-xl shadow-2xl w-full max-w-md p-6 relative space-y-5">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-brand-text-muted hover:text-brand-text p-1 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>

            <div>
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <Tag size={20} className="text-brand-primary" />
                {editingLabel ? 'Edit Label' : 'Create New Label'}
              </h2>
              <p className="text-xs text-brand-text-muted mt-1">
                Customize the label name and color palette.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Preview */}
              <div className="p-3 bg-brand-surface-low rounded-lg border border-brand-border/40 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-text-muted">
                  Preview
                </span>
                <div>
                  <span
                    className="px-3 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                    style={{
                      backgroundColor: `${color}1E`,
                      color: color,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {name.trim() || 'Label Preview'}
                  </span>
                </div>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1.5">
                  Label Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bug, Feature, Urgent..."
                  required
                  autoFocus
                  className="w-full px-3 py-2 text-sm bg-brand-surface-low border border-brand-border rounded-lg text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1.5 flex items-center justify-between">
                  <span>Color Palette</span>
                  <span className="text-brand-text-muted font-mono">{color}</span>
                </label>

                {/* Preset Circles */}
                <div className="grid grid-cols-6 gap-2 mb-3">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-8 rounded-lg flex items-center justify-center transition-all ${
                        color.toLowerCase() === c.toLowerCase()
                          ? 'ring-2 ring-brand-primary scale-105 shadow-sm'
                          : 'hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color.toLowerCase() === c.toLowerCase() && (
                        <Check size={14} className="text-white drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Custom Hex Picker */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-9 h-9 rounded-lg border border-brand-border bg-transparent cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#3B82F6"
                    className="flex-1 px-3 py-1.5 text-xs font-mono bg-brand-surface-low border border-brand-border rounded-lg text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-hover rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-primary hover:bg-brand-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  <span>{editingLabel ? 'Save Changes' : 'Create Label'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {labelToDelete && (
        <ConfirmDialog
          isOpen={!!labelToDelete}
          title="Delete Label"
          description={`Are you sure you want to delete the label "${labelToDelete.name}"? It will be removed from all tasks across this project.`}
          confirmText="Delete Label"
          isDestructive={true}
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setLabelToDelete(null)}
        />
      )}
    </div>
  );
};
