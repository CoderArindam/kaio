import React, { useState, useEffect } from 'react';
import { Smartphone, Laptop, Loader2, LogOut } from 'lucide-react';
import { getSessions, signOutOtherSessions } from '../../../services/authApi';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface ActiveSessionsProps {
  onSessionsRevoked?: () => void;
}

export const ActiveSessions: React.FC<ActiveSessionsProps> = ({ onSessionsRevoked }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch {
      toast.error('Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  const handleSignOutOther = async () => {
    try {
      setIsSigningOut(true);
      await signOutOtherSessions();
      toast.success('Successfully signed out of other sessions');
      fetchSessions();
      onSessionsRevoked?.();
    } catch {
      toast.error('Failed to sign out of other sessions');
    } finally {
      setIsSigningOut(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm mb-8 relative">
      <div className="p-6 border-b border-brand-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-text mb-1">Active Sessions</h2>
          <p className="text-sm text-brand-text-muted">Devices that are currently logged into your account.</p>
        </div>
        {sessions.length > 1 && (
          <button
            onClick={() => setShowConfirm(true)}
            className="px-3 py-1.5 text-sm bg-brand-surface-low border border-brand-border rounded hover:bg-brand-surface text-brand-text transition-colors"
          >
            Sign out of other sessions
          </button>
        )}
      </div>

      {showConfirm && (
        <div className="absolute inset-0 bg-brand-surface/90 backdrop-blur-sm flex items-center justify-center z-10 p-6 rounded-xl">
          <div className="bg-brand-surface-low border border-brand-border p-6 rounded-xl shadow-lg max-w-sm w-full">
            <h3 className="text-lg font-semibold text-brand-text mb-2">Sign out everywhere else?</h3>
            <p className="text-sm text-brand-text-muted mb-6">This will sign you out of all other devices except this one.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={isSigningOut} className="px-4 py-2 text-sm text-brand-text-muted hover:text-brand-text">
                Cancel
              </button>
              <button
                onClick={handleSignOutOther}
                disabled={isSigningOut}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-2"
              >
                {isSigningOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-brand-text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-brand-surface-low border border-brand-border rounded-lg p-4 flex gap-4">
                <div className="mt-1 text-brand-text-muted">
                  {session.platform?.includes('iOS') || session.platform?.includes('Android') ? (
                    <Smartphone size={24} />
                  ) : (
                    <Laptop size={24} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-brand-text text-sm">
                      {session.browser || 'Unknown Browser'} on {session.platform || 'Unknown Platform'}
                    </h3>
                    {session.is_current && (
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] uppercase font-bold rounded">
                        Current Device
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-brand-text-muted space-y-1">
                    <p>{session.ip_address || 'Unknown IP'}</p>
                    <p>
                      {session.is_current ? (
                        <span className="text-green-500">Active Now</span>
                      ) : (
                        `Last active ${session.last_active_at ? formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true }) : 'unknown'}`
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveSessions;
