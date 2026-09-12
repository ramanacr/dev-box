interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const tools = [
    {
      title: 'Documentation Search',
      path: '/docs',
      description: 'Search offline documentation packs powered by pure SQLite FTS5 with BM25 ranking and highlighted snippets.',
      badge: 'SQLite FTS5',
    },
    {
      title: 'Structured Data Workbench',
      path: '/data',
      description: 'Format, validate, and convert JSON, YAML, XML, and CSV. Infer JSON Schema 2020-12 and inspect data trees safely.',
      badge: 'Web Worker',
    },
    {
      title: 'Command Reference',
      path: '/command',
      description: 'Explain a shell command token by token, with warnings for destructive flags. Nothing is executed — it is static analysis of the text you paste.',
      badge: 'Explainer',
    },
    {
      title: 'JSON Query',
      path: '/query',
      description: 'Run JSONPath expressions over a document with filters, slices and recursive descent. Filter expressions are parsed, never evaluated as code.',
      badge: 'JSONPath',
    },
    {
      title: 'Type Generator',
      path: '/types',
      description: 'Turn a JSON sample into type declarations for TypeScript, C#, Java, Kotlin, Go, Python and Rust, with optional and nullable fields inferred.',
      badge: '7 languages',
    },
    {
      title: 'JWT Inspector',
      path: '/jwt',
      description: 'Decode a JSON Web Token to read its header, claims and timing. Decode only — no signature verification and no validity claim.',
      badge: 'Decode only',
    },
    {
      title: 'Regex Workbench',
      path: '/regex',
      description: 'Test ECMAScript regular expressions with real-time match highlights, capture group extraction, and replacement preview.',
      badge: 'Client-side',
    },
    {
      title: 'Text Transforms & Hashes',
      path: '/text',
      description: 'Encode/decode Base64 and URLs, compute Web Crypto SHA-256 hashes, generate UUIDs, and format timezones.',
      badge: 'Web Crypto',
    },
    {
      title: 'Code Image Exporter',
      path: '/code-image',
      description: 'Render beautiful, configurable code cards with syntax highlighting and window chrome. Export safely to SVG and PNG.',
      badge: 'SVG / Canvas',
    },
    {
      title: 'API Workbench',
      path: '/api-workbench',
      description: 'Inspect OpenAPI 3.0/3.1 contracts, configure session-only environments, compose requests, and validate response schemas offline.',
      badge: 'OpenAPI / Guarded',
    },
    {
      title: 'Diagrams Studio',
      path: '/diagrams',
      description: 'Create architecture, sequence, class, and ER diagrams with Mermaid or sketch ideas on a local whiteboard canvas.',
      badge: 'Mermaid / Canvas',
    },
    {
      title: 'Git Learning Sandbox',
      path: '/git',
      description: 'Master Git branching, merging, rebasing, and cherry-picking with an interactive DAG graph simulation and guided lessons.',
      badge: 'DAG / Sandbox',
    },
    {
      title: 'Algorithm Visualizer',
      path: '/algorithms',
      description: 'Step through Bubble Sort, Merge Sort, BFS, and Dijkstra algorithms with visual representations and state tables.',
      badge: 'Interactive / SVG',
    },
  ];



  return (
    <section aria-labelledby="dashboard-heading">
      <div style={{ marginBottom: '2rem' }}>
        <h1 id="dashboard-heading" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          Developer Toolbox
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          A private, offline-capable developer workbench. All data transformations and inputs remain 100% inside your browser.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {tools.map((tool) => (
          <div key={tool.path} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1.15rem' }}>{tool.title}</h2>
                <span className="badge" style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--accent-bg)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', borderRadius: '4px' }}>
                  {tool.badge}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                {tool.description}
              </p>
            </div>
            <button
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => onNavigate(tool.path)}
            >
              Open Tool →
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
