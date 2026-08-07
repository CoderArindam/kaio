import React from 'react';
import { getUsers } from '../../../services/usersApi';
import { formatUserName } from '../../../utils/userHelpers';
import { UserAvatar } from '../../../components/common/UserAvatar';

interface ProjectLeadSelectorProps {
  value: number | null;
  onChange: (userId: number | null) => void;
}

export const ProjectLeadSelector: React.FC<ProjectLeadSelectorProps> = ({ value, onChange }) => {
  const [users, setUsers] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    setIsLoading(true);
    getUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // Filter to Managers and Super Admins
  const eligibleUsers = users.filter(u => ['SUPER_ADMIN', 'MANAGER'].includes((u.role || '').toUpperCase()));

  const selectedUser = eligibleUsers.find(u => u.id === value);

  return (
    <div className="space-y-3">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        className="w-full sm:max-w-md bg-brand-bg border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-text outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-shadow cursor-pointer"
        disabled={isLoading}
      >
        <option value="">Unassigned</option>
        {eligibleUsers.map(u => (
          <option key={u.id} value={u.id}>{formatUserName(u as any)}</option>
        ))}
      </select>

      {selectedUser && (
        <div className="flex items-center gap-3 p-3 bg-brand-surface-low border border-brand-border rounded-xl w-full sm:max-w-md">
          <UserAvatar user={selectedUser} size="md" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-brand-text">{formatUserName(selectedUser)}</span>
            <span className="text-xs text-brand-text-muted capitalize">{(selectedUser.role || '').toLowerCase().replace('_', ' ')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
