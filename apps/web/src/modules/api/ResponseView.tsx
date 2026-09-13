import { useState } from 'preact/hooks';
import type { ApiExecution } from './requestRunner';
import type { ValidationResult } from './responseValidation';

export interface ResponseViewProps {
  execution?: ApiExecution;
  validation?: ValidationResult;
  onDownloadBinary?: (bytes: Uint8Array, filename: string) => void;
}

export function ResponseView({ execution, validation, onDownloadBinary }: ResponseViewProps) {
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'contract'>('body');

  if (!execution) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No request executed yet. Select an endpoint and click Send.
      </div>
    );
  }

  if (execution.error) {
    return (
      <div className="card" style={{ borderLeft: '4px solid var(--color-error)' }}>
        <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-error)' }}>
          {execution.statusText || 'Execution Error'}
        </h4>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {execution.error}
        </p>
      </div>
    );
  }

  const isSuccess = execution.status >= 200 && execution.status < 300;
  const statusColor = isSuccess
    ? 'var(--color-success)'
    : execution.status >= 400
    ? 'var(--color-error)'
    : 'var(--color-warning)';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: statusColor }}>
            {execution.status} {execution.statusText}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {execution.elapsedMs} ms
          </span>
          {validation && (
            <span
              className="badge"
              style={{
                backgroundColor: validation.valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: validation.valid ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              Contract: {validation.valid ? 'Passing' : `${validation.issues.length} issue(s)`}
            </span>
          )}
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn btn-sm ${activeTab === 'body' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('body')}
          >
            Body ({execution.bodyKind})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'headers' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('headers')}
          >
            Headers ({Object.keys(execution.headers).length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'contract' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('contract')}
          >
            Contract Validation
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'body' && (
        <div>
          {execution.bodyKind === 'binary' ? (
            <div style={{ padding: '16px', textAlign: 'center', background: 'var(--bg-card-subtle)', borderRadius: '4px' }}>
              <p style={{ margin: '0 0 12px 0' }}>{execution.bodyText}</p>
              {execution.bodyBytes && onDownloadBinary && (
                <button
                  className="btn btn-primary"
                  onClick={() => onDownloadBinary(execution.bodyBytes!, 'download.bin')}
                >
                  Download Binary File
                </button>
              )}
            </div>
          ) : (
            <pre style={{
              margin: 0,
              padding: '12px',
              backgroundColor: 'var(--bg-card-subtle)',
              borderRadius: '4px',
              maxHeight: '400px',
              overflow: 'auto',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {execution.bodyText || '<Empty response>'}
            </pre>
          )}
        </div>
      )}

      {activeTab === 'headers' && (
        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '6px' }}>Header</th>
              <th style={{ padding: '6px' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(execution.headers).map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '6px', fontWeight: 'bold', width: '35%' }}>{k}</td>
                <td style={{ padding: '6px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeTab === 'contract' && (
        <div>
          {!validation ? (
            <p style={{ color: 'var(--text-muted)' }}>No schema available for this response status code.</p>
          ) : validation.valid ? (
            <div style={{ color: 'var(--color-success)', padding: '12px', background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', borderRadius: '4px' }}>
              ✓ Response strictly conforms to the OpenAPI specification contract.
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--color-error)', fontWeight: 'bold', marginBottom: '8px' }}>
                Found {validation.issues.length} contract schema issue(s):
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem' }}>
                {validation.issues.map((issue, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    <code>{issue.path}</code>: {issue.message} ({issue.keyword})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
