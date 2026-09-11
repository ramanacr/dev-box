import {
  type CommandError,
  type Commit,
  type GitCommand,
  type RepositoryState,
  getHeadCommitId,
} from './model';

function isAncestor(
  commits: Record<string, Commit>,
  ancestorId: string,
  startId: string,
  visited = new Set<string>()
): boolean {
  if (ancestorId === startId) return true;
  if (visited.has(startId)) return false;
  visited.add(startId);

  const commit = commits[startId];
  if (!commit) return false;

  for (const parent of commit.parents) {
    if (isAncestor(commits, ancestorId, parent, visited)) {
      return true;
    }
  }
  return false;
}

export function reduceRepository(
  state: RepositoryState,
  command: GitCommand
): RepositoryState | CommandError {
  const currentHeadCommitId = getHeadCommitId(state);

  switch (command.type) {
    case 'commit': {
      const commitId = `c${state.nextCommitNum}`;
      const newCommit: Commit = {
        id: commitId,
        parents: [currentHeadCommitId],
        message: command.message || `Commit ${commitId}`,
      };

      const updatedCommits = {
        ...state.commits,
        [commitId]: newCommit,
      };

      const updatedBranches = { ...state.branches };
      let updatedHead = { ...state.head };

      if (state.head.type === 'branch') {
        updatedBranches[state.head.branchName] = commitId;
      } else {
        updatedHead = { type: 'detached', commitId };
      }

      return {
        ...state,
        commits: updatedCommits,
        branches: updatedBranches,
        head: updatedHead,
        nextCommitNum: state.nextCommitNum + 1,
      };
    }

    case 'branch': {
      const name = command.name.trim();
      if (!name) {
        return { error: true, message: 'Branch name cannot be empty' };
      }
      if (state.branches[name]) {
        return { error: true, message: `Branch "${name}" already exists` };
      }

      return {
        ...state,
        branches: {
          ...state.branches,
          [name]: currentHeadCommitId,
        },
      };
    }

    case 'switch': {
      const target = command.target.trim();
      if (command.createBranch) {
        if (state.branches[target]) {
          return { error: true, message: `Branch "${target}" already exists` };
        }
        return {
          ...state,
          branches: {
            ...state.branches,
            [target]: currentHeadCommitId,
          },
          head: { type: 'branch', branchName: target },
        };
      }

      if (state.branches[target]) {
        return {
          ...state,
          head: { type: 'branch', branchName: target },
        };
      }

      if (state.commits[target]) {
        return {
          ...state,
          head: { type: 'detached', commitId: target },
        };
      }

      return { error: true, message: `Cannot resolve "${target}" to a branch or commit` };
    }

    case 'merge': {
      const target = command.target.trim();
      const targetCommitId = state.branches[target] || (state.commits[target] ? target : null);
      if (!targetCommitId) {
        return { error: true, message: `Cannot resolve merge target "${target}"` };
      }

      if (targetCommitId === currentHeadCommitId) {
        return { error: true, message: 'Already up to date.' };
      }

      // Fast-forward check: if current HEAD is an ancestor of targetCommitId
      if (isAncestor(state.commits, currentHeadCommitId, targetCommitId)) {
        const updatedBranches = { ...state.branches };
        let updatedHead = { ...state.head };

        if (state.head.type === 'branch') {
          updatedBranches[state.head.branchName] = targetCommitId;
        } else {
          updatedHead = { type: 'detached', commitId: targetCommitId };
        }

        return {
          ...state,
          branches: updatedBranches,
          head: updatedHead,
        };
      }

      // If targetCommitId is already an ancestor of current HEAD
      if (isAncestor(state.commits, targetCommitId, currentHeadCommitId)) {
        return { error: true, message: 'Already up to date.' };
      }

      // 3-way merge commit
      const commitId = `c${state.nextCommitNum}`;
      const mergeCommit: Commit = {
        id: commitId,
        parents: [currentHeadCommitId, targetCommitId],
        message: `Merge branch '${target}'`,
      };

      const updatedCommits = {
        ...state.commits,
        [commitId]: mergeCommit,
      };

      const updatedBranches = { ...state.branches };
      let updatedHead = { ...state.head };

      if (state.head.type === 'branch') {
        updatedBranches[state.head.branchName] = commitId;
      } else {
        updatedHead = { type: 'detached', commitId };
      }

      return {
        ...state,
        commits: updatedCommits,
        branches: updatedBranches,
        head: updatedHead,
        nextCommitNum: state.nextCommitNum + 1,
      };
    }

    case 'rebase': {
      const target = command.target.trim();
      const targetCommitId = state.branches[target] || (state.commits[target] ? target : null);
      if (!targetCommitId) {
        return { error: true, message: `Cannot resolve rebase target "${target}"` };
      }

      // Find commits reachable from currentHeadCommitId but not targetCommitId
      const commitsToReplay: Commit[] = [];
      let curr: string | undefined = currentHeadCommitId;

      while (curr && curr !== targetCommitId && !isAncestor(state.commits, curr, targetCommitId)) {
        const c: Commit | undefined = state.commits[curr];
        if (!c) break;
        commitsToReplay.unshift(c);
        curr = c.parents[0];
      }

      if (commitsToReplay.length === 0) {
        return { error: true, message: 'Current branch is already up to date with target' };
      }

      let newParentId = targetCommitId;
      let nextNum = state.nextCommitNum;
      const updatedCommits = { ...state.commits };

      for (const oldCommit of commitsToReplay) {
        const newId = `c${nextNum++}`;
        updatedCommits[newId] = {
          id: newId,
          parents: [newParentId],
          message: oldCommit.message,
        };
        newParentId = newId;
      }

      const updatedBranches = { ...state.branches };
      let updatedHead = { ...state.head };

      if (state.head.type === 'branch') {
        updatedBranches[state.head.branchName] = newParentId;
      } else {
        updatedHead = { type: 'detached', commitId: newParentId };
      }

      return {
        ...state,
        commits: updatedCommits,
        branches: updatedBranches,
        head: updatedHead,
        nextCommitNum: nextNum,
      };
    }

    case 'reset': {
      const target = command.target.trim();
      const targetCommitId = state.commits[target] ? target : state.branches[target];
      if (!targetCommitId) {
        return { error: true, message: `Cannot resolve reset target "${target}"` };
      }

      if (state.head.type !== 'branch') {
        return {
          ...state,
          head: { type: 'detached', commitId: targetCommitId },
        };
      }

      return {
        ...state,
        branches: {
          ...state.branches,
          [state.head.branchName]: targetCommitId,
        },
      };
    }

    case 'revert': {
      const target = command.commitId.trim();
      const targetCommit = state.commits[target];
      if (!targetCommit) {
        return { error: true, message: `Cannot resolve revert commit "${target}"` };
      }

      const commitId = `c${state.nextCommitNum}`;
      const revertCommit: Commit = {
        id: commitId,
        parents: [currentHeadCommitId],
        message: `Revert "${targetCommit.message}"`,
      };

      const updatedCommits = {
        ...state.commits,
        [commitId]: revertCommit,
      };

      const updatedBranches = { ...state.branches };
      let updatedHead = { ...state.head };

      if (state.head.type === 'branch') {
        updatedBranches[state.head.branchName] = commitId;
      } else {
        updatedHead = { type: 'detached', commitId };
      }

      return {
        ...state,
        commits: updatedCommits,
        branches: updatedBranches,
        head: updatedHead,
        nextCommitNum: state.nextCommitNum + 1,
      };
    }

    case 'cherry-pick': {
      const target = command.commitId.trim();
      const targetCommit = state.commits[target];
      if (!targetCommit) {
        return { error: true, message: `Cannot find commit "${target}"` };
      }

      const commitId = `c${state.nextCommitNum}`;
      const pickCommit: Commit = {
        id: commitId,
        parents: [currentHeadCommitId],
        message: targetCommit.message,
      };

      const updatedCommits = {
        ...state.commits,
        [commitId]: pickCommit,
      };

      const updatedBranches = { ...state.branches };
      let updatedHead = { ...state.head };

      if (state.head.type === 'branch') {
        updatedBranches[state.head.branchName] = commitId;
      } else {
        updatedHead = { type: 'detached', commitId };
      }

      return {
        ...state,
        commits: updatedCommits,
        branches: updatedBranches,
        head: updatedHead,
        nextCommitNum: state.nextCommitNum + 1,
      };
    }

    default:
      return { error: true, message: `Unsupported command` };
  }
}
