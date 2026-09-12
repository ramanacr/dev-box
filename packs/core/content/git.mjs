/**
 * Git reference. Original content authored for Developer Toolbox.
 *
 * No text is taken from the Git manual pages, whose licensing (GPLv2 with
 * individually licensed contributions) the white paper flags as a redistribution
 * hazard.
 */

export const source = {
  id: 'git',
  name: 'Git',
  url: 'https://git-scm.com/doc',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to the Git documentation; no manual-page text is reproduced.',
};

export const documents = [
  {
    id: 'git/merge-versus-rebase',
    title: 'Merge versus rebase: what each actually does',
    url: 'https://git-scm.com/docs/git-rebase',
    tags: 'merge rebase fast-forward merge commit history rewrite force-with-lease golden rule',
    headings: ['Merge', 'Rebase', 'Fast-forward', 'The rule that matters', 'Picking one'],
    body: `
<p>Both integrate one branch into another. They differ in what happens to history.</p>

<h2>Merge</h2>
<p><code>git merge feature</code> creates a commit with two parents, joining the
histories. Nothing that already existed is changed, so every commit keeps its
identity and anyone who already pulled is unaffected.</p>

<h2>Rebase</h2>
<p><code>git rebase main</code> replays your commits on top of <code>main</code>,
producing <em>new</em> commits with new hashes. The content may be identical but the
identity is not. The result is a linear history that reads as though you had started
from the current tip.</p>
<p>Because the commits are new, the old ones are orphaned. They survive in the reflog
for a while, which is how a botched rebase is recovered.</p>

<h2>Fast-forward</h2>
<p>If the target branch has no commits the source lacks, Git can simply move the
pointer forward — no merge commit, no new commits. <code>--no-ff</code> forces a merge
commit anyway, which some teams prefer so that every feature is one identifiable
merge. <code>--ff-only</code> refuses to do anything else, which is a useful guard on
a <code>pull</code>.</p>

<h2>The rule that matters</h2>
<p>Do not rebase commits that other people have pulled. Their history still contains
the originals, so their next merge reintroduces duplicates of everything you rewrote.
If you must force-push after a rebase, use <code>--force-with-lease</code>: it refuses
when the remote has moved since you last fetched, which is exactly the case where
plain <code>--force</code> destroys someone else's work.</p>

<h2>Picking one</h2>
<p>Rebase your own unpushed work to tidy it before review. Merge shared branches. A
<code>git pull --rebase</code> on a local feature branch is usually the right default;
a rebase of <code>main</code> almost never is.</p>
`,
  },

  {
    id: 'git/reset-modes',
    title: 'git reset: soft, mixed and hard',
    url: 'https://git-scm.com/docs/git-reset',
    tags: 'reset soft mixed hard HEAD index staging area working tree unstage discard revert',
    headings: ['Three places state lives', 'The three modes', 'Undoing a commit', 'reset versus revert versus restore'],
    body: `
<h2>Three places state lives</h2>
<p>Git holds your work in three places: the <strong>commit</strong> that
<code>HEAD</code> points at, the <strong>index</strong> (the staging area), and the
<strong>working tree</strong> (your files). <code>reset</code> moves
<code>HEAD</code> and optionally updates the other two.</p>

<h2>The three modes</h2>
<ul>
<li><code>--soft</code> — moves <code>HEAD</code> only. The index and working tree are
untouched, so the changes from the discarded commits are left staged. This is how you
squash: reset back several commits, then commit once.</li>
<li><code>--mixed</code> (the default) — moves <code>HEAD</code> and resets the index.
Changes remain in the working tree but unstaged.</li>
<li><code>--hard</code> — moves <code>HEAD</code> and resets both index and working
tree. <strong>Uncommitted work is destroyed and Git cannot recover it</strong>, because
it was never written to an object.</li>
</ul>
<pre><code>git reset --soft HEAD~3   # squash the last three commits
git reset HEAD~1          # undo the last commit, keep the edits
git reset --hard origin/main  # throw everything away</code></pre>

<h2>Undoing a commit</h2>
<p>To unstage a file without touching it: <code>git restore --staged file</code>. To
discard your edits to a file: <code>git restore file</code> — also destructive. To
undo the last commit but keep the work: <code>git reset HEAD~1</code>.</p>

<h2>reset versus revert versus restore</h2>
<p><code>reset</code> moves the branch pointer and rewrites history.
<code>revert</code> creates a <em>new</em> commit that undoes an earlier one, leaving
history intact — the only safe option on a shared branch. <code>restore</code> touches
files without touching history at all. If you reach for <code>reset --hard</code> on
something already pushed, you almost certainly want <code>revert</code>.</p>
`,
  },

  {
    id: 'git/recovering-lost-work',
    title: 'Recovering lost commits with reflog',
    url: 'https://git-scm.com/docs/git-reflog',
    tags: 'reflog recover lost commit detached HEAD dangling fsck cherry-pick orphan',
    headings: ['What the reflog records', 'Finding the lost commit', 'Getting it back', 'What cannot be recovered'],
    body: `
<h2>What the reflog records</h2>
<p>Every time <code>HEAD</code> or a branch tip moves, Git appends to a local log of
where it used to point. A bad rebase, reset or branch deletion does not erase the
commits — it only stops anything pointing at them, and the reflog still does.</p>
<p>The reflog is local and per-repository. It is not pushed, not fetched, and expires
(90 days for reachable entries, 30 for unreachable, by default).</p>

<h2>Finding the lost commit</h2>
<pre><code>git reflog                 # HEAD's history of positions
git reflog show main       # one branch's history</code></pre>
<p>Entries read <code>HEAD@{2}</code>, oldest last. The message says what moved it —
<code>rebase (finish)</code>, <code>reset: moving to</code>, <code>commit</code> —
which is usually enough to spot the point before the mistake.</p>

<h2>Getting it back</h2>
<pre><code>git reset --hard HEAD@{1}          # undo the last thing that moved HEAD
git branch rescue &lt;sha&gt;            # point a new branch at a lost commit
git cherry-pick &lt;sha&gt;              # take just one commit back</code></pre>
<p>Creating a branch is the safer move: it makes the commit reachable without changing
where you are.</p>

<h2>What cannot be recovered</h2>
<p>Anything never committed. <code>git reset --hard</code> and
<code>git restore</code> overwrite the working tree with no record, and
<code>git clean -fd</code> deletes untracked files outright. The reflog only tracks
commits, so uncommitted work has nothing to be found in.</p>
<p><code>git stash</code> does create a commit, so a dropped stash is recoverable via
<code>git fsck --unreachable</code>.</p>
`,
  },

  {
    id: 'git/interactive-rebase',
    title: 'Interactive rebase: squash, reword, reorder, drop',
    url: 'https://git-scm.com/docs/git-rebase#_interactive_mode',
    tags: 'rebase -i interactive squash fixup reword edit drop autosquash conflict continue abort',
    headings: ['Starting one', 'The commands', 'Conflicts', 'autosquash'],
    body: `
<h2>Starting one</h2>
<p><code>git rebase -i HEAD~5</code> opens an editor listing the last five commits,
<strong>oldest first</strong> — the opposite order to <code>git log</code>, which
catches people out. Reordering the lines reorders the commits.</p>

<h2>The commands</h2>
<ul>
<li><code>pick</code> — keep as-is.</li>
<li><code>reword</code> — keep the change, edit the message.</li>
<li><code>edit</code> — stop here so you can amend the content.</li>
<li><code>squash</code> — merge into the previous commit and combine the messages.</li>
<li><code>fixup</code> — merge into the previous commit and discard this message.</li>
<li><code>drop</code> — remove the commit entirely.</li>
<li><code>break</code> — pause at this point without changing anything.</li>
</ul>
<p>A <code>squash</code> or <code>fixup</code> on the first line has nothing to fold
into and will abort.</p>

<h2>Conflicts</h2>
<p>A rebase replays each commit, so one conflict may recur across several. Resolve,
<code>git add</code>, then <code>git rebase --continue</code> — do not commit.
<code>git rebase --skip</code> drops the current commit;
<code>git rebase --abort</code> restores the original branch exactly.</p>
<p>If the same conflict keeps reappearing, <code>git rerere</code> can record
resolutions and replay them.</p>

<h2>autosquash</h2>
<p>Commit a fix as <code>git commit --fixup &lt;sha&gt;</code> and it is titled
<code>fixup! &lt;original subject&gt;</code>. Then
<code>git rebase -i --autosquash</code> pre-arranges the list so each fixup sits under
its target already marked. Set <code>rebase.autosquash = true</code> and it is the
default.</p>
`,
  },

  {
    id: 'git/cherry-pick-and-revert',
    title: 'cherry-pick and revert',
    url: 'https://git-scm.com/docs/git-cherry-pick',
    tags: 'cherry-pick revert -x mainline merge commit backport hotfix conflict',
    headings: ['cherry-pick', 'Reverting a merge', 'Duplicate commits', 'Tracking provenance'],
    body: `
<h2>cherry-pick</h2>
<p><code>git cherry-pick &lt;sha&gt;</code> applies the change from one commit onto the
current branch as a new commit. It is the tool for backporting a fix to a release
branch without taking everything else with it. A range works too:
<code>git cherry-pick A..B</code>, which is exclusive of <code>A</code>.</p>

<h2>Reverting a merge</h2>
<p>A merge commit has two parents, so Git cannot know which side you mean to undo.
<code>git revert -m 1 &lt;merge-sha&gt;</code> reverts relative to the first parent —
usually the branch you merged <em>into</em>. Getting the number wrong reverts the
wrong half.</p>
<p>Reverting a merge also has a lasting consequence: the branch stays "merged" from
Git's point of view, so merging it again brings nothing. Reverting the revert is the
usual way back.</p>

<h2>Duplicate commits</h2>
<p>A cherry-picked commit has a different hash from the original. If the source branch
is later merged, Git usually notices the identical change and produces no conflict —
but not always, and the history then shows the same fix twice. Prefer merging the
release branch back, or accept the duplication deliberately.</p>

<h2>Tracking provenance</h2>
<p><code>git cherry-pick -x</code> appends "(cherry picked from commit …)" to the
message, which is the only durable record of where a backport came from. On a release
branch this is worth making a habit.</p>
`,
  },

  {
    id: 'git/branch-hygiene',
    title: 'Inspecting history: log, diff, blame and bisect',
    url: 'https://git-scm.com/docs/git-log',
    tags: 'log diff blame bisect graph oneline stat staged cached pickaxe -S follow',
    headings: ['log', 'diff', 'blame', 'bisect', 'Finding when something changed'],
    body: `
<h2>log</h2>
<pre><code>git log --oneline --graph --decorate    # shape of the history
git log -p path/to/file                 # each change to one file
git log --follow path                   # keep following across renames
git log -S 'functionName'               # commits that added or removed a string
git log main..feature                   # what feature has that main does not</code></pre>
<p><code>-S</code> (the "pickaxe") is the one most people do not know and the one that
answers "when did this line appear".</p>

<h2>diff</h2>
<p><code>git diff</code> compares the working tree to the index.
<code>git diff --staged</code> compares the index to the last commit — which is what
you want before committing. <code>git diff main...feature</code> with three dots
compares against the merge base, which is what a pull request shows.</p>

<h2>blame</h2>
<p><code>git blame -L 40,60 file</code> limits to a line range.
<code>-w</code> ignores whitespace changes and <code>-C</code> detects moved code;
both matter enormously, because without them a reformatting commit is credited with
every line in the file.</p>

<h2>bisect</h2>
<p>A binary search for the commit that introduced a behaviour:</p>
<pre><code>git bisect start
git bisect bad                # current commit is broken
git bisect good v1.2.0        # this tag was fine
# test, then: git bisect good | git bisect bad
git bisect reset</code></pre>
<p>With a script that exits non-zero on failure, <code>git bisect run ./test.sh</code>
does the whole search unattended. On a thousand commits that is ten tests.</p>

<h2>Finding when something changed</h2>
<p>Start with <code>log -S</code> for a known string, <code>blame -w -C</code> for a
known line, and <code>bisect</code> for a behaviour with no obvious textual trace.</p>
`,
  },
];
