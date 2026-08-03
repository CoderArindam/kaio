import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { BoardMember } from '../../../services/usersApi';
import { UserAvatar } from '../../../components/common/UserAvatar';
import { formatUserName } from '../../../utils/userHelpers';
import { useAuthStore } from '../../../store/authStore';

interface AssigneeFilterProps {
  users: BoardMember[];
  selectedAssigneeId: number | null;
  onChange: (userId: number | null) => void;
  maxVisible?: number;
}

const AssigneeFilter: React.FC<AssigneeFilterProps> = ({
  users,
  selectedAssigneeId,
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
          onClick={() => onChange(null)}
          title="All Assignees"
          className={`w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-all duration-150 select-none border ${
            selectedAssigneeId === null
              ? "text-brand-primary border-transparent ring-2 ring-offset-1 ring-brand-primary bg-brand-primary/10 scale-105"
              : "text-brand-text-muted border-dashed border-brand-border bg-transparent hover:border-brand-primary hover:text-brand-primary"
          }`}
        >
          ALL
        </button>

        {/* Visible member avatars */}
        {visible.map((member) => {
          const active = selectedAssigneeId === member.id;
          const isYou = currentUser?.id === member.id;
          const displayName = `${formatUserName(member)}${isYou ? ' (You)' : ''}`;
          return (
            <div
              key={member.id}
              title={displayName}
              onClick={() => onChange(member.id)}
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

        {/* +N overflow — opens dropdown with filtered overflow members */}
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
              <div className="absolute top-10 left-0 z-50 w-56 bg-brand-surface border border-brand-border rounded-xl shadow-2xl py-1 overflow-hidden">
                {overflow.map((member) => {
                  const active = selectedAssigneeId === member.id;
                  const isYou = currentUser?.id === member.id;
                  const name = formatUserName(member);
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        onChange(member.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-brand-surface-low ${
                        active ? "text-brand-primary font-semibold" : "text-brand-text"
                      }`}
                    >
                      <UserAvatar user={member} size="sm" />
                      <span className="truncate flex-1 text-left">
                        {name} {isYou && <span className="text-xs text-brand-text-muted font-normal">(You)</span>}
                      </span>
                      {active && <span className="text-brand-primary text-xs">✓</span>}
                    </button>
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

