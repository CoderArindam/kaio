import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import NotificationItem from '../notifications/NotificationItem';
import { Bell, CheckCheck, Loader2, ExternalLink, Sparkles } from 'lucide-react';

interface NotificationPanelProps {
  onClose: () => void;
  className?: string;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose, className = '' }) => {
  const { 
    notifications, 
    isLoading, 
    hasMore, 
    cursor,
    fetchNotifications, 
    markAllAsRead,
    markAsRead,
    removeNotification
  } = useNotificationStore();

  const observerTarget = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Grouping logic
  const grouped = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups = {
      'Today': [] as typeof notifications,
      'Yesterday': [] as typeof notifications,
      'Last 7 Days': [] as typeof notifications,
      'Earlier': [] as typeof notifications,
    };

    notifications.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= today) groups['Today'].push(n);
      else if (d >= yesterday) groups['Yesterday'].push(n);
      else if (d >= lastWeek) groups['Last 7 Days'].push(n);
      else groups['Earlier'].push(n);
    });

    return groups;
  }, [notifications]);

  // Initial fetch on mount if empty
  useEffect(() => {
    if (notifications.length === 0) {
      fetchNotifications(null);
    }
  }, [fetchNotifications, notifications.length]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoading && cursor) {
          fetchNotifications(cursor);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, fetchNotifications, cursor]);

  // Click outside & Escape key to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const hasUnread = notifications.some(n => !n.is_read);
  const defaultPosition = 'right-0 top-full mt-2.5 w-[calc(100vw-2rem)] sm:w-[410px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] sm:max-h-[580px] animate-in fade-in slide-in-from-top-2 duration-150';

  return (
    <div 
      ref={panelRef}
      className={`absolute bg-brand-surface/95 backdrop-blur-xl border border-brand-border/80 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden ring-1 ring-black/5 ${className || defaultPosition}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-brand-border/60 bg-brand-surface-low/90 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-brand-primary/10 text-brand-primary">
            <Bell size={16} />
          </div>
          <h3 className="font-semibold text-sm text-brand-text">Notifications</h3>
          {hasUnread && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-brand-primary text-white shadow-2xs">
              {notifications.filter(n => !n.is_read).length} new
            </span>
          )}
        </div>
        {hasUnread && (
          <button 
            onClick={() => markAllAsRead()}
            className="text-xs font-medium text-brand-primary hover:text-brand-primary/80 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-brand-primary/10 transition-all cursor-pointer"
          >
            <CheckCheck size={14} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-brand-border/30 custom-scrollbar">
        {notifications.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className="w-12 h-12 bg-brand-surface-low rounded-2xl flex items-center justify-center mb-3 text-brand-text-muted border border-brand-border/50">
              <Sparkles size={22} className="text-brand-primary/70" />
            </div>
            <p className="text-sm font-semibold text-brand-text">All caught up!</p>
            <p className="text-xs text-brand-text-muted mt-1 max-w-[220px]">
              You have no unread notifications at the moment.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={label}>
                <div className="sticky top-0 bg-brand-surface-low/95 backdrop-blur-md text-[11px] font-bold text-brand-text-muted uppercase tracking-wider px-4 py-1.5 z-10 border-b border-brand-border/40">
                  {label}
                </div>
                <div className="divide-y divide-brand-border/30">
                  {items.map(n => (
                    <NotificationItem 
                      key={n.id} 
                      notification={n} 
                      onMarkRead={markAsRead}
                      onDelete={removeNotification}
                      onClosePanel={onClose}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Loading / End of list */}
        {hasMore && (
          <div ref={observerTarget} className="p-4 flex justify-center">
            {isLoading ? <Loader2 size={18} className="animate-spin text-brand-primary" /> : <div className="h-4" />}
          </div>
        )}
      </div>

      {/* Footer / View All Link */}
      <div className="p-2.5 border-t border-brand-border/60 bg-brand-surface-low/80 shrink-0 text-center">
        <Link 
          to="/settings/notifications" 
          onClick={onClose}
          className="text-xs font-medium text-brand-text-muted hover:text-brand-primary flex items-center justify-center gap-1.5 py-1 transition-colors group"
        >
          <span>View all notifications in settings</span>
          <ExternalLink size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
};

export default NotificationPanel;
