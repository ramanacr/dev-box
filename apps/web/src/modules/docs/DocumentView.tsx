import { type DocsDocument } from '@/platform/http/toolboxClient';
import { sanitizeHtml } from './sanitize';

interface DocumentViewProps {
  document: DocsDocument | null;
  onBack: () => void;
  isLoading: boolean;
  errorMessage?: string;
}

export function DocumentView({ document, onBack, isLoading, errorMessage }: DocumentViewProps) {
  if (errorMessage) {
    return (
      <div className="card">
        <button className="btn" onClick={onBack} style={{ marginBottom: '16px' }}>
          ← Back to Search
        </button>
        <div role="alert" style={{ color: 'var(--danger-color)' }}>
          {errorMessage}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card">
        <div style={{ color: 'var(--text-muted)' }}>Loading document…</div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  return (
    <article className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button className="btn" onClick={onBack} aria-label="Back to results">
          ← Back to Search
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
            {document.source}
          </span>
          <a
            href={document.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.85rem' }}
            title="Open upstream canonical documentation"
          >
            Upstream ↗
          </a>
        </div>
      </div>

      <h1 style={{ fontSize: '1.6rem', marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
        {document.title}
      </h1>

      <div
        className="doc-body"
        style={{
          color: 'var(--text-secondary)',
          lineHeight: '1.7',
          fontSize: '0.95rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(document.bodyHtml) }}
      />

      <footer style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <p>{document.attribution}</p>
      </footer>
    </article>
  );
}
