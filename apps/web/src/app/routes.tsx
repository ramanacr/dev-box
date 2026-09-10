import { lazy, Suspense } from 'preact/compat';
import { DashboardPage } from './pages/DashboardPage';

// Route-level dynamic lazy imports for modular code splitting
const DocsPage = lazy(() => import('@/modules/docs/DocsPage').then((m) => ({ default: m.DocsPage })));
const DataPage = lazy(() => import('@/modules/data/DataPage').then((m) => ({ default: m.DataPage })));
const RegexPage = lazy(() => import('@/modules/regex/RegexPage').then((m) => ({ default: m.RegexPage })));
const TextPage = lazy(() => import('@/modules/text/TextPage').then((m) => ({ default: m.TextPage })));
const CodeImagePage = lazy(() => import('@/modules/code-image/CodeImagePage').then((m) => ({ default: m.CodeImagePage })));
const ApiPage = lazy(() => import('@/modules/api/ApiPage').then((m) => ({ default: m.ApiPage })));
const DiagramPage = lazy(() => import('@/modules/diagrams/DiagramPage').then((m) => ({ default: m.DiagramPage })));

interface RouterViewProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function RouterView({ currentPath, onNavigate }: RouterViewProps) {
  const renderRoute = () => {
    if (currentPath === '/' || currentPath === '') {
      return <DashboardPage onNavigate={onNavigate} />;
    }
    if (currentPath.startsWith('/docs')) {
      return <DocsPage />;
    }
    if (currentPath.startsWith('/data')) {
      return <DataPage />;
    }
    if (currentPath.startsWith('/regex')) {
      return <RegexPage />;
    }
    if (currentPath.startsWith('/text')) {
      return <TextPage />;
    }
    if (currentPath.startsWith('/code-image')) {
      return <CodeImagePage />;
    }
    if (currentPath.startsWith('/api')) {
      return <ApiPage />;
    }
    if (currentPath.startsWith('/diagrams')) {
      return <DiagramPage />;
    }


    // Default 404 fallback
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <h2 style={{ marginBottom: '8px' }}>404 - Tool Not Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          The requested route &ldquo;{currentPath}&rdquo; does not exist.
        </p>
        <button className="btn btn-primary" onClick={() => onNavigate('/')}>
          ← Return to Overview
        </button>
      </div>
    );
  };

  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>Loading tool module…</div>}>
      {renderRoute()}
    </Suspense>
  );
}
