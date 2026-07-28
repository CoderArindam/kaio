import React, { useEffect, useState } from 'react';
import { useAdminStore } from '../../store/adminStore';
import { Users, FolderKanban, Download, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';
import { adminExportAuditLog } from '../../services/adminApi';

const AdminDashboard: React.FC = () => {
  const { users, boards, fetchUsers, fetchBoards, isFetchingUsers, isFetchingBoards } = useAdminStore();
  const [isExporting, setIsExporting] = useState<boolean>(false);

  usePageTitle("Admin Overview");

  useEffect(() => {
    fetchUsers();
    fetchBoards();
  }, [fetchUsers, fetchBoards]);

  const handleExportAuditLog = async () => {
    try {
      setIsExporting(true);
      const blob = await adminExportAuditLog();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_log.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Org audit log exported successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to export audit log CSV');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 h-full max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-text">Platform Overview</h1>
          <p className="text-brand-text-muted">Manage users, roles, board access levels, and security audit logs.</p>
        </div>

        <button
          onClick={handleExportAuditLog}
          disabled={isExporting}
          className="self-start sm:self-auto px-4 py-2 text-xs font-semibold bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
        >
          <Download size={14} />
          {isExporting ? 'Exporting...' : 'Export Audit Log'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Users Card */}
        <div className="bg-brand-bg border border-brand-border rounded-2xl p-6 shadow-sm flex flex-col gap-6 hover:shadow-md hover:border-brand-primary/30 transition-all duration-300 group">
          <div className="flex items-center gap-4">
            <div className="bg-brand-primary/10 p-4 rounded-xl text-brand-primary group-hover:scale-110 group-hover:bg-brand-primary/20 transition-all duration-300">
              <Users size={28} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-text">Total Users</h2>
              <p className="text-brand-text-muted text-sm">Registered accounts</p>
            </div>
          </div>
          <div className="text-5xl font-bold text-brand-text tracking-tight">
            {isFetchingUsers ? (
              <div className="h-12 w-20 bg-brand-surface-low animate-pulse rounded-lg"></div>
            ) : (
              users.length
            )}
          </div>
          <div className="mt-auto pt-4 border-t border-brand-border">
            <Link 
              to="/admin/users" 
              className="text-sm font-medium text-brand-primary hover:text-brand-primary-hover flex items-center gap-1 group/link"
            >
              Manage Users 
              <span className="group-hover/link:translate-x-1 transition-transform">&rarr;</span>
            </Link>
          </div>
        </div>

        {/* Boards Card */}
        <div className="bg-brand-bg border border-brand-border rounded-2xl p-6 shadow-sm flex flex-col gap-6 hover:shadow-md hover:border-purple-500/30 transition-all duration-300 group">
          <div className="flex items-center gap-4">
            <div className="bg-purple-500/10 p-4 rounded-xl text-purple-500 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all duration-300">
              <FolderKanban size={28} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-text">Total Boards</h2>
              <p className="text-brand-text-muted text-sm">Active projects</p>
            </div>
          </div>
          <div className="text-5xl font-bold text-brand-text tracking-tight">
            {isFetchingBoards ? (
              <div className="h-12 w-20 bg-brand-surface-low animate-pulse rounded-lg"></div>
            ) : (
              boards.length
            )}
          </div>
          <div className="mt-auto pt-4 border-t border-brand-border">
            <Link 
              to="/admin/boards" 
              className="text-sm font-medium text-purple-500 hover:text-purple-600 flex items-center gap-1 group/link"
            >
              Manage Permissions 
              <span className="group-hover/link:translate-x-1 transition-transform">&rarr;</span>
            </Link>
          </div>
        </div>

        {/* Audit Log Export Card */}
        <div className="bg-brand-bg border border-brand-border rounded-2xl p-6 shadow-sm flex flex-col gap-6 hover:shadow-md hover:border-emerald-500/30 transition-all duration-300 group">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-500/10 p-4 rounded-xl text-emerald-500 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-text">Security & Audit</h2>
              <p className="text-brand-text-muted text-sm">Activity export</p>
            </div>
          </div>
          <p className="text-xs text-brand-text-muted">
            Export organization activity trail and authentication security events as CSV.
          </p>
          <div className="mt-auto pt-4 border-t border-brand-border">
            <button 
              onClick={handleExportAuditLog}
              disabled={isExporting}
              className="text-sm font-medium text-emerald-500 hover:text-emerald-600 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              {isExporting ? 'Exporting...' : 'Export Audit Log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
