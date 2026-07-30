import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search as SearchIcon, 
  CheckSquare, 
  FolderKanban, 
  MessageSquare, 
  Loader2, 
  Settings as SettingsIcon,
  Users,
  Compass,
  Key,
  Building,
  Palette,
  Bell,
  Keyboard,
  Code,
  CreditCard,
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import { useUiStore } from '../../store/uiStore';
import { searchApi, type SearchResultItem } from '../../services/searchApi';
import { getUsers, type User } from '../../services/usersApi';
import { useDebounce } from '../../hooks/useDebounce';
import { SYSTEM_NAVIGATION_ITEMS, type NavigationSearchItem } from './navigationCatalog';

export interface UnifiedSearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: 'settings' | 'tasks' | 'boards' | 'comments' | 'members';
  categoryLabel: string;
  badgeClass: string;
  icon: React.ReactNode;
  url?: string;
  board_id?: number | null;
  task_id?: number | null;
}

export const SearchModal: React.FC = () => {
  const { isSearchModalOpen, closeSearchModal, openTaskModal } = useUiStore();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [dbResults, setDbResults] = useState<SearchResultItem[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const debouncedQuery = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens & load user list
  useEffect(() => {
    if (isSearchModalOpen) {
      setQuery('');
      setDbResults([]);
      setSelectedIndex(0);
      getUsers().then(setUsersList).catch(() => setUsersList([]));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isSearchModalOpen]);

  // Fetch search results
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setDbResults([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    searchApi.globalSearch(debouncedQuery, 20)
      .then((data) => {
        if (isMounted) {
          setDbResults(data);
          setSelectedIndex(0);
        }
      })
      .catch((err) => {
        console.error('Search failed:', err);
        if (isMounted) setDbResults([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  const cleanQuery = debouncedQuery.trim().toLowerCase();

  // 1. Filter Settings & Pages Catalog
  const matchedNavItems: UnifiedSearchResult[] = cleanQuery
    ? SYSTEM_NAVIGATION_ITEMS.filter((item) =>
        item.title.toLowerCase().includes(cleanQuery) ||
        item.description.toLowerCase().includes(cleanQuery) ||
        item.keywords.some((k) => k.toLowerCase().includes(cleanQuery))
      ).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.description,
        category: 'settings',
        categoryLabel: item.category,
        badgeClass: item.category === 'Settings' 
          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
          : item.category === 'Admin'
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          : 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: getNavigationIcon(item.iconType),
        url: item.url,
      }))
    : [];

  // 2. Filter Team Members
  const matchedUserItems: UnifiedSearchResult[] = cleanQuery
    ? usersList
        .filter((u) =>
          `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(cleanQuery) ||
          u.email.toLowerCase().includes(cleanQuery) ||
          (u.role || '').toLowerCase().includes(cleanQuery)
        )
        .map((u) => ({
          id: `user-${u.id}`,
          title: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          subtitle: `${u.email} · Role: ${u.role || 'MEMBER'}`,
          category: 'members',
          categoryLabel: 'Team Member',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: <Users className="w-4 h-4 text-emerald-400" />,
          url: '/admin/users',
        }))
    : [];

  // 3. Database Tasks
  const matchedTasks: UnifiedSearchResult[] = dbResults
    .filter((r) => r.type === 'task')
    .map((r) => ({
      id: `task-${r.id}`,
      title: r.title,
      subtitle: `Task #${r.task_id || r.id}`,
      category: 'tasks',
      categoryLabel: 'Task',
      badgeClass: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
      icon: <CheckSquare className="w-4 h-4 text-brand-primary" />,
      board_id: r.board_id,
      task_id: r.task_id || r.id,
    }));

  // 4. Database Boards
  const matchedBoards: UnifiedSearchResult[] = dbResults
    .filter((r) => r.type === 'board')
    .map((r) => ({
      id: `board-${r.id}`,
      title: r.title,
      subtitle: `Kanban Board Project`,
      category: 'boards',
      categoryLabel: 'Board',
      badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      icon: <FolderKanban className="w-4 h-4 text-indigo-400" />,
      board_id: r.board_id || r.id,
    }));

  // 5. Database Comments
  const matchedComments: UnifiedSearchResult[] = dbResults
    .filter((r) => r.type === 'comment')
    .map((r) => ({
      id: `comment-${r.id}`,
      title: `"${r.title}"`,
      subtitle: `Comment on Task #${r.task_id}`,
      category: 'comments',
      categoryLabel: 'Comment',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: <MessageSquare className="w-4 h-4 text-amber-400" />,
      board_id: r.board_id,
      task_id: r.task_id,
    }));

  // Flattened ordered list for keyboard navigation
  const flatResults = [
    ...matchedNavItems,
    ...matchedTasks,
    ...matchedBoards,
    ...matchedComments,
    ...matchedUserItems,
  ];

  const handleSelectItem = (item: UnifiedSearchResult) => {
    closeSearchModal();

    if (item.url) {
      navigate(item.url);
      return;
    }

    if (item.category === 'boards' && item.board_id) {
      navigate(`/board/${item.board_id}`);
    } else if (item.category === 'tasks' && item.task_id) {
      if (item.board_id) {
        navigate(`/board/${item.board_id}?taskId=${item.task_id}`);
      }
      openTaskModal(item.task_id);
    } else if (item.category === 'comments' && item.task_id) {
      if (item.board_id) {
        navigate(`/board/${item.board_id}?taskId=${item.task_id}`);
      }
      openTaskModal(item.task_id, { tab: 'comments' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = flatResults[selectedIndex];
      if (selected) {
        handleSelectItem(selected);
      }
    }
  };

  let globalCounter = 0;

  return (
    <Modal
      isOpen={isSearchModalOpen}
      onClose={closeSearchModal}
      width="max-w-2xl"
      hideCloseButton={true}
      noPadding={true}
    >
      <div className="flex flex-col max-h-[85vh] bg-brand-surface rounded-xl overflow-hidden shadow-2xl">
        {/* Search Header Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-brand-border bg-brand-surface-low/50">
          <SearchIcon className="w-5 h-5 text-brand-text-muted shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, boards, settings, team members... (Cmd+K)"
            className="w-full bg-transparent text-sm text-brand-text placeholder-brand-text-muted focus:outline-none"
          />
          {isLoading && <Loader2 className="w-4 h-4 text-brand-primary animate-spin shrink-0 ml-2" />}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-brand-text-muted bg-brand-surface-low border border-brand-border rounded shadow-xs ml-2">
            ESC
          </kbd>
        </div>

        {/* Search Results Body */}
        <div className="overflow-y-auto p-3 space-y-4 max-h-[65vh]">
          {cleanQuery !== '' && !isLoading && flatResults.length === 0 && (
            <div className="py-12 text-center space-y-2">
              <SearchIcon className="w-8 h-8 mx-auto text-brand-text-muted opacity-40" />
              <p className="text-sm font-semibold text-brand-text">No results found for &quot;{query}&quot;</p>
              <p className="text-xs text-brand-text-muted">
                Try searching for task titles, board keys (e.g. ENG), settings (e.g. security), or member names.
              </p>
            </div>
          )}

          {!cleanQuery && (
            <div className="py-8 px-4 text-center space-y-3">
              <Compass className="w-8 h-8 mx-auto text-brand-primary opacity-60" />
              <div>
                <p className="text-xs font-semibold text-brand-text">Enterprise Global Search</p>
                <p className="text-[11px] text-brand-text-muted mt-1 max-w-md mx-auto">
                  Instantly navigate to any task, board, settings page, active session, user directory, or timesheet record.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[10px]">
                <button 
                  onClick={() => setQuery('settings')}
                  className="px-2.5 py-1 rounded-full bg-brand-surface-low text-brand-text border border-brand-border hover:border-brand-primary transition-colors cursor-pointer"
                >
                  ⚙️ Settings
                </button>
                <button 
                  onClick={() => setQuery('security')}
                  className="px-2.5 py-1 rounded-full bg-brand-surface-low text-brand-text border border-brand-border hover:border-brand-primary transition-colors cursor-pointer"
                >
                  🔒 Security & Sessions
                </button>
                <button 
                  onClick={() => setQuery('timesheets')}
                  className="px-2.5 py-1 rounded-full bg-brand-surface-low text-brand-text border border-brand-border hover:border-brand-primary transition-colors cursor-pointer"
                >
                  ⏱️ Timesheets
                </button>
                <button 
                  onClick={() => setQuery('users')}
                  className="px-2.5 py-1 rounded-full bg-brand-surface-low text-brand-text border border-brand-border hover:border-brand-primary transition-colors cursor-pointer"
                >
                  👥 Team Directory
                </button>
              </div>
            </div>
          )}

          {/* Group 1: Pages & Settings */}
          {matchedNavItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted px-3 py-1 uppercase tracking-wider">
                <SettingsIcon className="w-3.5 h-3.5" />
                <span>Navigation & Settings ({matchedNavItems.length})</span>
              </div>
              <div className="mt-1 space-y-1">
                {matchedNavItems.map((item) => {
                  const currentIndex = globalCounter++;
                  const isSelected = selectedIndex === currentIndex;
                  return (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 2: Tasks */}
          {matchedTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted px-3 py-1 uppercase tracking-wider">
                <CheckSquare className="w-3.5 h-3.5 text-brand-primary" />
                <span>Tasks ({matchedTasks.length})</span>
              </div>
              <div className="mt-1 space-y-1">
                {matchedTasks.map((item) => {
                  const currentIndex = globalCounter++;
                  const isSelected = selectedIndex === currentIndex;
                  return (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 3: Boards */}
          {matchedBoards.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted px-3 py-1 uppercase tracking-wider">
                <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
                <span>Boards & Projects ({matchedBoards.length})</span>
              </div>
              <div className="mt-1 space-y-1">
                {matchedBoards.map((item) => {
                  const currentIndex = globalCounter++;
                  const isSelected = selectedIndex === currentIndex;
                  return (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 4: Comments */}
          {matchedComments.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted px-3 py-1 uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Comments ({matchedComments.length})</span>
              </div>
              <div className="mt-1 space-y-1">
                {matchedComments.map((item) => {
                  const currentIndex = globalCounter++;
                  const isSelected = selectedIndex === currentIndex;
                  return (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 5: Team Members */}
          {matchedUserItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted px-3 py-1 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Team Members ({matchedUserItems.length})</span>
              </div>
              <div className="mt-1 space-y-1">
                {matchedUserItems.map((item) => {
                  const currentIndex = globalCounter++;
                  const isSelected = selectedIndex === currentIndex;
                  return (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-brand-border bg-brand-surface-low/30 text-[11px] text-brand-text-muted flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 bg-brand-surface border border-brand-border rounded text-[9px]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-brand-surface border border-brand-border rounded text-[9px]">↵</kbd> select
            </span>
          </div>
          <span>KAIO Enterprise Search</span>
        </div>
      </div>
    </Modal>
  );
};

interface SearchResultRowProps {
  item: UnifiedSearchResult;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

const SearchResultRow: React.FC<SearchResultRowProps> = ({
  item,
  isSelected,
  onClick,
  onMouseEnter,
}) => (
  <div
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    className={`px-3 py-2.5 rounded-lg flex items-center justify-between cursor-pointer text-xs transition-colors gap-3 ${
      isSelected
        ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-medium'
        : 'text-brand-text hover:bg-brand-surface-low'
    }`}
  >
    <div className="flex items-center gap-2.5 min-w-0 flex-1">
      <div className="shrink-0">{item.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-brand-text leading-tight">{item.title}</p>
        {item.subtitle && (
          <p className="truncate text-[10px] text-brand-text-muted leading-tight mt-0.5">{item.subtitle}</p>
        )}
      </div>
    </div>
    <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 font-medium ${item.badgeClass}`}>
      {item.categoryLabel}
    </span>
  </div>
);

function getNavigationIcon(type: string): React.ReactNode {
  switch (type) {
    case 'dashboard': return <LayoutDashboard className="w-4 h-4 text-blue-400" />;
    case 'check-square': return <CheckSquare className="w-4 h-4 text-brand-primary" />;
    case 'clock': return <Clock className="w-4 h-4 text-emerald-400" />;
    case 'clipboard': return <ClipboardCheck className="w-4 h-4 text-amber-400" />;
    case 'shield': return <Shield className="w-4 h-4 text-red-400" />;
    case 'users': return <Users className="w-4 h-4 text-emerald-400" />;
    case 'kanban': return <FolderKanban className="w-4 h-4 text-indigo-400" />;
    case 'user': return <UserIcon className="w-4 h-4 text-purple-400" />;
    case 'key': return <Key className="w-4 h-4 text-amber-400" />;
    case 'building': return <Building className="w-4 h-4 text-blue-400" />;
    case 'palette': return <Palette className="w-4 h-4 text-pink-400" />;
    case 'bell': return <Bell className="w-4 h-4 text-yellow-400" />;
    case 'keyboard': return <Keyboard className="w-4 h-4 text-brand-text-muted" />;
    case 'code': return <Code className="w-4 h-4 text-cyan-400" />;
    case 'credit-card': return <CreditCard className="w-4 h-4 text-green-400" />;
    default: return <SettingsIcon className="w-4 h-4 text-brand-text-muted" />;
  }
}

export default SearchModal;
