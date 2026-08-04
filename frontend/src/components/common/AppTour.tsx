import React, { useEffect, useState } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { usePreferencesStore } from '../../store/preferencesStore';
import { useAuthStore } from '../../store/authStore';

const TOUR_OPTIONS = {
  showProgress: true,
  skipBeacon: true,
  primaryColor: 'var(--color-brand-primary)',
  backgroundColor: 'var(--color-brand-surface)',
  textColor: 'var(--color-brand-text)',
  arrowColor: 'var(--color-brand-surface)',
  overlayColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 10000,
};

const TOUR_STYLES = {
  tooltip: {
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--color-brand-border)',
  },
  buttonPrimary: {
    backgroundColor: 'var(--color-brand-primary)',
    borderRadius: '6px',
  },
  buttonBack: {
    color: 'var(--color-brand-text-muted)',
    marginRight: '8px',
  },
  buttonSkip: {
    color: 'var(--color-brand-text-muted)',
  },
};

const TOUR_STEPS = [
  {
    target: '#tour-sidebar',
    content: 'This is your main navigation. Access your boards, dashboard, settings, and more from here.',
    placement: 'right-start' as const,
  },
  {
    target: '#tour-my-work',
    content: 'Your personal workspace. See all tasks assigned to you across all projects in one place.',
    placement: 'right' as const,
  },
  {
    target: '#tour-global-search',
    content: 'Use Cmd+K or click here to quickly search for tasks, boards, and team members across your entire workspace.',
    placement: 'bottom' as const,
  },
  {
    target: '#tour-notifications',
    content: 'Stay updated! Important activities, mentions, and updates will appear here.',
    placement: 'bottom' as const,
  },
  {
    target: '#tour-profile',
    content: 'Manage your account, preferences, active sessions, and appearance settings here.',
    placement: 'bottom-end' as const,
  },
  {
    target: '#tour-ai-button',
    content: 'Need help? Ask KAI, your AI assistant, for project insights, tasks generation, or answers to any questions.',
    placement: 'left-end' as const,
  },
];

export const AppTour: React.FC = () => {
  const { user } = useAuthStore();
  const { preferences, updatePreferences } = usePreferencesStore();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (user && preferences && preferences.tour_completed === false) {
      // Small timeout to allow DOM elements (like sidebar/header) to mount properly
      const timer = setTimeout(() => {
        setRun(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, preferences]);

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      // Mark as completed
      updatePreferences({ tour_completed: true });
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleJoyrideCallback}
      options={TOUR_OPTIONS}
      styles={TOUR_STYLES}
    />
  );
};

export default AppTour;
