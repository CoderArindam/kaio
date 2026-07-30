import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { usePreferencesStore } from '../../store/preferencesStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { useUiStore } from '../../store/uiStore';
import WorkspaceLoader from '../common/WorkspaceLoader';
import { updateFavicon } from '../../utils/favicon';

import ApplicationSidebar from './ApplicationSidebar';
import NotificationBell from '../../features/notifications/NotificationBell';
import UserAvatarDropdown from './UserAvatarDropdown';
import { ActiveMeetingBar } from '../../features/meeting/components/ActiveMeetingBar';
import { AIButton } from '../../features/ai/components/AIButton';
import { AIPanel } from '../../features/ai/components/AIPanel';
import CreateProjectModal from '../../features/projects/components/CreateProjectModal';
import SearchModal from '../../features/search/SearchModal';
import { Search } from 'lucide-react';

export const AppLayout: React.FC = () => {
  
  const { profile, isLoading: isProfileLoading } = useOrganizationStore();
  const { isLoading: isPreferencesLoading } = usePreferencesStore();
  const { pageTitle, openSearchModal, toggleSearchModal } = useUiStore();

  // Cmd+K / Ctrl+K keyboard shortcut for global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearchModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearchModal]);

  // Document Title Logic
  useEffect(() => {
    const workspaceName = profile?.name || "Workspace";
    if (pageTitle) {
      document.title = `${pageTitle} · ${workspaceName} | KAIO`;
    } else {
      document.title = `${workspaceName} | KAIO`;
    }
  }, [pageTitle, profile?.name]);

  // Dynamic Favicon Logic
  useEffect(() => {
    if (profile) {
      updateFavicon(profile.name, profile.logo_url);
    }
  }, [profile?.name, profile?.logo_url]);

  // Bootstrap Flow / Loading Screen
  if (isProfileLoading || isPreferencesLoading || !profile) {
    return <WorkspaceLoader name={profile?.name} logoUrl={profile?.logo_url} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg text-brand-text">
      <ApplicationSidebar />
      <div className="flex-1 flex flex-col relative overflow-hidden min-w-0 md:pt-0 pt-16">
        {/* Enterprise Top Navigation Header */}
        <header className="h-14 border-b border-brand-border/70 bg-brand-surface/85 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between shrink-0 z-30 gap-4">
          {/* Global Search Input Bar */}
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button
              onClick={openSearchModal}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-1.5 bg-brand-surface-low/80 hover:bg-brand-surface-low border border-brand-border/80 rounded-xl text-xs text-brand-text-muted transition-all shadow-2xs group text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Search className="w-4 h-4 text-brand-text-muted group-hover:text-brand-primary transition-colors shrink-0" />
                <span className="truncate font-normal">Search tasks, boards, settings, team members...</span>
              </div>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-brand-text-muted bg-brand-surface border border-brand-border/60 rounded shadow-2xs shrink-0">
                <span className="text-[9px]">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Quick Header Actions: Notifications & Profile Dropdown */}
          <div className="flex items-center gap-3 shrink-0 relative">
            <NotificationBell />
            <UserAvatarDropdown placement="header" />
          </div>
        </header>

        <ActiveMeetingBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <AIButton />
      <AIPanel />
      <CreateProjectModal />
      <SearchModal />
    </div>
  );
};

export default AppLayout;
