export interface Commit {
  id: string; // e.g. 'c1', 'c2'
  parents: string[];
  message: string;
}

export type HeadState = 
  | { type: 'branch'; branchName: string }
  | { type: 'detached'; commitId: string };

export interface RepositoryState {
  commits: Record<string, Commit>;
  branches: Record<string, string>; // branchName -> commitId
  head: HeadState;
  nextCommitNum: number;
}

export type GitCommand =
  | { type: 'commit'; message?: string }
  | { type: 'branch'; name: string }
  | { type: 'switch'; target: string; createBranch?: boolean }
  | { type: 'merge'; target: string }
  | { type: 'rebase'; target: string }
  | { type: 'reset'; mode: 'soft' | 'mixed' | 'hard'; target: string }
  | { type: 'revert'; commitId: string }
  | { type: 'cherry-pick'; commitId: string };

export interface CommandError {
  error: true;
  message: string;
}

export function isCommandError(result: any): result is CommandError {
  return Boolean(result && result.error === true);
}

export function createInitialRepository(): RepositoryState {
  return {
    commits: {
      c1: { id: 'c1', parents: [], message: 'Initial commit' },
    },
    branches: {
      main: 'c1',
    },
    head: { type: 'branch', branchName: 'main' },
    nextCommitNum: 2,
  };
}

export function getHeadCommitId(state: RepositoryState): string {
  if (state.head.type === 'branch') {
    return state.branches[state.head.branchName] || 'c1';
  }
  return state.head.commitId;
}
