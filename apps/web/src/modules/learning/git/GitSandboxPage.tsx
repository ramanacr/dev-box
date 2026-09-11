import { useState, useEffect } from 'preact/hooks';
import {
  type GitCommand,
  type RepositoryState,
  getHeadCommitId,
  isCommandError,
} from './model';
import { reduceRepository } from './reducer';
import { GIT_LEVELS, type LessonLevel } from './levels';
import { WorkspaceStore } from '../../../platform/storage/workspaceStore';

const STORAGE_KEY_PROGRESS = 'git-learning-progress';

function parseGitCommand(input: string): GitCommand | { error: string } {
  const parts = input.trim().split(/\s+/);
  if (parts[0] !== 'git') {
    return { error: 'Commands must start with "git" (e.g., git commit, git branch, git switch)' };
  }

  const sub = parts[1];
  if (!sub) {
    return { error: 'Please specify a git sub-command' };
  }

  if (sub === 'commit') {
    let msg = '';
    const mIdx = parts.indexOf('-m');
    if (mIdx !== -1 && parts[mIdx + 1]) {
      msg = parts.slice(mIdx + 1).join(' ').replace(/^["']|["']$/g, '');
    }
    return { type: 'commit', message: msg || undefined };
  }

  if (sub === 'branch') {
    if (!parts[2]) return { error: 'Usage: git branch <branch-name>' };
    return { type: 'branch', name: parts[2] };
  }

  if (sub === 'switch' || sub === 'checkout') {
    if (parts[2] === '-c' || parts[2] === '-b') {
      if (!parts[3]) return { error: 'Usage: git switch -c <branch-name>' };
      return { type: 'switch', target: parts[3], createBranch: true };
    }
    if (!parts[2]) return { error: 'Usage: git switch <branch-or-commit>' };
    return { type: 'switch', target: parts[2] };
  }

  if (sub === 'merge') {
    if (!parts[2]) return { error: 'Usage: git merge <target>' };
    return { type: 'merge', target: parts[2] };
  }

  if (sub === 'rebase') {
    if (!parts[2]) return { error: 'Usage: git rebase <target>' };
    return { type: 'rebase', target: parts[2] };
  }

  if (sub === 'reset') {
    let mode: 'soft' | 'mixed' | 'hard' = 'mixed';
    let target = parts[2];
    if (parts[2] === '--hard' || parts[2] === '--soft' || parts[2] === '--mixed') {
      mode = parts[2].replace('--', '') as any;
      target = parts[3];
    }
    if (!target) return { error: 'Usage: git reset [--hard|--soft] <target>' };
    return { type: 'reset', mode, target };
  }

  if (sub === 'revert') {
    if (!parts[2]) return { error: 'Usage: git revert <commitId>' };
    return { type: 'revert', commitId: parts[2] };
  }

  if (sub === 'cherry-pick') {
    if (!parts[2]) return { error: 'Usage: git cherry-pick <commitId>' };
    return { type: 'cherry-pick', commitId: parts[2] };
  }

  return { error: `Unsupported git command: "${sub}". Supported: commit, branch, switch, merge, rebase, reset, revert, cherry-pick` };
}

export function GitSandboxPage() {
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const initialLvl = GIT_LEVELS[0]!;
  const [repoState, setRepoState] = useState<RepositoryState>(initialLvl.initialState());
  const [cmdInput, setCmdInput] = useState('');
  const [history, setHistory] = useState<Array<{ cmd: string; output?: string; error?: boolean }>>([
    { cmd: '# Welcome to Git Graph Sandbox! Type "git commit" or follow the lesson goal.' }
  ]);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);

  const currentLevel: LessonLevel = GIT_LEVELS[currentLevelIdx] ?? initialLvl;
  const isGoalMet = currentLevel.isCompleted(repoState);

  // Load progress
  useEffect(() => {
    WorkspaceStore.get<number[]>(STORAGE_KEY_PROGRESS).then((saved) => {
      if (saved && Array.isArray(saved)) {
        setCompletedLevels(saved);
      }
    }).catch(() => {});
  }, []);

  // Save progress when goal met
  useEffect(() => {
    if (isGoalMet && !completedLevels.includes(currentLevel.id)) {
      const next = [...completedLevels, currentLevel.id];
      setCompletedLevels(next);
      WorkspaceStore.set(STORAGE_KEY_PROGRESS, next).catch(() => {});
    }
  }, [isGoalMet, currentLevel.id, completedLevels]);

  const selectLevel = (idx: number) => {
    const lvl = GIT_LEVELS[idx];
    if (!lvl) return;
    setCurrentLevelIdx(idx);
    setRepoState(lvl.initialState());
    setHistory([{ cmd: `# Switched to ${lvl.title}` }]);
  };

  const resetLesson = () => {
    setRepoState(currentLevel.initialState());
    setHistory((prev) => [...prev, { cmd: '# Lesson reset to initial state' }]);
  };

  const handleCommandSubmit = (e: Event) => {
    e.preventDefault();
    const trimmed = cmdInput.trim();
    if (!trimmed) return;

    setCmdInput('');

    const parsed = parseGitCommand(trimmed);
    if ('error' in parsed) {
      setHistory((prev) => [...prev, { cmd: trimmed, output: parsed.error, error: true }]);
      return;
    }

    const nextState = reduceRepository(repoState, parsed);
    if (isCommandError(nextState)) {
      setHistory((prev) => [...prev, { cmd: trimmed, output: nextState.message, error: true }]);
    } else {
      setRepoState(nextState);
      setHistory((prev) => [...prev, { cmd: trimmed, output: 'Success' }]);
    }
  };

  const headCommitId = getHeadCommitId(repoState);
  const commitsList = Object.values(repoState.commits);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Git Learning Sandbox & Graph Simulation</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Interactive client-side Git simulation with visual DAG graphs and structured learning lessons.
          </p>
        </div>
        <button className="btn" onClick={resetLesson}>↺ Reset Lesson</button>
      </div>

      {/* Level Selector Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {GIT_LEVELS.map((lvl, idx) => {
          const isDone = completedLevels.includes(lvl.id);
          const isCurrent = idx === currentLevelIdx;
          return (
            <button
              key={lvl.id}
              className={`btn ${isCurrent ? 'btn-primary' : ''}`}
              onClick={() => selectLevel(idx)}
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              {isDone ? '✓ ' : ''}{lvl.title}
            </button>
          );
        })}
      </div>

      {/* Lesson Goal Box */}
      <div className="card" style={{ borderLeft: isGoalMet ? '4px solid var(--success-color)' : '4px solid var(--accent-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '4px' }}>{currentLevel.title}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{currentLevel.description}</p>
            <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
              <strong>Goal:</strong> {currentLevel.goalExplanation}
            </p>
          </div>
          {isGoalMet && (
            <span style={{ backgroundColor: 'var(--success-color)', color: '#000', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem' }}>
              Completed!
            </span>
          )}
        </div>
      </div>

      {/* Main Sandbox Layout: Left SVG Graph, Right Terminal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '20px' }}>
        {/* SVG Graph Viewer */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>Commit Graph (DAG)</h3>
          <div style={{ flex: 1, minHeight: '340px', backgroundColor: 'var(--code-bg)', borderRadius: 'var(--radius-md)', padding: '16px', overflowX: 'auto' }}>
            <svg
              width="100%"
              height="300"
              viewBox="0 0 500 300"
              role="img"
              aria-label="Interactive Git commit graph"
            >
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-color)" />
                </marker>
              </defs>

              {/* Render parent arrows */}
              {commitsList.map((c, i) => {
                const cx = 50 + i * 80;
                const cy = 150;
                return c.parents.map((pId) => {
                  const pIndex = commitsList.findIndex((p) => p.id === pId);
                  if (pIndex === -1) return null;
                  const px = 50 + pIndex * 80;
                  const py = 150;
                  return (
                    <line
                      key={`${pId}-${c.id}`}
                      x1={cx - 20}
                      y1={cy}
                      x2={px + 20}
                      y2={py}
                      stroke="var(--border-color)"
                      strokeWidth="2"
                      markerEnd="url(#arrow)"
                    />
                  );
                });
              })}

              {/* Render commit nodes */}
              {commitsList.map((c, i) => {
                const cx = 50 + i * 80;
                const cy = 150;
                const isHead = c.id === headCommitId;

                // Find branches pointing to this commit
                const pointingBranches = Object.entries(repoState.branches)
                  .filter(([_, commitId]) => commitId === c.id)
                  .map(([name]) => name);

                return (
                  <g key={c.id}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="16"
                      fill={isHead ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}
                      stroke={isHead ? '#fff' : 'var(--border-color)'}
                      strokeWidth="2"
                    />
                    <text
                      x={cx}
                      y={cy + 5}
                      textAnchor="middle"
                      fill={isHead ? '#000' : 'var(--text-primary)'}
                      fontSize="12"
                      fontWeight="bold"
                    >
                      {c.id}
                    </text>

                    {/* Commit Message Tooltip / Label */}
                    <text x={cx} y={cy + 34} textAnchor="middle" fill="var(--text-secondary)" fontSize="10">
                      {c.message.length > 12 ? c.message.substring(0, 10) + '..' : c.message}
                    </text>

                    {/* Branch Labels */}
                    {pointingBranches.map((bName, bIdx) => (
                      <g key={bName} transform={`translate(${cx - 30}, ${cy - 40 - bIdx * 24})`}>
                        <rect width="60" height="20" rx="3" fill="var(--bg-secondary)" stroke="var(--accent-primary)" strokeWidth="1" />
                        <text x="30" y="14" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="600">
                          {bName}
                        </text>
                      </g>
                    ))}

                    {/* HEAD Label */}
                    {isHead && (
                      <g transform={`translate(${cx - 24}, ${cy - 68 - pointingBranches.length * 24})`}>
                        <rect width="48" height="18" rx="3" fill="var(--accent-primary)" />
                        <text x="24" y="13" textAnchor="middle" fill="#000" fontSize="9" fontWeight="bold">
                          HEAD
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Git Terminal / CLI Sandbox */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>Git Terminal</h3>
          
          <div
            style={{
              flex: 1,
              minHeight: '260px',
              backgroundColor: 'var(--code-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {history.map((item, idx) => (
              <div key={idx}>
                <div style={{ color: 'var(--text-muted)' }}>$ {item.cmd}</div>
                {item.output && (
                  <div style={{ color: item.error ? 'var(--danger-color)' : 'var(--success-color)', marginLeft: '10px' }}>
                    {item.output}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick command buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setCmdInput('git commit')}>
              + commit
            </button>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setCmdInput('git branch feat')}>
              + branch feat
            </button>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setCmdInput('git switch main')}>
              switch main
            </button>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setCmdInput('git merge feat')}>
              merge feat
            </button>
          </div>

          <form onSubmit={handleCommandSubmit} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input
              type="text"
              className="input"
              value={cmdInput}
              onInput={(e) => setCmdInput((e.target as HTMLInputElement).value)}
              placeholder='e.g., git commit -m "my message", git branch feat, git switch main'
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary">Run</button>
          </form>
        </div>
      </div>
    </div>
  );
}
