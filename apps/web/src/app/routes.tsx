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
const GitSandboxPage = lazy(() => import('@/modules/learning/git/GitSandboxPage').then((m) => ({ default: m.GitSandboxPage })));
const AlgorithmPage = lazy(() => import('@/modules/learning/algorithms/AlgorithmPage').then((m) => ({ default: m.AlgorithmPage })));
const CommandPage = lazy(() => import('@/modules/command/CommandPage').then((m) => ({ default: m.CommandPage })));
const JwtPage = lazy(() => import('@/modules/jwt/JwtPage').then((m) => ({ default: m.JwtPage })));
const QueryPage = lazy(() => import('@/modules/query/QueryPage').then((m) => ({ default: m.QueryPage })));
const TypesPage = lazy(() => import('@/modules/types/TypesPage').then((m) => ({ default: m.TypesPage })));
const CronPage = lazy(() => import('@/modules/cron/CronPage').then((m) => ({ default: m.CronPage })));
const DiffPage = lazy(() => import('@/modules/diff/DiffPage').then((m) => ({ default: m.DiffPage })));
const SqlPage = lazy(() => import('@/modules/sql/SqlPage').then((m) => ({ default: m.SqlPage })));
const EncodePage = lazy(() => import('@/modules/text/EncodePage').then((m) => ({ default: m.EncodePage })));
const WorkspacePage = lazy(() => import('@/modules/team/WorkspacePage').then((m) => ({ default: m.WorkspacePage })));
const AdminPage = lazy(() => import('@/modules/team/AdminPage').then((m) => ({ default: m.AdminPage })));

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
    if (currentPath.startsWith('/api-workbench')) {
      return <ApiPage />;
    }
    if (currentPath.startsWith('/diagrams')) {
      return <DiagramPage />;
    }
    if (currentPath.startsWith('/git')) {
      return <GitSandboxPage />;
    }
    if (currentPath.startsWith('/algorithms')) {
      return <AlgorithmPage />;
    }
    if (currentPath.startsWith('/command')) {
      return <CommandPage />;
    }
    if (currentPath.startsWith('/jwt')) {
      return <JwtPage />;
    }
    if (currentPath.startsWith('/query')) {
      return <QueryPage />;
    }
    if (currentPath.startsWith('/types')) {
      return <TypesPage />;
    }
    if (currentPath.startsWith('/cron')) {
      return <CronPage />;
    }
    if (currentPath.startsWith('/diff')) {
      return <DiffPage />;
    }
    if (currentPath.startsWith('/sql')) {
      return <SqlPage />;
    }
    if (currentPath.startsWith('/encode')) {
      return <EncodePage />;
    }
    if (currentPath.startsWith('/team')) {
      return <WorkspacePage />;
    }
    if (currentPath.startsWith('/admin')) {
      return <AdminPage />;
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
