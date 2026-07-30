export interface NavigationSearchItem {
  id: string;
  title: string;
  description: string;
  category: 'Navigation' | 'Settings' | 'Admin';
  url: string;
  keywords: string[];
  iconType: 'dashboard' | 'check-square' | 'clock' | 'clipboard' | 'shield' | 'users' | 'kanban' | 'user' | 'key' | 'building' | 'palette' | 'bell' | 'keyboard' | 'code' | 'credit-card';
}

export const SYSTEM_NAVIGATION_ITEMS: NavigationSearchItem[] = [
  // Core Navigation
  {
    id: 'nav-dashboard',
    title: 'Dashboard',
    description: 'Workspace metrics, KPIs, active meetings, and strategic projects overview',
    category: 'Navigation',
    url: '/dashboard',
    keywords: ['dashboard', 'home', 'kpi', 'metrics', 'overview', 'summary', 'analytics'],
    iconType: 'dashboard',
  },
  {
    id: 'nav-my-work',
    title: 'My Work',
    description: 'All tasks assigned to you across organization boards',
    category: 'Navigation',
    url: '/my-work',
    keywords: ['my work', 'my tasks', 'assigned to me', 'tasks', 'todo', 'work'],
    iconType: 'check-square',
  },
  {
    id: 'nav-timesheets',
    title: 'My Timesheets',
    description: 'Log weekly work effort, project hours, and submit timesheets',
    category: 'Navigation',
    url: '/timesheets',
    keywords: ['timesheet', 'time', 'hours', 'log effort', 'work log', 'time entry'],
    iconType: 'clock',
  },
  {
    id: 'nav-timesheet-approvals',
    title: 'Timesheet Approvals',
    description: 'Manager queue for reviewing and approving member timesheets',
    category: 'Admin',
    url: '/timesheets/approvals',
    keywords: ['approvals', 'review timesheets', 'approve hours', 'pending timesheets', 'manager queue'],
    iconType: 'clipboard',
  },
  {
    id: 'nav-timesheet-admin',
    title: 'Timesheet Policy & Admin',
    description: 'Configure organization timesheet policies, row locking, and approvers',
    category: 'Admin',
    url: '/timesheets/admin',
    keywords: ['timesheet policy', 'timesheet admin', 'locking', 'approvers', 'export csv', 'overtime'],
    iconType: 'shield',
  },
  {
    id: 'nav-admin-panel',
    title: 'Admin Panel & Health',
    description: 'Platform system status, health monitoring, and security audit logs',
    category: 'Admin',
    url: '/admin',
    keywords: ['admin', 'system status', 'health', 'audit log', 'security logs', 'superadmin'],
    iconType: 'shield',
  },
  {
    id: 'nav-admin-users',
    title: 'User Directory & Management',
    description: 'Manage workspace members, assign roles (Member, Manager, Superadmin)',
    category: 'Admin',
    url: '/admin/users',
    keywords: ['users', 'user management', 'members', 'roles', 'assign role', 'user directory'],
    iconType: 'users',
  },
  {
    id: 'nav-admin-boards',
    title: 'Board Permissions',
    description: 'Manage board-level access and member permissions',
    category: 'Admin',
    url: '/admin/boards',
    keywords: ['board permissions', 'board access', 'permissions', 'member access'],
    iconType: 'kanban',
  },

  // Settings
  {
    id: 'set-account',
    title: 'My Account & Profile Settings',
    description: 'Edit your name, email, avatar, and personal details',
    category: 'Settings',
    url: '/settings/account',
    keywords: ['profile', 'account', 'name', 'avatar', 'email', 'my account', 'user profile', 'settings'],
    iconType: 'user',
  },
  {
    id: 'set-security',
    title: 'Security & Active Sessions Settings',
    description: 'Manage active multi-device sessions, password, and security event log',
    category: 'Settings',
    url: '/settings/security',
    keywords: ['security', 'password', 'sessions', 'active sessions', 'revoke session', 'security logs', 'auth', 'settings'],
    iconType: 'key',
  },
  {
    id: 'set-organization',
    title: 'Organization Profile & Member Invitations',
    description: 'Edit organization branding, logo, and manage team member invitations',
    category: 'Settings',
    url: '/settings/organization',
    keywords: ['organization', 'org profile', 'invitations', 'invite member', 'branding', 'logo', 'revoke invite', 'settings'],
    iconType: 'building',
  },
  {
    id: 'set-appearance',
    title: 'Appearance & Theme Settings',
    description: 'Toggle UI theme (dark/light), density, and layout preferences',
    category: 'Settings',
    url: '/settings/appearance',
    keywords: ['appearance', 'theme', 'dark mode', 'light mode', 'ui preferences', 'density', 'color', 'settings'],
    iconType: 'palette',
  },
  {
    id: 'set-notifications',
    title: 'Notification Preferences Settings',
    description: 'Configure in-app alerts and email notification preferences',
    category: 'Settings',
    url: '/settings/notifications',
    keywords: ['notifications', 'notification settings', 'email alerts', 'in-app alerts', 'preferences', 'settings'],
    iconType: 'bell',
  },
  {
    id: 'set-keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'View and learn system keyboard shortcuts (Cmd+K, Ctrl+B, etc.)',
    category: 'Settings',
    url: '/settings/keyboard-shortcuts',
    keywords: ['keyboard shortcuts', 'shortcuts', 'hotkeys', 'cmd+k', 'ctrl+b', 'settings'],
    iconType: 'keyboard',
  },
  {
    id: 'set-api-keys',
    title: 'API Keys & Developers',
    description: 'Manage API tokens for custom integrations',
    category: 'Settings',
    url: '/settings/api-keys',
    keywords: ['api keys', 'tokens', 'developer', 'webhooks', 'integrations', 'settings'],
    iconType: 'code',
  },
  {
    id: 'set-billing',
    title: 'Billing & Subscription Settings',
    description: 'Manage plan subscription, invoices, and billing details',
    category: 'Settings',
    url: '/settings/billing',
    keywords: ['billing', 'subscription', 'plan', 'payment', 'invoices', 'pricing', 'settings'],
    iconType: 'credit-card',
  },
];
