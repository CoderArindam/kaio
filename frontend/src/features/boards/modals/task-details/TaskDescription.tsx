import React, { useState, useEffect } from 'react';
import { AlignLeft, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Task } from '../../../../services/tasksApi';
import { useTaskStore } from '../../../../store/taskStore';
import MarkdownEditor from '../../../../components/shared/MarkdownEditor';

interface TaskDescriptionProps {
  task: Task;
  canEdit: boolean;
}

const TaskDescription: React.FC<TaskDescriptionProps> = ({ task, canEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(task.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const { updateTaskData } = useTaskStore();

  useEffect(() => {
    if (!isEditing) setEditDescription(task.description || "");
  }, [task.description, isEditing]);

  const handleSave = async () => {
    if (editDescription === (task.description || "")) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    await updateTaskData(task.id, { description: editDescription });
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditDescription(task.description || "");
    setIsEditing(false);
  };

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold mb-3 text-brand-text">
        <AlignLeft size={18} />
        Description
      </h2>

      {isEditing ? (
        <div className="space-y-3">
          <MarkdownEditor
            autoFocus
            value={editDescription}
            onChange={setEditDescription}
            rows={5}
            placeholder="Add a more detailed description..."
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleCancel();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 rounded-lg text-sm border border-brand-border bg-brand-surface hover:bg-brand-surface-low transition text-brand-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div 
          onClick={() => canEdit && setIsEditing(true)}
          className={`bg-brand-surface-low border border-brand-border rounded-lg p-5 text-sm ${canEdit ? 'cursor-pointer hover:bg-brand-surface transition' : ''} ${task.description ? 'text-brand-text' : 'text-brand-text-muted italic'}`}
        >
          {task.description ? (
            <div className="md-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.description}
              </ReactMarkdown>
            </div>
          ) : (
            "Add a more detailed description..."
          )}
        </div>
      )}
    </section>
  );
};

export default TaskDescription;
