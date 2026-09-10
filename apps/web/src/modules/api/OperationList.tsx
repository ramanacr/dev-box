import type { ApiOperation } from './openapi';

export interface OperationListProps {
  operations: ApiOperation[];
  selectedId?: string;
  onSelect: (op: ApiOperation) => void;
  filterText: string;
  onFilterChange: (text: string) => void;
}

export function OperationList({
  operations,
  selectedId,
  onSelect,
  filterText,
  onFilterChange,
}: OperationListProps) {
  const filtered = operations.filter((op) => {
    if (!filterText.trim()) return true;
    const query = filterText.toLowerCase();
    return (
      op.path.toLowerCase().includes(query) ||
      op.method.toLowerCase().includes(query) ||
      op.summary.toLowerCase().includes(query) ||
      op.id.toLowerCase().includes(query)
    );
  });

  const getMethodBadgeClass = (method: string) => {
    switch (method.toLowerCase()) {
      case 'get':
        return 'badge-get';
      case 'post':
        return 'badge-post';
      case 'put':
        return 'badge-put';
      case 'delete':
        return 'badge-delete';
      case 'patch':
        return 'badge-patch';
      default:
        return 'badge-default';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '8px' }}>
        <input
          type="text"
          className="input"
          placeholder="Filter endpoints (e.g. GET /pets)..."
          value={filterText}
          onInput={(e) => onFilterChange((e.target as HTMLInputElement).value)}
          style={{ width: '100%', fontSize: '0.85rem' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No matching endpoints found
          </div>
        ) : (
          filtered.map((op) => {
            const isSelected = op.id === selectedId;
            return (
              <div
                key={op.id}
                role="button"
                tabIndex={0}
                className={`operation-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(op)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(op);
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--bg-card-hover, rgba(59, 130, 246, 0.1))' : 'transparent',
                  border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontWeight: 'bold',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    backgroundColor: op.method === 'get' ? '#10b981' : op.method === 'post' ? '#3b82f6' : op.method === 'delete' ? '#ef4444' : '#f59e0b',
                    color: '#fff',
                    minWidth: '45px',
                    textAlign: 'center',
                  }}
                >
                  {op.method}
                </span>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{op.path}</div>
                  {op.summary && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {op.summary}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
