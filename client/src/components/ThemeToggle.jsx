import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';

export function ThemeToggle({ compact = false }) {
  const { project, updateSettings } = useApp();
  const theme = project.settings.theme || 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle ${compact ? 'compact' : ''}`}
      onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <i className={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} />
      {!compact && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
