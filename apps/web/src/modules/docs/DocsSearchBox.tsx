import { useState, useEffect, useRef } from 'preact/hooks';

interface DocsSearchBoxProps {
  value: string;
  source: string;
  onChange: (query: string) => void;
  onSourceChange: (source: string) => void;
  onSubmit: (query?: string) => void;
  onClear: () => void;
  onKeyDownNav?: (e: KeyboardEvent) => void;
  isLoading: boolean;
}

export function DocsSearchBox({
  value,
  source,
  onChange,
  onSourceChange,
  onSubmit,
  onClear,
  onKeyDownNav,
  isLoading,
}: DocsSearchBoxProps) {
  const [localVal, setLocalVal] = useState(value);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleInput = (newVal: string) => {
    setLocalVal(newVal);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      onChange(newVal);
    }, 200);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      onChange(localVal);
      onSubmit(localVal);
    } else if (e.key === 'Escape') {
      setLocalVal('');
      onClear();
    } else if (onKeyDownNav && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      onKeyDownNav(e);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1.25rem' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <input
          type="search"
          className="input"
          placeholder="Search offline docs (e.g. dependency injection, interfaces, rebase)..."
          value={localVal}
          onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          aria-label="Documentation search"
          aria-controls="docs-search-results"
          autoFocus
        />
        {isLoading && (
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Searching…
          </span>
        )}
      </div>

      <select
        className="select"
        style={{ width: '160px' }}
        value={source}
        onChange={(e) => onSourceChange((e.target as HTMLSelectElement).value)}
        aria-label="Filter documentation source"
      >
        <option value="">All Sources</option>
        <option value="aspnetcore">ASP.NET Core</option>
        <option value="typescript">TypeScript</option>
        <option value="git">Git</option>
        <option value="docker">Docker</option>
        <option value="user">User Uploads</option>
      </select>

      {localVal && (
        <button className="btn" type="button" onClick={() => { setLocalVal(''); onClear(); }}>
          Clear
        </button>
      )}
    </div>
  );
}
