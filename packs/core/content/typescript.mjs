/**
 * TypeScript reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'typescript',
  name: 'TypeScript',
  url: 'https://www.typescriptlang.org/docs/',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to the TypeScript documentation; no documentation text is reproduced.',
};

export const documents = [
  {
    id: 'typescript/interfaces-and-type-aliases',
    title: 'Interfaces versus type aliases',
    url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
    tags: 'interface type alias extends intersection declaration merging union structural typing',
    headings: ['What each can express', 'Extension', 'Declaration merging', 'Which to use'],
    body: `
<h2>What each can express</h2>
<p>An <code>interface</code> describes an object shape. A <code>type</code> alias
names any type at all — unions, tuples, primitives, mapped and conditional types:</p>
<pre><code>interface Person { name: string; age: number }

type Person2 = { name: string; age: number };
type Id = string | number;               // only a type alias can do this
type Pair = [number, number];
type Keys = keyof Person;</code></pre>

<h2>Extension</h2>
<pre><code>interface Employee extends Person { employeeId: string }
type Employee2 = Person & { employeeId: string };</code></pre>
<p>These are not identical. <code>extends</code> checks compatibility and errors on a
conflicting property; an intersection silently produces <code>never</code> for the
conflicting member, so the mistake surfaces much later at the use site.</p>

<h2>Declaration merging</h2>
<p>Two interfaces with the same name in the same scope merge into one. Two type
aliases with the same name are an error. Merging is how ambient library types are
augmented — declaring <code>interface Window</code> to add a property — and it is also
why an interface name is not as safely local as an alias.</p>

<h2>Which to use</h2>
<p>Interfaces for object shapes that others may extend or augment, particularly in a
published library. Type aliases for everything else, and for shapes you would rather
nobody merged into. Both are structural: a value is assignable if its shape fits,
regardless of what it was declared as.</p>
`,
  },

  {
    id: 'typescript/narrowing',
    title: 'Narrowing and type guards',
    url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html',
    tags: 'narrowing typeof instanceof in discriminated union type predicate is assertion never exhaustive',
    headings: ['Built-in narrowing', 'Discriminated unions', 'Type predicates', 'Exhaustiveness'],
    body: `
<h2>Built-in narrowing</h2>
<p>The compiler follows control flow. <code>typeof</code>, <code>instanceof</code>,
<code>in</code>, truthiness and equality checks all narrow a union:</p>
<pre><code>function format(value: string | number | Date) {
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date)     return value.toISOString();
  return value.toFixed(2);       // number
}</code></pre>
<p>Narrowing is undone by anything the compiler cannot follow — an
<code>await</code>, a callback boundary, or reassignment — so a narrowed value used
inside a closure may widen again.</p>

<h2>Discriminated unions</h2>
<p>The most useful pattern in the language. Give each member a literal-typed tag and
the compiler narrows on it:</p>
<pre><code>type Result =
  | { ok: true;  value: string }
  | { ok: false; error: string };

function handle(r: Result) {
  if (r.ok) return r.value;   // value is available, error is not
  return r.error;
}</code></pre>
<p>Without the tag, accessing <code>r.value</code> on the union is an error and
<code>in</code> checks are the only recourse.</p>

<h2>Type predicates</h2>
<p>A function returning <code>x is T</code> teaches the compiler about a check it
cannot infer:</p>
<pre><code>function isNonEmpty(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.length > 0;
}
const names = raw.filter(isNonEmpty);   // string[], not (string|null)[]</code></pre>
<p>A predicate is an assertion the compiler trusts without checking. If the body is
wrong, the type system is wrong — the same hazard as <code>as</code>, just
better-contained.</p>

<h2>Exhaustiveness</h2>
<p>Assign to <code>never</code> in the default branch and adding a union member
becomes a compile error at every switch that handles it:</p>
<pre><code>function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2;
    case 'square': return s.side ** 2;
    default: {
      const exhaustive: never = s;
      throw new Error(\`unhandled: \${exhaustive}\`);
    }
  }
}</code></pre>
`,
  },

  {
    id: 'typescript/generics',
    title: 'Generics, constraints and inference',
    url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
    tags: 'generic type parameter extends constraint keyof infer conditional default variance',
    headings: ['Type parameters', 'Constraints', 'keyof and indexed access', 'Conditional types and infer', 'When not to'],
    body: `
<h2>Type parameters</h2>
<p>A generic relates types to each other. The value of
<code>&lt;T&gt;(x: T) =&gt; T[]</code> is that the output is tied to the input;
<code>(x: unknown) =&gt; unknown[]</code> tells the caller nothing.</p>

<h2>Constraints</h2>
<pre><code>function longest&lt;T extends { length: number }&gt;(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}</code></pre>
<p>The constraint is what lets the body use <code>.length</code> while the return type
stays the caller's exact type.</p>

<h2>keyof and indexed access</h2>
<pre><code>function get&lt;T, K extends keyof T&gt;(obj: T, key: K): T[K] {
  return obj[key];
}
const name = get({ name: 'a', age: 1 }, 'name');  // string, not string | number</code></pre>
<p>This is the pattern behind most typed property access, and it rejects a key that
does not exist at compile time.</p>

<h2>Conditional types and infer</h2>
<pre><code>type Unwrap&lt;T&gt; = T extends Promise&lt;infer U&gt; ? U : T;
type A = Unwrap&lt;Promise&lt;string&gt;&gt;;  // string
type B = Unwrap&lt;number&gt;;           // number</code></pre>
<p>A conditional type distributes over a union, so
<code>Unwrap&lt;Promise&lt;string&gt; | number&gt;</code> is
<code>string | number</code>. That is usually wanted; when it is not, wrap both sides
in a tuple to switch it off.</p>
<p>The standard library's <code>Partial</code>, <code>Required</code>,
<code>Pick</code>, <code>Omit</code>, <code>Record</code> and
<code>ReturnType</code> are all built from these primitives and are worth reaching for
before writing a new one.</p>

<h2>When not to</h2>
<p>A type parameter used exactly once in a signature is not doing anything:
<code>&lt;T&gt;(x: T) =&gt; void</code> is just <code>(x: unknown) =&gt; void</code>. A
generic earns its place when it appears at least twice — linking a parameter to the
return type, or two parameters to each other.</p>
`,
  },

  {
    id: 'typescript/strict-mode',
    title: 'Strict mode and the compiler options that matter',
    url: 'https://www.typescriptlang.org/tsconfig',
    tags: 'strict strictNullChecks noUncheckedIndexedAccess exactOptionalPropertyTypes noImplicitAny tsconfig',
    headings: ['What strict turns on', 'Beyond strict', 'Options that are not type safety', 'Adopting it on an existing codebase'],
    body: `
<h2>What strict turns on</h2>
<p><code>"strict": true</code> is a bundle. The two that change the most code:</p>
<ul>
<li><code>strictNullChecks</code> — <code>null</code> and <code>undefined</code> stop
being assignable to everything. This is the single highest-value option in the
language; without it the type system cannot tell you about the most common runtime
error there is.</li>
<li><code>noImplicitAny</code> — an unannotated parameter is an error rather than
silently <code>any</code>.</li>
</ul>
<p>Also included: <code>strictFunctionTypes</code>,
<code>strictBindCallApply</code>, <code>strictPropertyInitialization</code>,
<code>noImplicitThis</code> and <code>useUnknownInCatchVariables</code> — the last
making <code>catch (e)</code> give <code>unknown</code>, which forces a check before
reading <code>e.message</code>.</p>

<h2>Beyond strict</h2>
<p>Two more are not in <code>strict</code> but worth enabling:</p>
<ul>
<li><code>noUncheckedIndexedAccess</code> — <code>arr[0]</code> becomes
<code>T | undefined</code>. Noisy, and correct: indexing past the end returns
<code>undefined</code> at run time whatever the type said.</li>
<li><code>exactOptionalPropertyTypes</code> — distinguishes a property that is absent
from one explicitly set to <code>undefined</code>. These differ in
<code>JSON.stringify</code>, in <code>in</code> checks and in spread behaviour.</li>
</ul>
<p><code>noImplicitOverride</code> and <code>noFallthroughCasesInSwitch</code> are
cheap additions that catch real mistakes.</p>

<h2>Options that are not type safety</h2>
<p><code>skipLibCheck</code> only skips checking declaration files — it does not
weaken your own code, and it substantially speeds up builds.
<code>isolatedModules</code> constrains you to syntax a single-file transpiler can
handle, which is what bundlers require.</p>

<h2>Adopting it on an existing codebase</h2>
<p>Enabling <code>strict</code> wholesale on a large project produces thousands of
errors and gets reverted. Enable the individual flags one at a time, starting with
<code>noImplicitAny</code>, and use <code>strictNullChecks</code> last since it is the
largest. Per-file <code>// @ts-expect-error</code> is preferable to
<code>@ts-ignore</code> because it fails when the underlying error is fixed, so the
suppressions clean themselves up.</p>
`,
  },

  {
    id: 'typescript/unknown-versus-any',
    title: 'unknown, any and never',
    url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#unknown',
    tags: 'unknown any never void object type assertion as satisfies parsing external data',
    headings: ['any disables checking', 'unknown requires a check', 'never', 'satisfies', 'At the boundary'],
    body: `
<h2>any disables checking</h2>
<p><code>any</code> is not a type so much as an instruction to stop checking. It is
contagious: a single <code>any</code> flows through every expression it touches, so
one in a shared helper silently removes safety from every caller.</p>

<h2>unknown requires a check</h2>
<p><code>unknown</code> accepts any value but permits no operation until it is
narrowed. It is what <code>any</code> should have been:</p>
<pre><code>function handle(value: unknown) {
  // value.toUpperCase()          // error, as it should be
  if (typeof value === 'string') {
    return value.toUpperCase();   // fine
  }
}</code></pre>

<h2>never</h2>
<p><code>never</code> is the empty type: no value has it. It is the return type of a
function that always throws, the type of a variable in an unreachable branch, and the
result of an impossible intersection such as <code>string &amp; number</code>. A type
that unexpectedly became <code>never</code> usually means two constraints conflicted
somewhere upstream.</p>

<h2>satisfies</h2>
<p><code>as</code> asserts and can lie. <code>satisfies</code> checks against a type
while keeping the narrower inferred type:</p>
<pre><code>const config = {
  host: 'localhost',
  port: 8080,
} satisfies Record&lt;string, string | number&gt;;

config.port.toFixed(0);   // number, preserved
// With ": Record&lt;string, string | number&gt;" it would be string | number.</code></pre>

<h2>At the boundary</h2>
<p>Everything from outside the program — a parsed JSON body, a query result, a
message — is genuinely unknown at run time, and the compiler cannot verify it. Typing
<code>JSON.parse</code>'s result with <code>as MyType</code> is an assertion, not a
check: if the data differs, the program is wrong and the types said it was fine.
Validate at the boundary instead, with a JSON Schema validator or a schema library,
and let the type follow from the validation rather than replacing it.</p>
`,
  },
];
