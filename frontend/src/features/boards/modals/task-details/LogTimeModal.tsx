import React, { useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import Modal from '../../../../components/common/Modal';
import { useTaskStore } from '../../../../store/taskStore';
import { type Task } from '../../../../services/tasksApi';

interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
}

const parseTimeInput = (input: string): number | null => {
  if (!input) return null;
  const str = input.trim().toLowerCase();
  if (!str) return null;

  // Pure number
  const num = Number(str);
  if (!isNaN(num) && num > 0) return num;

  let totalHours = 0;
  const regex = /(\d+(?:\.\d+)?)\s*([dhm])/g;
  let match;
  let hasMatches = false;

  while ((match = regex.exec(str)) !== null) {
    hasMatches = true;
    const val = parseFloat(match[1]);
    const unit = match[2];
    if (unit === 'd') totalHours += val * 8;
    else if (unit === 'h') totalHours += val;
    else if (unit === 'm') totalHours += val / 60;
  }

  if (hasMatches && totalHours > 0) {
    return Number(totalHours.toFixed(2)); // Round to 2 decimal places to fit NUMERIC(4,2)
  }
  
  return null;
};

export const LogTimeModal: React.FC<LogTimeModalProps> = ({ isOpen, onClose, task }) => {
  const { logTaskTime } = useTaskStore();
  const today = new Date().toISOString().split('T')[0];

  const [entryDate, setEntryDate] = useState<string>(today);
  const [hours, setHours] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedHours = parseTimeInput(hours);
    if (parsedHours === null) {
      setErrorMsg('Please enter a valid time (e.g. 2.5, 1h 30m, 90m).');
      return;
    }
    if (parsedHours > 24) {
      setErrorMsg('Cannot log more than 24 hours in a single entry.');
      return;
    }

    setIsSubmitting(true);
    try {
      await logTaskTime(task.id, {
        entry_date: entryDate,
        hours: parsedHours,
        description: description.trim() || undefined,
      });
      setHours('');
      setDescription('');
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to log time';
      setErrorMsg(typeof msg === 'string' ? msg : 'Failed to log time');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Work Hours" width="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-brand-surface-low rounded-xl border border-brand-border/60 text-xs text-brand-text-muted">
          <Clock size={16} className="text-brand-primary shrink-0" />
          <span>
            Logging time against <strong className="text-brand-text">{task.task_reference || `Task #${task.id}`}</strong>
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg border border-red-200/60">
            {errorMsg}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-brand-text-muted mb-1.5 uppercase tracking-wider">
            Date *
          </label>
          <input
            type="date"
            required
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-text-muted mb-1.5 uppercase tracking-wider">
            Hours Worked *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 2.5 or 1h 30m"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-text-muted mb-1.5 uppercase tracking-wider">
            Work Description (Optional)
          </label>
          <textarea
            rows={3}
            placeholder="What did you work on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text outline-none focus:border-brand-primary resize-none"
          />
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-brand-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-brand-border hover:bg-brand-surface-low text-brand-text transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !hours.trim()}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {isSubmitting ? 'Logging...' : 'Log Time'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default LogTimeModal;
