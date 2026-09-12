/**
 * Regular expression reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'regex',
  name: 'Regular Expressions',
  url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions',
  license: 'MIT',
  attribution: 'Original reference content authored for Developer Toolbox.',
};

export const documents = [
  {
    id: 'regex/syntax-reference',
    title: 'Regular expression syntax reference',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions',
    tags: 'character class quantifier anchor escape dot star plus question greedy lazy alternation',
    headings: ['Character classes', 'Quantifiers', 'Anchors and boundaries', 'Groups', 'Escaping'],
    body: `
<h2>Character classes</h2>
<ul>
<li><code>.</code> — any character except a newline, unless the dotAll flag is set.</li>
<li><code>\\d</code> <code>\\D</code> — digit, non-digit.</li>
<li><code>\\w</code> <code>\\W</code> — word character (<code>[A-Za-z0-9_]</code>) and
its complement. Note that it is ASCII-only: <code>é</code> is not a word
character.</li>
<li><code>\\s</code> <code>\\S</code> — whitespace, including tabs and newlines.</li>
<li><code>[abc]</code> a set, <code>[^abc]</code> its complement,
<code>[a-z]</code> a range. Inside a class, most metacharacters lose their meaning —
<code>[.]</code> matches a literal dot.</li>
</ul>

<h2>Quantifiers</h2>
<ul>
<li><code>*</code> zero or more, <code>+</code> one or more, <code>?</code> zero or
one.</li>
<li><code>{n}</code> exactly n, <code>{n,}</code> n or more, <code>{n,m}</code>
between n and m.</li>
<li>Appending <code>?</code> makes a quantifier lazy: <code>.*?</code> takes the
shortest match rather than the longest. This is usually what you want between
delimiters — <code>&lt;.*&gt;</code> on <code>&lt;a&gt;&lt;b&gt;</code> matches the
whole string, while <code>&lt;.*?&gt;</code> matches just <code>&lt;a&gt;</code>.</li>
</ul>

<h2>Anchors and boundaries</h2>
<p><code>^</code> and <code>$</code> match the start and end of the input — or of each
line, with the multiline flag. <code>\\b</code> is a word boundary, a zero-width
assertion between a word and a non-word character; <code>\\bcat\\b</code> matches
<code>cat</code> but not <code>concatenate</code>.</p>

<h2>Groups</h2>
<ul>
<li><code>(...)</code> captures; refer to it as <code>$1</code> in a replacement and
<code>\\1</code> inside the pattern.</li>
<li><code>(?:...)</code> groups without capturing — cheaper and keeps your group
numbers stable.</li>
<li><code>(?&lt;name&gt;...)</code> captures by name, retrieved as
<code>$&lt;name&gt;</code> or <code>match.groups.name</code>. Worth using for
anything with more than two groups.</li>
<li><code>a|b</code> alternates. It has the lowest precedence, so
<code>^cat|dog$</code> means <code>(^cat)|(dog$)</code> — parenthesise it.</li>
</ul>

<h2>Escaping</h2>
<p>These need a backslash outside a character class:
<code>. * + ? ^ $ { } ( ) | [ ] \\ /</code>. When building a pattern from user input,
escape it — in JavaScript, <code>str.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&amp;')</code>.
Concatenating unescaped input into a pattern is an injection.</p>
`,
  },

  {
    id: 'regex/lookaround',
    title: 'Lookahead and lookbehind',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Lookahead_assertion',
    tags: 'lookahead lookbehind positive negative assertion zero-width password validation',
    headings: ['The four forms', 'Zero-width', 'Practical uses', 'Support'],
    body: `
<h2>The four forms</h2>
<ul>
<li><code>(?=...)</code> positive lookahead — what follows must match.</li>
<li><code>(?!...)</code> negative lookahead — what follows must not match.</li>
<li><code>(?&lt;=...)</code> positive lookbehind — what precedes must match.</li>
<li><code>(?&lt;!...)</code> negative lookbehind — what precedes must not match.</li>
</ul>

<h2>Zero-width</h2>
<p>Lookarounds assert without consuming. <code>foo(?=bar)</code> matches only the
<code>foo</code>, leaving the position right after it — so the <code>bar</code> is
still available to the rest of the pattern. This is what makes them composable, and
also why several can be stacked at the same position.</p>

<h2>Practical uses</h2>
<p>Requiring several independent properties at once, which is otherwise awkward:</p>
<pre><code>^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,}$</code></pre>
<p>Each lookahead scans from the start independently, so order does not matter. (As a
password rule this is poor practice — length matters far more than composition — but
it demonstrates the technique.)</p>
<p>Matching something not followed by something else:</p>
<pre><code>\\bcat\\b(?!\\s+food)      # "cat" but not "cat food"
(?&lt;=\\$)\\d+(\\.\\d{2})?     # the number after a dollar sign, without the sign</code></pre>
<p>Splitting on a delimiter you want to keep also relies on this:
<code>str.split(/(?=[A-Z])/)</code> breaks camelCase without losing the capitals.</p>

<h2>Support</h2>
<p>Lookahead is universal. Lookbehind is not: it is supported in modern JavaScript
engines, .NET, PCRE and Python, but absent from older JavaScript, Go's RE2 and most
POSIX tools. Go and RE2 omit it deliberately — they guarantee linear-time matching,
which lookbehind and backreferences make impossible.</p>
`,
  },

  {
    id: 'regex/flags-and-engines',
    title: 'Flags, and how engines differ',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp',
    tags: 'flags global ignoreCase multiline dotAll unicode sticky lastIndex RE2 PCRE .NET POSIX',
    headings: ['JavaScript flags', 'The global flag trap', 'Engine differences', 'Which engine am I using'],
    body: `
<h2>JavaScript flags</h2>
<ul>
<li><code>g</code> global — find all matches rather than the first.</li>
<li><code>i</code> ignore case.</li>
<li><code>m</code> multiline — <code>^</code> and <code>$</code> match at line
breaks.</li>
<li><code>s</code> dotAll — <code>.</code> also matches a newline.</li>
<li><code>u</code> / <code>v</code> unicode — enables <code>\\p{...}</code> property
escapes and treats the pattern as code points rather than UTF-16 units.</li>
<li><code>y</code> sticky — match only at <code>lastIndex</code>.</li>
</ul>

<h2>The global flag trap</h2>
<p>A regex with <code>g</code> is stateful: it carries a <code>lastIndex</code> that
advances on each call. Reusing one object across calls gives alternating results:</p>
<pre><code>const re = /a/g;
re.test('a');  // true,  lastIndex is now 1
re.test('a');  // false, resumed from index 1
</code></pre>
<p>So do not share a global regex, and do not put one in a module constant used by
<code>test</code>. A zero-length match with <code>g</code> also fails to advance,
which is how <code>while (re.exec(s))</code> becomes an infinite loop — advance
<code>lastIndex</code> manually when the match is empty.</p>

<h2>Engine differences</h2>
<ul>
<li><strong>ECMAScript</strong> — no possessive quantifiers, no atomic groups, no
recursion, no inline comments. Lookbehind is supported.</li>
<li><strong>PCRE</strong> (PHP, and via libraries almost everywhere) — the largest
feature set: atomic groups, recursion, conditionals, <code>\\K</code>.</li>
<li><strong>.NET</strong> — named groups with a different syntax, right-to-left
matching, variable-length lookbehind.</li>
<li><strong>RE2</strong> (Go, and Rust's <code>regex</code> crate) — no
backreferences and no lookaround at all, in exchange for a guarantee of linear time.
A pattern that runs in RE2 cannot catastrophically backtrack.</li>
<li><strong>POSIX</strong> (<code>grep</code>, <code>sed</code>) — basic and extended
variants differ in whether <code>+</code> and <code>?</code> need escaping.</li>
</ul>

<h2>Which engine am I using</h2>
<p>This matters because a pattern tested in one engine can fail or behave differently
in another, and the failure is often silent rather than an error. The Developer
Toolbox regex workbench is explicitly labelled ECMAScript for this reason: it runs
your browser's engine and does not claim PCRE or .NET compatibility it has not
tested.</p>
`,
  },

  {
    id: 'regex/catastrophic-backtracking',
    title: 'Catastrophic backtracking and ReDoS',
    url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS',
    tags: 'ReDoS catastrophic backtracking denial of service nested quantifier atomic group timeout linear',
    headings: ['The shape of the problem', 'Recognising a risky pattern', 'Fixes', 'Where it bites'],
    body: `
<h2>The shape of the problem</h2>
<p>A backtracking engine tries alternatives until one matches. When a pattern lets the
same input be divided many ways, the number of attempts can grow exponentially with
input length. The classic example:</p>
<pre><code>/^(a+)+$/.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaX')</code></pre>
<p>The inner <code>a+</code> and the outer <code>+</code> can split the a's in
exponentially many ways, and the trailing <code>X</code> forces the engine to try all
of them before failing. Thirty characters is enough to hang a thread.</p>

<h2>Recognising a risky pattern</h2>
<p>Look for a quantifier applied to something already quantified, or to an
alternation whose branches can match the same text:</p>
<ul>
<li><code>(a+)+</code>, <code>(a*)*</code>, <code>(a|aa)+</code> — nested or
ambiguous.</li>
<li><code>(.*,)*</code> — a very common real-world form, in CSV and header
parsing.</li>
<li><code>^(\\s*\\w+)+$</code> — looks harmless, backtracks catastrophically.</li>
</ul>
<p>The danger only materialises when the match <em>fails</em>, which is why these
patterns pass every test written with valid input.</p>

<h2>Fixes</h2>
<ul>
<li>Make the pattern unambiguous. <code>(a+)+</code> is just <code>a+</code>.
<code>(.*,)*</code> is usually <code>[^,]*(,[^,]*)*</code>.</li>
<li>Anchor and bound. A <code>{1,64}</code> limit caps the search space.</li>
<li>Limit input length before matching. This is the cheapest mitigation and the one
most often forgotten.</li>
<li>Use atomic groups <code>(?&gt;...)</code> or possessive quantifiers
<code>a++</code> where the engine supports them — they forbid backtracking into the
group. Not available in ECMAScript.</li>
<li>Use an engine that cannot backtrack. RE2 (Go, Rust) is immune by
construction.</li>
</ul>

<h2>Where it bites</h2>
<p>Anywhere a pattern meets untrusted input: validating a submitted email or URL,
parsing a <code>User-Agent</code>, scanning uploaded text, or a log pipeline applying
a regex to lines from elsewhere. A single request can consume a CPU core for minutes,
which is why this is a denial-of-service class and not a performance note.</p>
`,
  },
];
