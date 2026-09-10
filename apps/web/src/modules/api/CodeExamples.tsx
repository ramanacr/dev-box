import { useState } from 'preact/hooks';
import type { ApiOperation } from './openapi';

export interface CodeExamplesProps {
  operation?: ApiOperation;
  resolvedUrl: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export function CodeExamples({
  operation,
  resolvedUrl,
  method,
  headers,
  body,
}: CodeExamplesProps) {
  const [copiedKind, setCopiedKind] = useState<string | null>(null);

  if (!operation) return null;

  // Filter out secret tokens from cURL / C# code snippets
  const cleanHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower.includes('token') || lower.includes('secret') || lower.includes('key')) {
      cleanHeaders[k] = '[REDACTED_SECRET]';
    } else {
      cleanHeaders[k] = v;
    }
  }

  // Generate cURL command
  let curl = `curl -X ${method.toUpperCase()} "${resolvedUrl}"`;
  for (const [k, v] of Object.entries(cleanHeaders)) {
    curl += ` \\
  -H "${k}: ${v}"`;
  }
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    curl += ` \\
  -d '${body.replace(/'/g, "'\\''")}'`;
  }

  const csharpHeaders = Object.entries(cleanHeaders)
    .map(([k, v]) => 'request.Headers.TryAddWithoutValidation("' + k + '", "' + v + '");')
    .join('\n        ');

  const csharpBody = body && !['GET', 'HEAD'].includes(method.toUpperCase())
    ? 'request.Content = new StringContent(@"' + body.replace(/"/g, '""') + '", Encoding.UTF8, "' + (cleanHeaders['Content-Type'] || 'application/json') + '");'
    : '';

  const csharp = [
    'using System.Net.Http;',
    'using System.Text;',
    '',
    'using var client = new HttpClient();',
    `using var request = new HttpRequestMessage(HttpMethod.${capitalize(method)}, "${resolvedUrl}");`,
    csharpHeaders ? '        ' + csharpHeaders : '',
    csharpBody ? '        ' + csharpBody : '',
    'var response = await client.SendAsync(request);',
    'var content = await response.Content.ReadAsStringAsync();',
  ].filter(Boolean).join('\n');


  const copyToClipboard = async (text: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ marginTop: '16px' }}>
      <details className="card" style={{ padding: '8px 16px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Code Snippets (cURL & C#)
        </summary>
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* cURL Snippet */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>cURL Command</span>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => copyToClipboard(curl, 'curl')}
              >
                {copiedKind === 'curl' ? 'Copied!' : 'Copy cURL'}
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: '8px 12px',
              backgroundColor: 'var(--bg-card-subtle)',
              borderRadius: '4px',
              fontSize: '0.8rem',
              overflow: 'auto',
              fontFamily: 'monospace',
            }}>
              {curl}
            </pre>
          </div>

          {/* C# Snippet */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>C# HttpClient</span>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => copyToClipboard(csharp, 'csharp')}
              >
                {copiedKind === 'csharp' ? 'Copied!' : 'Copy C#'}
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: '8px 12px',
              backgroundColor: 'var(--bg-card-subtle)',
              borderRadius: '4px',
              fontSize: '0.8rem',
              overflow: 'auto',
              fontFamily: 'monospace',
            }}>
              {csharp}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return 'Get';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
