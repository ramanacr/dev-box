import { useEffect, useState } from 'preact/hooks';
import { applyTheme, getStoredTheme, type ThemeMode } from '../../platform/theme/theme';

interface NavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Navigation({ currentPath, onNavigate }: NavProps) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme());

  useEffect(() => {
    const updateStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  const handleThemeChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const newTheme = target.value as ThemeMode;
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // Team controls appear only when the server reports team mode, matching the Phase 3
  // requirement that the anonymous localhost profile shows no shared-workspace UI.
  const [teamEnabled, setTeamEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/team/me')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTeamEnabled(data?.enabled === true);
      })
      .catch(() => {
        // Team mode stays hidden when the probe cannot be reached.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = [
    { path: '/', label: 'Overview' },
    { path: '/docs', label: 'Docs' },
    { path: '/data', label: 'Data Workbench' },
    { path: '/command', label: 'Commands' },
    { path: '/regex', label: 'Regex' },
    { path: '/text', label: 'Text & Hashes' },
    { path: '/query', label: 'JSON Query' },
    { path: '/types', label: 'Types' },
    { path: '/jwt', label: 'JWT' },
    { path: '/code-image', label: 'Code Image' },
    { path: '/api-workbench', label: 'API Workbench' },
    { path: '/diagrams', label: 'Diagrams' },
    { path: '/git', label: 'Git Learning' },
    { path: '/algorithms', label: 'Algorithms' },
    ...(teamEnabled
      ? [
          { path: '/team', label: 'Team' },
          { path: '/admin', label: 'Admin' },
        ]
      : []),
  ];

  return (
    <header className="app-header">
      <div className="app-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
        <span>Developer Toolbox</span>
        <span className="badge">Local-first</span>
      </div>

      <nav aria-label="Tool navigation">
        <ul className="nav-links">
          {navItems.map((item) => {
            const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
            return (
              <li key={item.path} className="nav-item">
                <a
                  href={item.path}
                  className={isActive ? 'active' : ''}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(item.path);
                  }}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="header-actions">
        <select
          className="theme-select"
          value={theme}
          onChange={handleThemeChange}
          aria-label="Theme mode"
          title="Select theme: Light, Dark, or System"
        >
          <option value="system">💻 System</option>
          <option value="light">☀️ Light</option>
          <option value="dark">🌙 Dark</option>
        </select>

        <div className="status-indicator" title={isOnline ? 'Network available' : 'Offline mode active (workbench functions locally)'}>
          <span className={`status-dot ${isOnline ? '' : 'offline'}`} />
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
