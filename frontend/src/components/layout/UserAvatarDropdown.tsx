import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { UserAvatar } from '../common/UserAvatar';
import { LogOut, User as UserIcon, Settings, Building2 } from 'lucide-react';
import { formatUserName } from '../../utils/userHelpers';

interface UserAvatarDropdownProps {
  isSidebarCollapsed?: boolean;
  placement?: 'header' | 'sidebar';
}

export const UserAvatarDropdown: React.FC<UserAvatarDropdownProps> = ({
  isSidebarCollapsed = false,
  placement = 'header',
}) => {
  const { user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown = () => setIsOpen(false);

  const dropdownPositionClass = placement === 'sidebar'
    ? 'left-0 bottom-full mb-2.5 animate-in fade-in slide-in-from-bottom-2'
    : 'right-0 top-full mt-2.5 animate-in fade-in slide-in-from-top-2';

  return (
    <div className="relative inline-flex items-center" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className="rounded-full focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all hover:scale-105 cursor-pointer"
        aria-expanded={isOpen}
        aria-label="User menu"
      >
        <UserAvatar
          user={user}
          size={isSidebarCollapsed ? 'sm' : 'md'}
        />
      </button>

      {isOpen && (
        <div 
          className={`absolute w-64 bg-brand-surface/95 backdrop-blur-xl border border-brand-border/80 shadow-2xl rounded-2xl z-50 overflow-hidden duration-150 ${dropdownPositionClass}`}
        >
          {/* Header Info */}
          <div className="px-4 py-3 border-b border-brand-border/60 bg-brand-surface-low/80">
            <p className="text-sm font-semibold text-brand-text truncate">
              {formatUserName(user)}
            </p>
            <p className="text-xs text-brand-text-muted truncate mt-0.5">
              {user?.email}
            </p>
            {user?.role && (
              <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-brand-primary/10 text-brand-primary rounded-full border border-brand-primary/20 mr-2">
                {user.role}
              </span>
            )}
            {user?.org_subscription_plan && (
              <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-brand-primary/10 text-brand-primary rounded-full border border-brand-primary/20">
                {user.org_subscription_plan} PLAN
              </span>
            )}
          </div>

          <div className="py-1.5">
            <Link
              to="/settings/account"
              onClick={closeDropdown}
              className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-brand-text hover:bg-brand-surface-low transition-colors"
            >
              <UserIcon size={15} className="text-brand-text-muted shrink-0" />
              Account Settings
            </Link>

            <Link
              to="/settings/notifications"
              onClick={closeDropdown}
              className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-brand-text hover:bg-brand-surface-low transition-colors"
            >
              <Settings size={15} className="text-brand-text-muted shrink-0" />
              Preferences
            </Link>

            {user?.role === 'SUPER_ADMIN' && (
              <Link 
                to="/settings/organization" 
                onClick={closeDropdown}
                className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-brand-text hover:bg-brand-surface-low transition-colors"
              >
                <Building2 size={15} className="text-brand-text-muted shrink-0" />
                Organization
              </Link>
            )}
          </div>

          <div className="py-1.5 border-t border-brand-border/60">
            <button
              onClick={() => {
                closeDropdown();
                logout();
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
            >
              <LogOut size={15} className="shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAvatarDropdown;
