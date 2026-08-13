import React from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { type EligibleApprover } from '../../../../services/timesheetAdminService';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/common/Modal';
import { Select } from '../../../../components/ui/Select';

interface SubmitTimesheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  eligibleApprovers: EligibleApprover[];
  loadingApprovers: boolean;
  selectedApproverId: string;
  onApproverChange: (id: string) => void;
  memberNote: string;
  onNoteChange: (val: string) => void;
  isActionLoading: boolean;
  onConfirm: () => void;
}

export const SubmitTimesheetModal: React.FC<SubmitTimesheetModalProps> = ({
  isOpen,
  onClose,
  eligibleApprovers,
  loadingApprovers,
  selectedApproverId,
  onApproverChange,
  memberNote,
  onNoteChange,
  isActionLoading,
  onConfirm,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Submit Timesheet for Review">
    <div className="space-y-4">
      <p className="text-xs text-brand-text-muted">
        Once submitted, your timesheet will be sent for review and manager approval. You can recall it anytime before approval.
      </p>

      <div className="p-3 bg-brand-surface border border-brand-border rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-brand-text flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-brand-primary" />
            Select Approver Manager
          </label>
          {loadingApprovers && (
            <span className="text-[11px] text-brand-text-muted flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Loading approvers...
            </span>
          )}
        </div>

        <div>
          <Select
            value={selectedApproverId}
            onChange={(val) => onApproverChange(val)}
            options={eligibleApprovers.length === 0 ? [] : eligibleApprovers.map((app) => ({
              value: app.user_id,
              label: `👤 ${app.display_name} (${app.role}) — ${app.email}`
            }))}
            placeholder={eligibleApprovers.length === 0 ? "No approvers configured in organization" : "Select an approver..."}
            disabled={eligibleApprovers.length === 0}
          />
          <p className="text-[11px] text-brand-text-muted mt-1">
            Select a manager designated by your organization's Superadmin to review your timesheet.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-text-muted mb-1">
          Member Note (Optional)
        </label>
        <textarea
          rows={3}
          value={memberNote}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Add any context or comments for your reviewer..."
          className="w-full bg-brand-surface border border-brand-border rounded-lg p-2.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary resize-none"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm} disabled={isActionLoading}>
          {isActionLoading ? 'Submitting...' : 'Confirm Submission'}
        </Button>
      </div>
    </div>
  </Modal>
);
