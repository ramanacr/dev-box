import { type DocsSearchResult } from '@/platform/http/toolboxClient';
import { sanitizeSnippet } from './sanitize';

interface DocsResultsProps {
  results: DocsSearchResult[];
  selectedIndex: number;
  onSelect: (id: string, index: number) => void;
  isLoading: boolean;
  hasSearched: boolean;
  errorMessage?: string;
}

export function DocsResults({
  results,
  selectedIndex,
  onSelect,
  isLoading,
  hasSearched,
  errorMessage,
}: DocsResultsProps) {
  if (errorMessage) {
    return (
      <div role="alert" style={{ padding: '16px', background: 'rgba(248, 113, 113, 0.15)', border: '1px solid var(--danger-color)', borderRadius: 'var(--radius-md)', color: '#fca5a5', marginBottom: '1rem' }}>
        <strong>Search Error:</strong> {errorMessage}
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ color: 'var(--text-muted)', padding: '16px 0' }}>Searching documentation…</div>;
  }

  if (hasSearched && results.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', padding: '24px 0', textAlign: 'center' }}>
        No documentation found matching your query.
      </div>
    );
  }

  if (!hasSearched) {
    return null;
  }

  return (
    <div id="docs-search-results">
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Found {results.length} {results.length === 1 ? 'match' : 'matches'}
      </div>

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {results.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <li
              key={item.id}
              tabIndex={0}
              role="button"
              aria-selected={isSelected}
              onClick={() => onSelect(item.id, idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item.id, idx);
                }
              }}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '0.95rem' }}>
                  {item.title}
                </span>
                <span style={{ fontSize: '0.75rem', padding: '1px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-muted)' }}>
                  {item.source}
                </span>
              </div>
              <div
                style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: sanitizeSnippet(item.snippet) }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
