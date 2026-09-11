import { describe, it, expect } from 'vitest';
import {
  createInitialRepository,
  getHeadCommitId,
  isCommandError,
  type RepositoryState,
} from './model';
import { reduceRepository } from './reducer';

describe('Git Repository Reducer', () => {
  it('creates commits and advances current branch', () => {
    let state = createInitialRepository();
    const result = reduceRepository(state, { type: 'commit', message: 'Second commit' });
    expect(isCommandError(result)).toBe(false);
    if (isCommandError(result)) return;

    expect(result.commits['c2']).toBeDefined();
    expect(result.commits['c2']!.parents).toEqual(['c1']);
    expect(result.branches['main']).toBe('c2');
    expect(getHeadCommitId(result)).toBe('c2');
  });

  it('creates new branch without moving HEAD', () => {
    let state = createInitialRepository();
    const result = reduceRepository(state, { type: 'branch', name: 'feature' });
    expect(isCommandError(result)).toBe(false);
    if (isCommandError(result)) return;

    expect(result.branches['feature']).toBe('c1');
    expect(result.head).toEqual({ type: 'branch', branchName: 'main' });
  });

  it('switches to branch and creates detached HEAD when switching to commit', () => {
    let state = createInitialRepository();
    state = reduceRepository(state, { type: 'branch', name: 'feat' }) as RepositoryState;
    state = reduceRepository(state, { type: 'switch', target: 'feat' }) as RepositoryState;
    expect(state.head).toEqual({ type: 'branch', branchName: 'feat' });

    // Detached head
    state = reduceRepository(state, { type: 'switch', target: 'c1' }) as RepositoryState;
    expect(state.head).toEqual({ type: 'detached', commitId: 'c1' });
  });

  it('performs fast-forward merge', () => {
    let state = createInitialRepository();
    state = reduceRepository(state, { type: 'branch', name: 'feature' }) as RepositoryState;
    state = reduceRepository(state, { type: 'switch', target: 'feature' }) as RepositoryState;
    state = reduceRepository(state, { type: 'commit', message: 'Feature work' }) as RepositoryState; // c2
    state = reduceRepository(state, { type: 'switch', target: 'main' }) as RepositoryState;

    const mergeResult = reduceRepository(state, { type: 'merge', target: 'feature' });
    expect(isCommandError(mergeResult)).toBe(false);
    if (isCommandError(mergeResult)) return;

    expect(mergeResult.branches['main']).toBe('c2');
    // Fast forward should not create an extra commit
    expect(Object.keys(mergeResult.commits)).toHaveLength(2);
  });

  it('creates 3-way merge commit when histories diverge', () => {
    let state = createInitialRepository();
    // commit c2 on main
    state = reduceRepository(state, { type: 'commit', message: 'Main commit' }) as RepositoryState;
    // branch feat from c1
    state = reduceRepository(state, { type: 'switch', target: 'c1' }) as RepositoryState;
    state = reduceRepository(state, { type: 'switch', target: 'feat', createBranch: true }) as RepositoryState;
    state = reduceRepository(state, { type: 'commit', message: 'Feat commit' }) as RepositoryState; // c3

    // switch back to main and merge feat
    state = reduceRepository(state, { type: 'switch', target: 'main' }) as RepositoryState;
    const mergeResult = reduceRepository(state, { type: 'merge', target: 'feat' });
    expect(isCommandError(mergeResult)).toBe(false);
    if (isCommandError(mergeResult)) return;

    const headId = getHeadCommitId(mergeResult);
    expect(mergeResult.commits[headId]!.parents).toEqual(['c2', 'c3']);
  });

  it('rebases branch commits onto target', () => {
    let state = createInitialRepository();
    state = reduceRepository(state, { type: 'commit', message: 'Main c2' }) as RepositoryState;
    // branch feat from c1
    state = reduceRepository(state, { type: 'switch', target: 'c1' }) as RepositoryState;
    state = reduceRepository(state, { type: 'switch', target: 'feat', createBranch: true }) as RepositoryState;
    state = reduceRepository(state, { type: 'commit', message: 'Feat c3' }) as RepositoryState;

    const rebaseResult = reduceRepository(state, { type: 'rebase', target: 'main' });
    expect(isCommandError(rebaseResult)).toBe(false);
    if (isCommandError(rebaseResult)) return;

    const headId = getHeadCommitId(rebaseResult);
    expect(rebaseResult.commits[headId]!.parents).toEqual(['c2']);
    expect(rebaseResult.branches['feat']).toBe(headId);
  });

  it('resets branch pointer to target commit', () => {
    let state = createInitialRepository();
    state = reduceRepository(state, { type: 'commit', message: 'c2' }) as RepositoryState;
    expect(state.branches['main']).toBe('c2');

    const resetResult = reduceRepository(state, { type: 'reset', mode: 'hard', target: 'c1' });
    expect(isCommandError(resetResult)).toBe(false);
    if (isCommandError(resetResult)) return;

    expect(resetResult.branches['main']).toBe('c1');
  });

  it('reverts target commit by applying inverse commit', () => {
    let state = createInitialRepository();
    state = reduceRepository(state, { type: 'commit', message: 'Add bug' }) as RepositoryState; // c2
    const revertResult = reduceRepository(state, { type: 'revert', commitId: 'c2' });
    expect(isCommandError(revertResult)).toBe(false);
    if (isCommandError(revertResult)) return;

    const headId = getHeadCommitId(revertResult);
    expect(revertResult.commits[headId]!.message).toContain('Revert');
    expect(revertResult.commits[headId]!.parents).toEqual(['c2']);
  });

  it('cherry-picks a commit onto current branch', () => {
    let state = createInitialRepository();
    state = reduceRepository(state, { type: 'commit', message: 'c2 on main' }) as RepositoryState;
    state = reduceRepository(state, { type: 'switch', target: 'c1' }) as RepositoryState;
    state = reduceRepository(state, { type: 'switch', target: 'feat', createBranch: true }) as RepositoryState;

    const pickResult = reduceRepository(state, { type: 'cherry-pick', commitId: 'c2' });
    expect(isCommandError(pickResult)).toBe(false);
    if (isCommandError(pickResult)) return;

    const headId = getHeadCommitId(pickResult);
    expect(pickResult.commits[headId]!.parents).toEqual(['c1']);
    expect(pickResult.commits[headId]!.message).toBe('c2 on main');
  });
});
