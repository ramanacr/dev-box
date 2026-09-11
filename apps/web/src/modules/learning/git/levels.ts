import { createInitialRepository, type RepositoryState } from './model';

export interface LessonLevel {
  id: number;
  title: string;
  description: string;
  goalExplanation: string;
  initialState: () => RepositoryState;
  isCompleted: (state: RepositoryState) => boolean;
}

export const GIT_LEVELS: LessonLevel[] = [
  {
    id: 1,
    title: '1. Introduction to Commits',
    description: 'A commit in Git saves a snapshot of your project repository. Make two commits to advance your main branch.',
    goalExplanation: 'Execute "git commit" twice so the main branch reaches commit c3.',
    initialState: () => createInitialRepository(),
    isCompleted: (state) => {
      const head = state.branches['main'];
      return Boolean(head && head === 'c3' && Object.keys(state.commits).length >= 3);
    },
  },
  {
    id: 2,
    title: '2. Branching & Switching',
    description: 'Branches allow isolated feature development. Create a new branch called "feat" and switch to it, then make a commit on it.',
    goalExplanation: 'Run "git branch feat", "git switch feat", and "git commit".',
    initialState: () => createInitialRepository(),
    isCompleted: (state) => {
      return (
        state.head.type === 'branch' &&
        state.head.branchName === 'feat' &&
        Boolean(state.branches['feat']) &&
        state.branches['feat'] !== state.branches['main']
      );
    },
  },
  {
    id: 3,
    title: '3. Merging Branches',
    description: 'Merging combines histories from two branches. Fast-forward or 3-way merge the "bugfix" branch into "main".',
    goalExplanation: 'Switch to main and merge bugfix: "git switch main", then "git merge bugfix".',
    initialState: () => ({
      commits: {
        c1: { id: 'c1', parents: [], message: 'Initial commit' },
        c2: { id: 'c2', parents: ['c1'], message: 'Bugfix work' },
      },
      branches: {
        main: 'c1',
        bugfix: 'c2',
      },
      head: { type: 'branch', branchName: 'main' },
      nextCommitNum: 3,
    }),
    isCompleted: (state) => {
      const mainHead = state.branches['main'];
      if (!mainHead) return false;
      return mainHead === 'c2' || (state.commits[mainHead]?.parents.includes('c2') ?? false);
    },
  },
  {
    id: 4,
    title: '4. Rebasing Branches',
    description: 'Rebasing replays commits from one branch onto the tip of another branch to keep a linear history.',
    goalExplanation: 'Rebase your feature branch onto main: "git switch feature" then "git rebase main".',
    initialState: () => ({
      commits: {
        c1: { id: 'c1', parents: [], message: 'Initial commit' },
        c2: { id: 'c2', parents: ['c1'], message: 'Main work' },
        c3: { id: 'c3', parents: ['c1'], message: 'Feature work' },
      },
      branches: {
        main: 'c2',
        feature: 'c3',
      },
      head: { type: 'branch', branchName: 'feature' },
      nextCommitNum: 4,
    }),
    isCompleted: (state) => {
      const featHead = state.branches['feature'];
      if (!featHead) return false;
      const commit = state.commits[featHead];
      return commit ? commit.parents.includes('c2') : false;
    },
  },
  {
    id: 5,
    title: '5. Undoing Changes (Reset & Revert)',
    description: 'Learn how to revert an unwanted commit by creating an inverse commit that undoes the changes.',
    goalExplanation: 'Revert commit c2 using "git revert c2".',
    initialState: () => ({
      commits: {
        c1: { id: 'c1', parents: [], message: 'Initial commit' },
        c2: { id: 'c2', parents: ['c1'], message: 'Unwanted bad commit' },
      },
      branches: {
        main: 'c2',
      },
      head: { type: 'branch', branchName: 'main' },
      nextCommitNum: 3,
    }),
    isCompleted: (state) => {
      const head = state.branches['main'];
      if (!head) return false;
      const commit = state.commits[head];
      return commit?.message.toLowerCase().includes('revert') ?? false;
    },
  },
  {
    id: 6,
    title: '6. Cherry-picking Commits',
    description: 'Cherry-picking applies an existing commit from another branch directly onto your current branch.',
    goalExplanation: 'Cherry-pick commit c3 from side-branch onto main: "git switch main", then "git cherry-pick c3".',
    initialState: () => ({
      commits: {
        c1: { id: 'c1', parents: [], message: 'Initial commit' },
        c2: { id: 'c2', parents: ['c1'], message: 'Main commit' },
        c3: { id: 'c3', parents: ['c1'], message: 'Useful hotfix' },
      },
      branches: {
        main: 'c2',
        hotfix: 'c3',
      },
      head: { type: 'branch', branchName: 'main' },
      nextCommitNum: 4,
    }),
    isCompleted: (state) => {
      const head = state.branches['main'];
      if (!head) return false;
      const commit = state.commits[head];
      return commit?.message === 'Useful hotfix' && commit.parents.includes('c2');
    },
  },
];
