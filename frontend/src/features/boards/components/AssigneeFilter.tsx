import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check } from 'lucide-react';
import type { BoardMember } from '../../../services/usersApi';
import { UserAvatar } from '../../../components/common/UserAvatar';
import { formatUserName } from '../../../utils/userHelpers';
import { useAuthStore } from '../../../store/authStore';

interface AssigneeFilterProps {
  users: BoardMember[];
  selectedAssigneeIds: number[];
  onChange: (userIds: number[]) => void;
  maxVisible?: number;
}

const AssigneeFilter: React.FC<AssigneeFilterProps> = ({
  users,
  selectedAssigneeIds,
  onChange,
  maxVisible = 5,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sort users so current logged-in user is listed first if present
  const sortedUsers = useMemo(() => {
    if (!users || users.length === 0) return [];
    if (!currentUser) return users;
    return [...users].sort((a, b) => {
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      return 0;
    });
  }, [users, currentUser]);

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return sortedUsers;
    const q = searchQuery.toLowerCase().trim();
    return sortedUsers.filter((u) => {
      const name = formatUserName(u).toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [sortedUsers, searchQuery]);

  const visible = filteredUsers.slice(0, maxVisible);
  const overflow = filteredUsers.slice(maxVisible);

  const toggleAssignee = (id: number) => {
    if (selectedAssigneeIds.includes(id)) {
      onChange(selectedAssigneeIds.filter((userId) => userId !== id));
    } else {
      onChange([...selectedAssigneeIds, id]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 shrink-0 min-h-[36px]">
      <span className="text-xs text-brand-text-muted font-medium shrink-0 select-none mr-1">
        Assignee:
      </span>

      {/* Search Input */}
      <div className="relative flex items-center shrink-0">
        <Search size={13} className="absolute left-2.5 text-brand-text-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search member..."
          className="pl-7 pr-6 py-1 bg-brand-surface-low border border-brand-border rounded-full text-xs text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary w-32 sm:w-40 transition-all shadow-2xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 text-brand-text-muted hover:text-brand-text p-0.5"
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* "ALL" option */}
        <button
          onClick={() => onChange([])}
          title="All Assignees"
          className={`w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-all duration-150 select-none border ${
            selectedAssigneeIds.length === 0
              ? "text-brand-primary border-transparent ring-2 ring-offset-1 ring-brand-primary bg-brand-primary/10 scale-105"
              : "text-brand-text-muted border-dashed border-brand-border bg-transparent hover:border-brand-primary hover:text-brand-primary"
          }`}
        >
          ALL
        </button>

        {/* Visible member avatars */}
        {visible.map((member) => {
          const active = selectedAssigneeIds.includes(member.id);
          const isYou = currentUser?.id === member.id;
          const displayName = `${formatUserName(member)}${isYou ? ' (You)' : ''}`;
          return (
            <div
              key={member.id}
              title={displayName}
              onClick={() => toggleAssignee(member.id)}
              className={`rounded-full transition-all duration-150 cursor-pointer ${
                active
                  ? "ring-2 ring-offset-1 ring-brand-primary scale-105 opacity-100"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <UserAvatar user={member} size="md" className="border border-brand-border" />
            </div>
          );
        })}

        {/* Empty state when searching and no matches */}
        {filteredUsers.length === 0 && (
          <span className="text-xs text-brand-text-muted italic px-2">
            No matching members
          </span>
        )}

        {/* +N overflow */}
        {overflow.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className={`w-8 h-8 rounded-full text-xs font-semibold border transition-all duration-150 select-none flex items-center justify-center ${
                dropdownOpen
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "bg-brand-surface text-brand-text-muted border-brand-border hover:border-brand-primary hover:text-brand-text"
              }`}
            >
              +{overflow.length}
            </button>

            {dropdownOpen && (
              <div className="absolute top-10 left-0 z-50 w-64 max-h-64 overflow-y-auto custom-scrollbar bg-brand-surface border border-brand-border rounded-xl shadow-2xl py-2">
                {overflow.map((member) => {
                  const active = selectedAssigneeIds.includes(member.id);
                  const isYou = currentUser?.id === member.id;
                  const name = formatUserName(member);
                  return (
                    <label
                      key={member.id}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-brand-surface-low cursor-pointer ${
                        active ? "text-brand-primary font-semibold" : "text-brand-text"
                      }`}
                    >
                      <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleAssignee(member.id)}
                          className="peer appearance-none w-4 h-4 border border-brand-border rounded-sm bg-brand-surface checked:bg-brand-primary checked:border-brand-primary transition-colors cursor-pointer"
                        />
                        <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" strokeWidth={3} />
                      </div>
                      <UserAvatar user={member} size="sm" />
                      <span className="truncate flex-1 text-left">
                        {name} {isYou && <span className="text-xs text-brand-text-muted font-normal">(You)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssigneeFilter;
