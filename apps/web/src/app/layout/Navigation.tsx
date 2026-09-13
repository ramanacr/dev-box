import { useEffect, useState } from 'preact/hooks';
import { applyTheme, getStoredTheme, type ThemeMode } from '../../platform/theme/theme';
import { NavIcon, type NavIconName } from './NavIcon';

interface NavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface NavEntry {
  path: string;
  label: string;
  icon: NavIconName;
}

interface NavGroup {
  /** Section heading, or null for entries that stand on their own. */
  title: string | null;
  items: NavEntry[];
}

const COLLAPSE_STORAGE_KEY = 'toolbox:nav-collapsed';

/**
 * The tools, grouped by the job they do.
 *
 * Eighteen destinations in one flat row is a wall to scan, which is what the
 * horizontal header had become. Grouping is the part that actually simplifies it:
 * a reader looking for JSONPath scans four headings rather than eighteen labels.
 *
 * Paths are a contract with the server. internal/httpapi.ClientRoutes decides which
 * paths return the SPA shell rather than a 404, and TestClientRoutesCoverNavigation
 * asserts the two lists agree - so adding an entry here without adding the route
 * there fails the Go suite rather than silently 404ing in production.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [{ path: '/', label: 'Overview', icon: 'overview' }],
  },
  {
    title: 'Reference',
    items: [
      { path: '/docs', label: 'Documentation', icon: 'docs' },
      { path: '/command', label: 'Commands', icon: 'command' },
    ],
  },
  {
    title: 'Data',
    items: [
      { path: '/data', label: 'Data Workbench', icon: 'data' },
      { path: '/query', label: 'JSON Query', icon: 'query' },
      { path: '/types', label: 'Type Generator', icon: 'types' },
      { path: '/sql', label: 'SQL Assistant', icon: 'sql' },
    ],
  },
  {
    title: 'Text',
    items: [
      { path: '/regex', label: 'Regex', icon: 'regex' },
      { path: '/diff', label: 'Text Diff', icon: 'diff' },
      { path: '/text', label: 'Text & Hashes', icon: 'text' },
      { path: '/encode', label: 'Encode & Time', icon: 'encode' },
    ],
  },
  {
    title: 'Web & APIs',
    items: [
      { path: '/api-workbench', label: 'API Workbench', icon: 'api' },
      { path: '/jwt', label: 'JWT Inspector', icon: 'jwt' },
      { path: '/cron', label: 'Cron', icon: 'cron' },
    ],
  },
  {
    title: 'Create',
    items: [
      { path: '/diagrams', label: 'Diagrams', icon: 'diagrams' },
      { path: '/code-image', label: 'Code Image', icon: 'codeImage' },
    ],
  },
  {
    title: 'Learn',
    items: [
      { path: '/git', label: 'Git Learning', icon: 'git' },
      { path: '/algorithms', label: 'Algorithms', icon: 'algorithms' },
    ],
  },
];

const TEAM_GROUP: NavGroup = {
  title: 'Team',
  items: [
    { path: '/team', label: 'Workspace', icon: 'team' },
    { path: '/admin', label: 'Admin', icon: 'admin' },
  ],
};

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  } catch {
    // Private mode and blocked site data both throw on access rather than
    // returning null, so an expanded sidebar is the fallback.
    return false;
  }
}

export function Navigation({ currentPath, onNavigate }: NavProps) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme());
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

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

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
    } catch {
      // A remembered width is a convenience; failing to store it changes nothing
      // for this session.
    }
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

  const groups = teamEnabled ? [...NAV_GROUPS, TEAM_GROUP] : NAV_GROUPS;

  const isActive = (path: string) =>
    currentPath === path || (path !== '/' && currentPath.startsWith(path));

  return (
    <aside className={`app-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="app-logo">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
        <span className="app-logo-text">Developer Toolbox</span>
        <span className="badge">Local-first</span>
      </div>

      <button
        type="button"
        className="nav-collapse-toggle"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points={collapsed ? '9 6 15 12 9 18' : '15 6 9 12 15 18'} />
        </svg>
      </button>

      <nav aria-label="Tool navigation" className="app-nav">
        {groups.map((group) => (
          <div className="nav-group" key={group.title ?? 'primary'}>
            {group.title && (
              // Hidden rather than removed when collapsed: the heading still names
              // the group for a screen reader, which has no icons to go on.
              <h2 className="nav-group-title">{group.title}</h2>
            )}
            <ul className="nav-links">
              {group.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <li key={item.path} className="nav-item">
                    <a
                      href={item.path}
                      className={active ? 'active' : ''}
                      aria-current={active ? 'page' : undefined}
                      // The label is hidden by CSS when collapsed, so the title
                      // attribute is what names the target on hover.
                      title={item.label}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(item.path);
                      }}
                    >
                      <NavIcon name={item.icon} />
                      <span className="nav-label">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
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

        <div
          className="status-indicator"
          title={
            isOnline
              ? 'Network available'
              : 'Offline mode active (workbench functions locally)'
          }
        >
          <span className={`status-dot ${isOnline ? '' : 'offline'}`} />
          <span className="status-text">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </aside>
  );
}
