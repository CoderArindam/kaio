import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import NotificationPanel from './NotificationPanel';

const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount, fetchNotifications } = useNotificationStore();

  useEffect(() => {
    // Initial fetch on mount
    fetchNotifications(undefined);

    // Refetch on window focus as a fallback (WebSocket handles real-time pushes)
    const onFocus = () => {
      if (!isOpen) fetchNotifications(undefined);
    };
    window.addEventListener('focus', onFocus);
    
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchNotifications, isOpen]);

  const togglePanel = () => {
    if (!isOpen) {
      fetchNotifications(undefined);
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative inline-flex items-center">
      <button 
        onClick={togglePanel}
        className={`p-2 rounded-xl transition-all duration-200 relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
          isOpen 
            ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20 shadow-xs' 
            : 'text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low border border-transparent'
        }`}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={19} className="transition-transform active:scale-95" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-brand-surface shadow-xs animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationPanel onClose={() => setIsOpen(false)} />
      )}
    </div>
  );
};

export default NotificationBell;
