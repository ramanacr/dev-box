import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredTheme, applyTheme, getEffectiveTheme } from './theme';

describe('Theme Controller', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-effective-theme');
  });

  it('defaults to system when nothing is saved', () => {
    expect(getStoredTheme()).toBe('system');
  });

  it('applies dark theme explicitly', () => {
    applyTheme('dark');
    expect(getStoredTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-effective-theme')).toBe('dark');
  });

  it('applies light theme explicitly', () => {
    applyTheme('light');
    expect(getStoredTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-effective-theme')).toBe('light');
  });

  it('dispatches custom event on theme change', () => {
    const listener = vi.fn();
    window.addEventListener('toolbox:themechange', listener);

    applyTheme('light');
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('toolbox:themechange', listener);
  });
});
