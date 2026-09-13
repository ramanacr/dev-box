import { useState } from 'preact/hooks';

interface DataTreeProps {
  data: unknown;
}

const MAX_TREE_NODES = 50000;

export function DataTree({ data }: DataTreeProps) {
  // Count total nodes first to protect DOM from enormous payloads
  const totalNodes = countNodes(data);
  if (totalNodes > MAX_TREE_NODES) {
    return (
      <div role="alert" style={{ padding: '16px', color: 'var(--warning-color)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
        Tree view disabled: input contains {totalNodes.toLocaleString()} nodes, exceeding the safety threshold of {MAX_TREE_NODES.toLocaleString()} nodes. Use raw view instead.
      </div>
    );
  }

  return (
    <div className="code-editor" style={{ padding: '12px', overflowX: 'auto', backgroundColor: 'var(--code-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
      <TreeNode label="root" value={data} depth={0} />
    </div>
  );
}

function countNodes(val: unknown, currentCount = { count: 0 }): number {
  currentCount.count++;
  if (currentCount.count > MAX_TREE_NODES) return currentCount.count;

  if (val && typeof val === 'object') {
    for (const child of Object.values(val)) {
      countNodes(child, currentCount);
      if (currentCount.count > MAX_TREE_NODES) break;
    }
  }
  return currentCount.count;
}

interface TreeNodeProps {
  label: string;
  value: unknown;
  depth: number;
}

function TreeNode({ label, value, depth }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  if (!isObject) {
    let displayVal = String(value);
    let color = 'var(--text-primary)';

    if (typeof value === 'string') {
      displayVal = `"${value}"`;
      color = 'var(--success-color)';
    } else if (typeof value === 'number') {
      color = 'var(--info-color)';
    } else if (typeof value === 'boolean') {
      color = 'var(--warning-color)';
    } else if (value === null) {
      color = 'var(--text-muted)';
      displayVal = 'null';
    }

    return (
      <div style={{ paddingLeft: `${depth * 16}px`, lineHeight: '1.6' }}>
        <span style={{ color: 'var(--accent-primary)', marginRight: '6px' }}>{label}:</span>
        <span style={{ color }}>{displayVal}</span>
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const badge = isArray ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <div style={{ paddingLeft: `${depth * 16}px`, lineHeight: '1.6' }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: 0,
        }}
        aria-expanded={!collapsed}
      >
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{badge}</span>
      </button>

      {!collapsed && (
        <div>
          {entries.map(([childKey, childVal]) => (
            <TreeNode key={childKey} label={childKey} value={childVal} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
