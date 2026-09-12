/**
 * Curated shell command and option reference.
 *
 * Every description here is independently authored for Developer Toolbox. This is a
 * deliberate licensing decision, not an accident of convenience: the white paper is
 * explicit that ExplainShell's manpage-derived database contains individually
 * licensed upstream manpages and must not be redistributed wholesale. No manpage text
 * is copied, quoted, or paraphrased closely.
 *
 * Coverage is intentionally a curated set of high-frequency developer commands rather
 * than an attempt at completeness. An unknown command is reported as unknown; the
 * module never guesses.
 */

export interface OptionSpec {
  /** Short forms, without the leading dash, e.g. "l". */
  short?: string[];
  /** Long forms, without the leading dashes, e.g. "long". */
  long?: string[];
  description: string;
  /** Whether the option consumes the next token as its value. */
  takesValue?: boolean;
}

export interface SubcommandSpec {
  name: string;
  description: string;
  options?: OptionSpec[];
}

export interface CommandSpec {
  name: string;
  summary: string;
  /** What a bare invocation does, when that differs from the summary. */
  usage?: string;
  options?: OptionSpec[];
  subcommands?: SubcommandSpec[];
  /** Positional argument descriptions, in order. A final entry may repeat. */
  operands?: { name: string; description: string; repeats?: boolean }[];
}

export const COMMANDS: Record<string, CommandSpec> = {
  ls: {
    name: 'ls',
    summary: 'Lists directory contents.',
    options: [
      { short: ['l'], description: 'Long format: one entry per line with permissions, owner, size and modification time.' },
      { short: ['a'], long: ['all'], description: 'Includes entries whose names begin with a dot, which are hidden by default.' },
      { short: ['A'], long: ['almost-all'], description: 'Like -a but omits the . and .. entries.' },
      { short: ['h'], long: ['human-readable'], description: 'Prints sizes using K, M and G suffixes instead of raw byte counts.' },
      { short: ['t'], description: 'Sorts by modification time, newest first.' },
      { short: ['r'], long: ['reverse'], description: 'Reverses the sort order.' },
      { short: ['S'], description: 'Sorts by file size, largest first.' },
      { short: ['R'], long: ['recursive'], description: 'Descends into subdirectories.' },
      { short: ['d'], long: ['directory'], description: 'Describes the directory itself rather than listing what is inside it.' },
      { long: ['color'], description: 'Controls colourised output. Common values are auto, always and never.', takesValue: true },
    ],
    operands: [{ name: 'path', description: 'Directory or file to list. Defaults to the current directory.', repeats: true }],
  },

  cd: {
    name: 'cd',
    summary: 'Changes the shell working directory.',
    operands: [{ name: 'path', description: 'Directory to move to. With no argument, moves to your home directory; "-" returns to the previous directory.' }],
  },

  grep: {
    name: 'grep',
    summary: 'Searches input for lines matching a pattern.',
    options: [
      { short: ['i'], long: ['ignore-case'], description: 'Matches without regard to letter case.' },
      { short: ['r'], long: ['recursive'], description: 'Searches files under each directory, following the tree down.' },
      { short: ['R'], long: ['dereference-recursive'], description: 'Like -r but also follows symbolic links.' },
      { short: ['n'], long: ['line-number'], description: 'Prefixes each match with its line number.' },
      { short: ['v'], long: ['invert-match'], description: 'Selects the lines that do NOT match — easy to misread.' },
      { short: ['l'], long: ['files-with-matches'], description: 'Prints only the names of files containing a match.' },
      { short: ['c'], long: ['count'], description: 'Prints a count of matching lines instead of the lines.' },
      { short: ['E'], long: ['extended-regexp'], description: 'Interprets the pattern as an extended regular expression.' },
      { short: ['F'], long: ['fixed-strings'], description: 'Treats the pattern as a literal string, not a regular expression.' },
      { short: ['w'], long: ['word-regexp'], description: 'Requires the match to form a whole word.' },
      { short: ['o'], long: ['only-matching'], description: 'Prints only the matched part of each line.' },
      { short: ['A'], long: ['after-context'], description: 'Prints this many lines of trailing context after each match.', takesValue: true },
      { short: ['B'], long: ['before-context'], description: 'Prints this many lines of leading context before each match.', takesValue: true },
      { short: ['C'], long: ['context'], description: 'Prints this many lines of context on both sides of each match.', takesValue: true },
      { long: ['include'], description: 'Restricts the search to files whose names match this glob.', takesValue: true },
      { long: ['exclude'], description: 'Skips files whose names match this glob.', takesValue: true },
    ],
    operands: [
      { name: 'pattern', description: 'The pattern to search for.' },
      { name: 'file', description: 'Files or directories to search. With none, reads standard input.', repeats: true },
    ],
  },

  find: {
    name: 'find',
    summary: 'Walks a directory tree and evaluates an expression against each entry.',
    options: [
      { long: ['name'], description: 'Matches the file name against a glob pattern, case sensitively.', takesValue: true },
      { long: ['iname'], description: 'Matches the file name against a glob pattern, ignoring case.', takesValue: true },
      { long: ['type'], description: 'Restricts to an entry type: f for regular files, d for directories, l for symbolic links.', takesValue: true },
      { long: ['mtime'], description: 'Matches on modification age in days. +7 means older than seven days.', takesValue: true },
      { long: ['size'], description: 'Matches on size. +100M means larger than 100 megabytes.', takesValue: true },
      { long: ['maxdepth'], description: 'Limits how many directory levels below the starting point are examined.', takesValue: true },
      { long: ['delete'], description: 'Deletes each matching entry. Irreversible — verify the match list first.' },
      { long: ['exec'], description: 'Runs a command for each match. Terminated by \\; or by + to batch arguments.', takesValue: true },
      { long: ['print'], description: 'Prints the path of each match. This is the default action.' },
      { long: ['prune'], description: 'Stops descending into the current directory.' },
    ],
    operands: [{ name: 'path', description: 'Where to start the walk.', repeats: true }],
  },

  rm: {
    name: 'rm',
    summary: 'Removes files and directories.',
    options: [
      { short: ['r', 'R'], long: ['recursive'], description: 'Removes directories and their contents, recursively.' },
      { short: ['f'], long: ['force'], description: 'Ignores missing files and never prompts for confirmation.' },
      { short: ['i'], description: 'Prompts before every removal.' },
      { short: ['v'], long: ['verbose'], description: 'Reports each file as it is removed.' },
      { short: ['d'], long: ['dir'], description: 'Removes empty directories.' },
    ],
    operands: [{ name: 'file', description: 'Files or directories to remove.', repeats: true }],
  },

  cp: {
    name: 'cp',
    summary: 'Copies files and directories.',
    options: [
      { short: ['r', 'R'], long: ['recursive'], description: 'Copies directories and their contents.' },
      { short: ['a'], long: ['archive'], description: 'Preserves permissions, ownership, timestamps and links where possible.' },
      { short: ['p'], description: 'Preserves mode, ownership and timestamps.' },
      { short: ['i'], long: ['interactive'], description: 'Prompts before overwriting an existing file.' },
      { short: ['n'], long: ['no-clobber'], description: 'Never overwrites an existing file.' },
      { short: ['u'], long: ['update'], description: 'Copies only when the source is newer than the destination.' },
      { short: ['v'], long: ['verbose'], description: 'Reports each file as it is copied.' },
    ],
    operands: [
      { name: 'source', description: 'What to copy.', repeats: true },
      { name: 'destination', description: 'Where to copy it to.' },
    ],
  },

  mv: {
    name: 'mv',
    summary: 'Moves or renames files and directories.',
    options: [
      { short: ['i'], long: ['interactive'], description: 'Prompts before overwriting an existing file.' },
      { short: ['n'], long: ['no-clobber'], description: 'Never overwrites an existing file.' },
      { short: ['f'], long: ['force'], description: 'Overwrites without prompting.' },
      { short: ['v'], long: ['verbose'], description: 'Reports each file as it is moved.' },
    ],
    operands: [
      { name: 'source', description: 'What to move.', repeats: true },
      { name: 'destination', description: 'Target path or directory.' },
    ],
  },

  chmod: {
    name: 'chmod',
    summary: 'Changes file mode (permission) bits.',
    options: [
      { short: ['R'], long: ['recursive'], description: 'Applies the change to directories and their contents.' },
      { short: ['v'], long: ['verbose'], description: 'Reports each file as it is changed.' },
    ],
    operands: [
      { name: 'mode', description: 'Permissions, either octal (755) or symbolic (u+x, go-w).' },
      { name: 'file', description: 'Files to change.', repeats: true },
    ],
  },

  curl: {
    name: 'curl',
    summary: 'Transfers data to or from a URL.',
    options: [
      { short: ['X'], long: ['request'], description: 'Sets the HTTP method, for example GET, POST or DELETE.', takesValue: true },
      { short: ['H'], long: ['header'], description: 'Adds a request header. Repeat for multiple headers.', takesValue: true },
      { short: ['d'], long: ['data'], description: 'Sends a request body, implying POST unless a method is given.', takesValue: true },
      { long: ['data-raw'], description: 'Sends a body without interpreting @ as a file reference.', takesValue: true },
      { long: ['json'], description: 'Sends a JSON body and sets the matching content type and accept headers.', takesValue: true },
      { short: ['o'], long: ['output'], description: 'Writes the response body to a file instead of standard output.', takesValue: true },
      { short: ['O'], long: ['remote-name'], description: 'Saves the response using the file name from the URL.' },
      { short: ['s'], long: ['silent'], description: 'Suppresses the progress meter and error messages.' },
      { short: ['S'], long: ['show-error'], description: 'Shows errors even when silent. Usually paired as -sS.' },
      { short: ['f'], long: ['fail'], description: 'Returns a non-zero exit status on an HTTP error response.' },
      { short: ['L'], long: ['location'], description: 'Follows HTTP redirects.' },
      { short: ['i'], long: ['include'], description: 'Includes the response headers in the output.' },
      { short: ['I'], long: ['head'], description: 'Requests headers only, using a HEAD request.' },
      { short: ['k'], long: ['insecure'], description: 'Skips TLS certificate verification. This removes protection against interception.' },
      { short: ['u'], long: ['user'], description: 'Supplies credentials for server authentication.', takesValue: true },
      { long: ['compressed'], description: 'Requests a compressed response and decompresses it.' },
      { short: ['w'], long: ['write-out'], description: 'Prints a formatted summary after the transfer.', takesValue: true },
    ],
    operands: [{ name: 'url', description: 'The URL to request.', repeats: true }],
  },

  tar: {
    name: 'tar',
    summary: 'Creates and extracts archive files.',
    options: [
      { short: ['c'], long: ['create'], description: 'Creates a new archive.' },
      { short: ['x'], long: ['extract'], description: 'Extracts files from an archive.' },
      { short: ['t'], long: ['list'], description: 'Lists the contents of an archive without extracting.' },
      { short: ['f'], long: ['file'], description: 'Names the archive file. Must be followed by the path.', takesValue: true },
      { short: ['z'], long: ['gzip'], description: 'Filters the archive through gzip.' },
      { short: ['j'], long: ['bzip2'], description: 'Filters the archive through bzip2.' },
      { short: ['J'], long: ['xz'], description: 'Filters the archive through xz.' },
      { short: ['v'], long: ['verbose'], description: 'Lists each file as it is processed.' },
      { short: ['C'], long: ['directory'], description: 'Changes to this directory before working.', takesValue: true },
      { long: ['strip-components'], description: 'Removes this many leading path components when extracting.', takesValue: true },
    ],
  },

  ssh: {
    name: 'ssh',
    summary: 'Opens an encrypted login session on a remote host.',
    options: [
      { short: ['p'], description: 'Connects to this port instead of 22.', takesValue: true },
      { short: ['i'], description: 'Uses this private key file for authentication.', takesValue: true },
      { short: ['L'], description: 'Forwards a local port to a host reachable from the remote side.', takesValue: true },
      { short: ['R'], description: 'Forwards a remote port back to a host reachable locally.', takesValue: true },
      { short: ['N'], description: 'Does not run a remote command; used when only forwarding ports.' },
      { short: ['A'], description: 'Forwards your authentication agent to the remote host.' },
      { short: ['v'], description: 'Verbose output. Repeat as -vv or -vvv for more detail.' },
    ],
    operands: [{ name: 'destination', description: 'Target as host or user@host.' }],
  },

  git: {
    name: 'git',
    summary: 'Distributed version control system.',
    options: [
      { short: ['C'], description: 'Runs as if git was started in this directory.', takesValue: true },
      { long: ['no-pager'], description: 'Writes output directly instead of through a pager.' },
      { long: ['version'], description: 'Prints the git version.' },
    ],
    subcommands: [
      {
        name: 'status',
        description: 'Shows which files are staged, modified or untracked.',
        options: [
          { short: ['s'], long: ['short'], description: 'Compact one-line-per-file output.' },
          { short: ['b'], long: ['branch'], description: 'Shows the branch and tracking information.' },
        ],
      },
      {
        name: 'commit',
        description: 'Records the staged changes as a new commit.',
        options: [
          { short: ['m'], long: ['message'], description: 'Uses this text as the commit message.', takesValue: true },
          { short: ['a'], long: ['all'], description: 'Stages every tracked file that has been modified or deleted.' },
          { long: ['amend'], description: 'Replaces the previous commit. Rewrites history, so avoid it on shared branches.' },
          { long: ['no-verify'], description: 'Skips pre-commit and commit-message hooks.' },
        ],
      },
      {
        name: 'checkout',
        description: 'Switches branches or restores files in the working tree.',
        options: [
          { short: ['b'], description: 'Creates the branch and switches to it.', takesValue: true },
          { short: ['B'], description: 'Creates or resets the branch, then switches to it.', takesValue: true },
          { short: ['f'], long: ['force'], description: 'Discards local changes to proceed.' },
        ],
      },
      {
        name: 'switch',
        description: 'Switches branches. Clearer than checkout because it cannot also restore files.',
        options: [{ short: ['c'], long: ['create'], description: 'Creates the branch and switches to it.', takesValue: true }],
      },
      {
        name: 'rebase',
        description: 'Replays commits onto another base, producing new commit identifiers.',
        options: [
          { short: ['i'], long: ['interactive'], description: 'Opens an editor to reorder, squash or drop commits.' },
          { long: ['onto'], description: 'Replays onto this commit instead of the upstream.', takesValue: true },
          { long: ['abort'], description: 'Stops the rebase and restores the original branch.' },
          { long: ['continue'], description: 'Resumes after resolving a conflict.' },
        ],
      },
      {
        name: 'reset',
        description: 'Moves the branch pointer, optionally changing the index and working tree.',
        options: [
          { long: ['soft'], description: 'Moves the branch only; the index and working tree are untouched.' },
          { long: ['mixed'], description: 'Moves the branch and resets the index. This is the default.' },
          { long: ['hard'], description: 'Moves the branch and discards index and working-tree changes. Uncommitted work is lost.' },
        ],
      },
      { name: 'revert', description: 'Creates a new commit that undoes an earlier one, leaving history intact.' },
      { name: 'cherry-pick', description: 'Applies the change from an existing commit onto the current branch.' },
      {
        name: 'log',
        description: 'Shows commit history.',
        options: [
          { long: ['oneline'], description: 'One compact line per commit.' },
          { long: ['graph'], description: 'Draws an ASCII branch and merge graph.' },
          { short: ['p'], long: ['patch'], description: 'Includes the diff for each commit.' },
          { short: ['n'], description: 'Limits the number of commits shown.', takesValue: true },
        ],
      },
      {
        name: 'push',
        description: 'Sends local commits to a remote repository.',
        options: [
          { short: ['u'], long: ['set-upstream'], description: 'Records the remote branch as the tracking branch.' },
          { short: ['f'], long: ['force'], description: 'Overwrites the remote branch. Can destroy commits others depend on.' },
          { long: ['force-with-lease'], description: 'Overwrites only if the remote is where you last saw it. Safer than --force.' },
          { long: ['tags'], description: 'Pushes tags as well as commits.' },
        ],
      },
      {
        name: 'pull',
        description: 'Fetches from a remote and integrates the result.',
        options: [
          { long: ['rebase'], description: 'Replays your local commits on top of the fetched ones instead of merging.' },
          { long: ['ff-only'], description: 'Fails rather than creating a merge commit.' },
        ],
      },
      {
        name: 'clone',
        description: 'Copies a repository into a new directory.',
        options: [
          { long: ['depth'], description: 'Truncates history to this many commits, producing a shallow clone.', takesValue: true },
          { short: ['b'], long: ['branch'], description: 'Checks out this branch instead of the default.', takesValue: true },
        ],
      },
      {
        name: 'diff',
        description: 'Shows changes between commits, the index and the working tree.',
        options: [
          { long: ['staged'], description: 'Compares the index against the last commit.' },
          { long: ['cached'], description: 'An older name for --staged.' },
          { long: ['stat'], description: 'Summarises changes per file instead of printing the diff.' },
        ],
      },
      {
        name: 'branch',
        description: 'Lists, creates or deletes branches.',
        options: [
          { short: ['d'], long: ['delete'], description: 'Deletes a branch that has been merged.' },
          { short: ['D'], description: 'Deletes a branch even if it has unmerged commits.' },
          { short: ['a'], long: ['all'], description: 'Lists local and remote-tracking branches.' },
        ],
      },
      { name: 'merge', description: 'Joins another branch into the current one.' },
      { name: 'stash', description: 'Saves uncommitted changes aside and restores a clean working tree.' },
      { name: 'fetch', description: 'Downloads remote history without changing your working tree.' },
    ],
  },

  docker: {
    name: 'docker',
    summary: 'Builds and runs containers.',
    subcommands: [
      {
        name: 'run',
        description: 'Creates and starts a container from an image.',
        options: [
          { short: ['d'], long: ['detach'], description: 'Runs in the background and prints the container id.' },
          { short: ['p'], long: ['publish'], description: 'Publishes a container port to the host, as host:container.', takesValue: true },
          { short: ['e'], long: ['env'], description: 'Sets an environment variable in the container.', takesValue: true },
          { short: ['v'], long: ['volume'], description: 'Mounts a host path or named volume into the container.', takesValue: true },
          { long: ['rm'], description: 'Removes the container when it exits.' },
          { short: ['it'], description: 'Combined -i and -t: keeps stdin open and allocates a terminal.' },
          { long: ['name'], description: 'Assigns a name to the container.', takesValue: true },
          { long: ['network'], description: 'Connects the container to this network.', takesValue: true },
        ],
      },
      {
        name: 'build',
        description: 'Builds an image from a Dockerfile.',
        options: [
          { short: ['t'], long: ['tag'], description: 'Names and optionally tags the resulting image.', takesValue: true },
          { short: ['f'], long: ['file'], description: 'Uses this Dockerfile instead of ./Dockerfile.', takesValue: true },
          { long: ['no-cache'], description: 'Ignores cached layers and rebuilds every step.' },
          { long: ['build-arg'], description: 'Sets a build-time variable.', takesValue: true },
        ],
      },
      { name: 'ps', description: 'Lists containers. Add -a to include stopped ones.', options: [{ short: ['a'], long: ['all'], description: 'Includes stopped containers.' }] },
      { name: 'logs', description: 'Shows a container’s output.', options: [{ short: ['f'], long: ['follow'], description: 'Streams new output as it arrives.' }] },
      { name: 'exec', description: 'Runs a command inside a running container.' },
      { name: 'images', description: 'Lists local images.' },
      { name: 'compose', description: 'Runs the multi-container Compose workflow.' },
    ],
  },

  kubectl: {
    name: 'kubectl',
    summary: 'Controls a Kubernetes cluster.',
    options: [
      { short: ['n'], long: ['namespace'], description: 'Targets this namespace.', takesValue: true },
      { short: ['o'], long: ['output'], description: 'Output format, for example json, yaml or wide.', takesValue: true },
      { long: ['context'], description: 'Uses this kubeconfig context.', takesValue: true },
    ],
    subcommands: [
      { name: 'get', description: 'Lists resources of a given type.' },
      { name: 'describe', description: 'Shows detailed state and recent events for a resource.' },
      { name: 'apply', description: 'Creates or updates resources from a manifest.', options: [{ short: ['f'], long: ['filename'], description: 'Manifest file, directory or URL.', takesValue: true }] },
      { name: 'delete', description: 'Removes resources. Irreversible for anything without a backing manifest.' },
      { name: 'logs', description: 'Prints container logs for a pod.', options: [{ short: ['f'], long: ['follow'], description: 'Streams new log lines.' }] },
      { name: 'exec', description: 'Runs a command in a container.' },
      { name: 'port-forward', description: 'Forwards a local port to a pod or service.' },
    ],
  },

  sed: {
    name: 'sed',
    summary: 'Edits a stream of text line by line using a script.',
    options: [
      { short: ['e'], long: ['expression'], description: 'Adds a script expression. Repeat for several.', takesValue: true },
      { short: ['i'], long: ['in-place'], description: 'Edits files in place. GNU sed takes an optional backup suffix; BSD sed requires one.' },
      { short: ['n'], long: ['quiet'], description: 'Suppresses automatic printing, so only explicit p commands produce output.' },
      { short: ['E', 'r'], long: ['regexp-extended'], description: 'Uses extended regular expressions.' },
    ],
  },

  awk: {
    name: 'awk',
    summary: 'Processes text as records and fields using a pattern-action program.',
    options: [
      { short: ['F'], description: 'Sets the input field separator.', takesValue: true },
      { short: ['v'], description: 'Assigns a variable before the program runs.', takesValue: true },
      { short: ['f'], description: 'Reads the program from a file.', takesValue: true },
    ],
  },

  ps: {
    name: 'ps',
    summary: 'Reports a snapshot of current processes.',
    options: [
      { short: ['a'], description: 'Includes processes belonging to other users.' },
      { short: ['u'], description: 'Adds owner and resource-usage columns.' },
      { short: ['x'], description: 'Includes processes with no controlling terminal.' },
      { short: ['e'], description: 'Selects every process.' },
      { short: ['f'], description: 'Full format listing, showing the parent relationship.' },
    ],
  },

  kill: {
    name: 'kill',
    summary: 'Sends a signal to a process.',
    options: [
      { short: ['9'], description: 'Sends SIGKILL, which cannot be caught. The process gets no chance to clean up.' },
      { short: ['15'], description: 'Sends SIGTERM, the default polite request to stop.' },
      { short: ['s'], long: ['signal'], description: 'Names the signal to send.', takesValue: true },
      { short: ['l'], long: ['list'], description: 'Lists signal names.' },
    ],
    operands: [{ name: 'pid', description: 'Process identifiers to signal.', repeats: true }],
  },

  dd: {
    name: 'dd',
    summary: 'Copies and converts data block by block, writing directly to the target.',
    usage: 'Takes operands as key=value pairs, such as if=, of=, bs= and count=.',
  },

  npm: {
    name: 'npm',
    summary: 'Node.js package manager.',
    subcommands: [
      { name: 'install', description: 'Installs dependencies, or adds the named packages.', options: [{ short: ['D'], long: ['save-dev'], description: 'Records the package as a development dependency.' }, { short: ['g'], long: ['global'], description: 'Installs for the whole machine rather than this project.' }] },
      { name: 'ci', description: 'Installs exactly what the lockfile specifies, after removing node_modules.' },
      { name: 'run', description: 'Runs a script defined in package.json.' },
      { name: 'test', description: 'Runs the test script.' },
      { name: 'publish', description: 'Publishes the package to a registry.' },
      { name: 'audit', description: 'Reports known vulnerabilities in the dependency tree.' },
    ],
  },

  pnpm: {
    name: 'pnpm',
    summary: 'Fast, disk-efficient Node.js package manager using a content-addressable store.',
    options: [
      { short: ['r'], long: ['recursive'], description: 'Runs across every package in the workspace.' },
      { short: ['C'], long: ['dir'], description: 'Runs as if started in this directory.', takesValue: true },
      { long: ['filter'], description: 'Restricts the command to matching workspace packages.', takesValue: true },
      { long: ['frozen-lockfile'], description: 'Fails rather than updating the lockfile. Use in CI.' },
    ],
    subcommands: [
      { name: 'install', description: 'Installs dependencies for the workspace.' },
      { name: 'add', description: 'Adds a dependency.' },
      { name: 'run', description: 'Runs a package script.' },
      { name: 'exec', description: 'Runs a binary from the local dependency tree.' },
    ],
  },

  go: {
    name: 'go',
    summary: 'Go toolchain driver.',
    subcommands: [
      { name: 'build', description: 'Compiles packages, discarding the result unless an output is named.', options: [{ short: ['o'], description: 'Writes the binary to this path.', takesValue: true }] },
      { name: 'test', description: 'Runs tests.', options: [{ short: ['v'], description: 'Verbose output, listing each test.' }, { long: ['race'], description: 'Enables the data-race detector.' }, { long: ['run'], description: 'Runs only tests whose names match this pattern.', takesValue: true }, { long: ['cover'], description: 'Reports test coverage.' }] },
      { name: 'vet', description: 'Reports likely mistakes that compile but are probably wrong.' },
      { name: 'mod', description: 'Manages the module definition and dependency graph.' },
      { name: 'run', description: 'Compiles and runs a program in one step.' },
      { name: 'fmt', description: 'Formats source files in the canonical style.' },
    ],
  },

  cat: {
    name: 'cat',
    summary: 'Concatenates files and writes them to standard output.',
    options: [
      { short: ['n'], long: ['number'], description: 'Numbers every output line.' },
      { short: ['A'], long: ['show-all'], description: 'Makes non-printing characters visible.' },
    ],
    operands: [{ name: 'file', description: 'Files to print. With none, reads standard input.', repeats: true }],
  },

  head: {
    name: 'head',
    summary: 'Prints the first part of files.',
    options: [
      { short: ['n'], long: ['lines'], description: 'Prints this many lines instead of the first ten.', takesValue: true },
      { short: ['c'], long: ['bytes'], description: 'Prints this many bytes.', takesValue: true },
    ],
  },

  tail: {
    name: 'tail',
    summary: 'Prints the last part of files.',
    options: [
      { short: ['n'], long: ['lines'], description: 'Prints this many lines instead of the last ten.', takesValue: true },
      { short: ['f'], long: ['follow'], description: 'Keeps the file open and prints new lines as they are written.' },
      { short: ['F'], description: 'Like -f but survives the file being rotated and recreated.' },
    ],
  },

  xargs: {
    name: 'xargs',
    summary: 'Builds and runs command lines from items read on standard input.',
    options: [
      { short: ['0'], long: ['null'], description: 'Expects null-separated input, which is safe for names containing spaces.' },
      { short: ['n'], long: ['max-args'], description: 'Passes at most this many arguments per command run.', takesValue: true },
      { short: ['I'], description: 'Replaces this token in the command with each input item.', takesValue: true },
      { short: ['P'], long: ['max-procs'], description: 'Runs this many command instances in parallel.', takesValue: true },
    ],
  },

  sort: {
    name: 'sort',
    summary: 'Sorts lines of text.',
    options: [
      { short: ['n'], long: ['numeric-sort'], description: 'Compares according to numeric value rather than as text.' },
      { short: ['r'], long: ['reverse'], description: 'Reverses the comparison result.' },
      { short: ['u'], long: ['unique'], description: 'Outputs only the first of an equal run.' },
      { short: ['k'], long: ['key'], description: 'Sorts on this field position.', takesValue: true },
      { short: ['t'], long: ['field-separator'], description: 'Uses this character to separate fields.', takesValue: true },
      { short: ['h'], long: ['human-numeric-sort'], description: 'Compares sizes written with K, M and G suffixes.' },
    ],
  },

  uniq: {
    name: 'uniq',
    summary: 'Reports or filters out repeated adjacent lines. Input usually needs sorting first.',
    options: [
      { short: ['c'], long: ['count'], description: 'Prefixes each line with the number of occurrences.' },
      { short: ['d'], long: ['repeated'], description: 'Prints only the lines that are duplicated.' },
      { short: ['u'], long: ['unique'], description: 'Prints only the lines that appear exactly once.' },
    ],
  },

  wc: {
    name: 'wc',
    summary: 'Counts lines, words and bytes.',
    options: [
      { short: ['l'], long: ['lines'], description: 'Counts lines.' },
      { short: ['w'], long: ['words'], description: 'Counts words.' },
      { short: ['c'], long: ['bytes'], description: 'Counts bytes.' },
      { short: ['m'], long: ['chars'], description: 'Counts characters, which differs from bytes for multi-byte text.' },
    ],
  },

  systemctl: {
    name: 'systemctl',
    summary: 'Controls the systemd service manager.',
    subcommands: [
      { name: 'status', description: 'Shows whether a unit is running, plus recent log lines.' },
      { name: 'start', description: 'Starts a unit now.' },
      { name: 'stop', description: 'Stops a unit now.' },
      { name: 'restart', description: 'Stops and starts a unit.' },
      { name: 'enable', description: 'Starts the unit automatically at boot.' },
      { name: 'disable', description: 'Stops the unit from starting at boot.' },
      { name: 'daemon-reload', description: 'Re-reads unit files after they have been edited.' },
    ],
  },
};

/** Commands whose names are recognised, for the "did you mean" hint. */
export const KNOWN_COMMAND_NAMES = Object.keys(COMMANDS).sort();
