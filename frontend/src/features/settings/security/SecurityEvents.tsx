import React, { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Key, Laptop, LogOut, Loader2,
} from 'lucide-react';
import { getSecurityEvents } from '../../../services/authApi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const getEventMeta = (event: any) => {
  const browser = event.details?.browser;
  const platform = event.details?.platform;
  const deviceStr = browser && platform
    ? `${browser} on ${platform}`
    : browser || platform || 'Unknown Device';

  switch (event.action) {
    case 'LOGIN':
      return { title: 'Successful Login', icon: <ShieldCheck size={16} className="text-emerald-500" />, deviceStr };
    case 'LOGIN_2FA_SUCCESS':
      return { title: '2FA Verification Successful', icon: <ShieldCheck size={16} className="text-emerald-500" />, deviceStr };
    case 'FAILED_LOGIN':
      return { title: 'Failed Login Attempt', icon: <ShieldAlert size={16} className="text-rose-500" />, deviceStr };
    case 'NEW_DEVICE_LOGIN':
      return { title: 'Login from New Device', icon: <Laptop size={16} className="text-amber-500" />, deviceStr };
    case '2FA_ENABLED':
      return { title: '2FA Enabled', icon: <ShieldCheck size={16} className="text-emerald-500" />, deviceStr };
    case '2FA_DISABLED':
      return { title: '2FA Disabled', icon: <ShieldAlert size={16} className="text-amber-500" />, deviceStr };
    case 'ORG_REGISTERED':
      return { title: 'Organization Registered & Verified', icon: <ShieldCheck size={16} className="text-blue-500" />, deviceStr };
    case 'REVOKED_OTHER_SESSIONS':
      return { title: 'Signed Out Other Devices', icon: <LogOut size={16} className="text-brand-text-muted" />, deviceStr };
    case 'PASSWORD_CHANGED':
      return { title: 'Password Changed', icon: <Key size={16} className="text-blue-500" />, deviceStr };
    default:
      return {
        title: event.action ? event.action.replace(/_/g, ' ') : 'Security Event',
        icon: <Shield size={16} className="text-brand-text-muted" />,
        deviceStr,
      };
  }
};

interface SecurityEventsProps {
  refreshKey?: number;
}

export const SecurityEvents: React.FC<SecurityEventsProps> = ({ refreshKey }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await getSecurityEvents();
        setEvents(data);
      } catch {
        toast.error('Failed to load security events');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, [refreshKey]);

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-brand-text mb-1">Recent Security Activity</h2>
        <p className="text-sm text-brand-text-muted">Review your recent login and security audit log events.</p>
      </div>
      <div className="divide-y divide-brand-border">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-brand-text-muted" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-brand-text-muted text-sm">No recent activity found.</div>
        ) : (
          events.map((event) => {
            const meta = getEventMeta(event);
            return (
              <div key={event.id} className="p-4 flex items-center justify-between hover:bg-brand-surface-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-surface-low p-2 rounded border border-brand-border flex items-center justify-center">
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-text">{meta.title}</p>
                    <div className="flex items-center gap-2 text-xs text-brand-text-muted mt-0.5">
                      <span>{meta.deviceStr}</span>
                      {event.ip_address && (
                        <>
                          <span>•</span>
                          <span>{event.ip_address}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-brand-text-muted whitespace-nowrap">
                  {format(new Date(event.created_at), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SecurityEvents;
