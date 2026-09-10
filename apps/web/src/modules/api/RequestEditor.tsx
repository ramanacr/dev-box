import { useState, useEffect } from 'preact/hooks';
import type { ApiOperation, ApiParameter } from './openapi';
import { sessionEnv } from './environmentStore';

export interface RequestEditorProps {
  operation: ApiOperation;
  serverUrl: string;
  onSend: (requestConfig: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }) => void;
  isExecuting: boolean;
}

export function RequestEditor({
  operation,
  serverUrl,
  onSend,
  isExecuting,
}: RequestEditorProps) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<Record<string, string>>({
    Accept: 'application/json',
  });
  const [bodyText, setBodyText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');

  useEffect(() => {
    // Populate default parameter values from operation definition
    const initialParams: Record<string, string> = {};
    for (const p of operation.parameters) {
      if (p.example !== undefined) {
        initialParams[p.name] = String(p.example);
      } else {
        initialParams[p.name] = '';
      }
    }
    setParamValues(initialParams);

    // Initial default body from schema/example if present
    if (operation.requestBody) {
      if (operation.requestBody.example) {
        setBodyText(JSON.stringify(operation.requestBody.example, null, 2));
      } else if (operation.requestBody.schema) {
        setBodyText('{\n  \n}');
      }
    } else {
      setBodyText('');
    }
  }, [operation.id]);

  // Construct target URL by resolving path parameters and query strings
  let computedPath = operation.path;
  const queryParams = new URLSearchParams();

  for (const p of operation.parameters) {
    const val = paramValues[p.name] || '';
    if (p.in === 'path') {
      computedPath = computedPath.replace(`{${p.name}}`, encodeURIComponent(val || `{${p.name}}`));
    } else if (p.in === 'query' && val.trim() !== '') {
      queryParams.append(p.name, val.trim());
    }
  }

  const queryString = queryParams.toString();
  const fullBase = serverUrl.replace(/\/$/, '');
  const targetUrl = `${fullBase}${computedPath}${queryString ? '?' + queryString : ''}`;

  // Check unresolved environment variables
  const resolvedCheck = sessionEnv.resolve(targetUrl);
  const hasMissingVars = resolvedCheck.missingVariables.length > 0;

  const handleSend = () => {
    const requestHeaders: Record<string, string> = { ...headers };
    if (operation.requestBody?.contentType && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = operation.requestBody.contentType;
    }

    onSend({
      url: targetUrl,
      method: operation.method,
      headers: requestHeaders,
      body: ['GET', 'HEAD'].includes(operation.method.toUpperCase()) ? undefined : bodyText,
    });
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Bar: Method, URL bar, and Send button */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          style={{
            fontWeight: 'bold',
            fontSize: '0.85rem',
            padding: '6px 12px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            backgroundColor: 'var(--bg-card-subtle)',
            border: '1px solid var(--border-color)',
          }}
        >
          {operation.method}
        </span>
        <input
          type="text"
          className="input"
          readOnly
          value={targetUrl}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={isExecuting || hasMissingVars}
          title={hasMissingVars ? `Missing variables: ${resolvedCheck.missingVariables.join(', ')}` : 'Send direct HTTP request'}
        >
          {isExecuting ? 'Sending…' : 'Send'}
        </button>
      </div>

      {hasMissingVars && (
        <div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>
          ⚠️ Cannot send: unresolved variable(s): {resolvedCheck.missingVariables.map((v) => '{{' + v + '}}').join(', ')}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
        <button
          className={`btn btn-sm ${activeTab === 'params' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('params')}
        >
          Parameters ({operation.parameters.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'headers' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
        {operation.requestBody && (
          <button
            className={`btn btn-sm ${activeTab === 'body' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('body')}
          >
            Body
          </button>
        )}
      </div>

      {/* Parameters Tab */}
      {activeTab === 'params' && (
        <div>
          {operation.parameters.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              No parameters defined for this operation.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {operation.parameters.map((p) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '180px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{p.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      ({p.in}{p.required ? ', required' : ''})
                    </span>
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder={p.description || `Value for ${p.name}`}
                    value={paramValues[p.name] || ''}
                    onInput={(e) =>
                      setParamValues({
                        ...paramValues,
                        [p.name]: (e.target as HTMLInputElement).value,
                      })
                    }
                    style={{ flex: 1, fontSize: '0.85rem' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Headers Tab */}
      {activeTab === 'headers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(headers).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                className="input"
                value={k}
                readOnly
                style={{ width: '180px', fontSize: '0.85rem', fontWeight: 'bold' }}
              />
              <input
                type="text"
                className="input"
                value={v}
                onInput={(e) =>
                  setHeaders({
                    ...headers,
                    [k]: (e.target as HTMLInputElement).value,
                  })
                }
                style={{ flex: 1, fontSize: '0.85rem' }}
              />
            </div>
          ))}
          <div style={{ marginTop: '8px' }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                const headerName = prompt('Enter new header name (e.g. Authorization):');
                if (headerName && headerName.trim()) {
                  setHeaders({ ...headers, [headerName.trim()]: '' });
                }
              }}
            >
              + Add Header
            </button>
          </div>
        </div>
      )}

      {/* Body Tab */}
      {activeTab === 'body' && operation.requestBody && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Content-Type: <code>{operation.requestBody.contentType}</code>
            </span>
          </div>
          <textarea
            className="input"
            rows={8}
            value={bodyText}
            onInput={(e) => setBodyText((e.target as HTMLTextAreaElement).value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            placeholder="Enter request payload..."
          />
        </div>
      )}
    </div>
  );
}
