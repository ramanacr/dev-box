/**
 * OpenAPI 3.1 reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'openapi',
  name: 'OpenAPI Specification',
  url: 'https://spec.openapis.org/oas/v3.1.1.html',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to the OpenAPI Specification; no specification text is reproduced.',
};

export const documents = [
  {
    id: 'openapi/document-structure',
    title: 'OpenAPI 3.1 document structure',
    url: 'https://spec.openapis.org/oas/v3.1.1.html#openapi-object',
    tags: 'openapi info paths components servers webhooks tags root object 3.1',
    headings: ['Required fields', 'The top-level objects', 'What changed in 3.1'],
    body: `
<p>An OpenAPI document describes an HTTP API in a language-agnostic form, so the same
file can drive documentation, client generation and contract testing.</p>

<h2>Required fields</h2>
<p>Only three things are mandatory: <code>openapi</code> (the version string),
<code>info</code> (with <code>title</code> and <code>version</code>), and at least one
of <code>paths</code>, <code>components</code> or <code>webhooks</code>.</p>
<pre><code>openapi: 3.1.0
info:
  title: Orders API
  version: 1.4.0
paths:
  /orders/{id}:
    get:
      operationId: getOrder
      responses:
        '200':
          description: The order
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'</code></pre>

<h2>The top-level objects</h2>
<ul>
<li><code>servers</code> — base URLs. Relative paths in <code>paths</code> are
resolved against these, and variables let one entry cover several environments.</li>
<li><code>paths</code> — the URL templates and their operations.</li>
<li><code>components</code> — reusable schemas, responses, parameters and security
schemes. Nothing here is exposed on its own; it exists to be referenced.</li>
<li><code>security</code> — the default requirement for every operation, overridable
per operation.</li>
<li><code>tags</code> — grouping, used by documentation tools for navigation.</li>
</ul>

<h2>What changed in 3.1</h2>
<p>3.1 aligns schemas with JSON Schema 2020-12 rather than a divergent subset, which
is the headline change: <code>$ref</code> can now sit alongside sibling keywords,
<code>examples</code> is an array, and <code>nullable</code> is gone in favour of a
type union. <code>webhooks</code> is new, and <code>paths</code> is no longer
required, so a document can describe only callbacks.</p>
`,
  },

  {
    id: 'openapi/parameters-and-request-bodies',
    title: 'Parameters and request bodies',
    url: 'https://spec.openapis.org/oas/v3.1.1.html#parameter-object',
    tags: 'parameter path query header cookie requestBody required style explode content',
    headings: ['Parameter locations', 'Required and defaults', 'Serialisation', 'Request bodies'],
    body: `
<h2>Parameter locations</h2>
<p><code>in</code> takes one of <code>path</code>, <code>query</code>,
<code>header</code> or <code>cookie</code>. A <code>path</code> parameter must exist
in the URL template and must be <code>required: true</code> — anything else is
contradictory, and validators will reject it.</p>

<h2>Required and defaults</h2>
<p><code>required</code> defaults to <code>false</code> everywhere except
<code>path</code>. A default value belongs in the parameter's <code>schema</code>, not
next to it, and it is documentation rather than instruction: the server still has to
apply it.</p>

<h2>Serialisation</h2>
<p>How an array or object becomes a query string is governed by <code>style</code> and
<code>explode</code>. The default for a query parameter is <code>form</code> with
<code>explode: true</code>, which renders <code>tags: [a, b]</code> as
<code>?tags=a&amp;tags=b</code>. With <code>explode: false</code> it becomes
<code>?tags=a,b</code>. Clients and servers disagreeing on this is a common
integration failure, and it is invisible until an array has two elements.</p>

<h2>Request bodies</h2>
<p>A body is not a parameter. It has its own <code>requestBody</code> object keyed by
media type:</p>
<pre><code>requestBody:
  required: true
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/CreateOrder'
    text/csv:
      schema:
        type: string</code></pre>
<p><code>GET</code> and <code>DELETE</code> may technically declare a body, but many
clients, proxies and servers drop it. Do not rely on one.</p>
`,
  },

  {
    id: 'openapi/references-and-components',
    title: '$ref, components and avoiding duplication',
    url: 'https://spec.openapis.org/oas/v3.1.1.html#reference-object',
    tags: '$ref components schemas JSON pointer remote reference bundle dereference allOf',
    headings: ['JSON pointers', 'Local versus remote references', 'Composition'],
    body: `
<h2>JSON pointers</h2>
<p>A <code>$ref</code> holds a URI whose fragment is a JSON pointer:
<code>#/components/schemas/Order</code>. Each segment is a key; <code>~0</code> and
<code>~1</code> escape <code>~</code> and <code>/</code> inside a key.</p>

<h2>Local versus remote references</h2>
<p>A pointer beginning <code>#/</code> resolves inside the same document. Anything
else — a relative file path or an absolute URL — is a remote reference, and resolving
it means fetching it.</p>
<p>That is why tooling that accepts untrusted documents should refuse remote
references outright: a <code>$ref</code> to an internal URL turns a document parser
into a request forger. The Developer Toolbox API workbench rejects
<code>http:</code>, <code>https:</code>, <code>file:</code> and protocol-relative
references for exactly this reason, and accepts only bundled documents.</p>
<p>"Bundling" rewrites remote references into local ones so a document becomes
self-contained; "dereferencing" inlines them entirely, which loses the sharing and
can blow up in size on a recursive schema.</p>

<h2>Composition</h2>
<p><code>allOf</code> intersects schemas and is how inheritance is usually modelled.
<code>oneOf</code> requires exactly one match, <code>anyOf</code> at least one. With
<code>oneOf</code>, add a <code>discriminator</code> so a generator does not have to
try each branch:</p>
<pre><code>schema:
  oneOf:
    - $ref: '#/components/schemas/CardPayment'
    - $ref: '#/components/schemas/BankPayment'
  discriminator:
    propertyName: method
    mapping:
      card: '#/components/schemas/CardPayment'
      bank: '#/components/schemas/BankPayment'</code></pre>
`,
  },

  {
    id: 'openapi/security-schemes',
    title: 'Security schemes and requirements',
    url: 'https://spec.openapis.org/oas/v3.1.1.html#security-scheme-object',
    tags: 'securitySchemes security bearer apiKey oauth2 openIdConnect scopes http',
    headings: ['Declaring a scheme', 'Applying requirements', 'AND versus OR', 'Making an endpoint public'],
    body: `
<h2>Declaring a scheme</h2>
<pre><code>components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key</code></pre>
<p><code>bearerFormat</code> is documentation only — nothing validates it.</p>

<h2>Applying requirements</h2>
<p>A top-level <code>security</code> array applies to every operation. An operation's
own <code>security</code> replaces it rather than adding to it.</p>

<h2>AND versus OR</h2>
<p>This is the part that reads backwards. Multiple <em>entries in the array</em> are
alternatives (OR); multiple <em>keys in one entry</em> must all be satisfied (AND).</p>
<pre><code># Either a bearer token OR an API key:
security:
  - bearerAuth: []
  - apiKey: []

# Both a bearer token AND an API key:
security:
  - bearerAuth: []
    apiKey: []</code></pre>

<h2>Making an endpoint public</h2>
<p>An empty array, <code>security: []</code>, on an operation removes the global
requirement. Omitting <code>security</code> does not — it inherits. A login endpoint
that still demands a token is usually this mistake.</p>
`,
  },

  {
    id: 'openapi/responses-and-examples',
    title: 'Responses, examples and contract testing',
    url: 'https://spec.openapis.org/oas/v3.1.1.html#responses-object',
    tags: 'responses default examples example headers content contract validation status',
    headings: ['Status keys and default', 'Examples in 3.1', 'Response headers', 'Using the document as a test'],
    body: `
<h2>Status keys and default</h2>
<p>Response keys are quoted strings — <code>'200'</code>, not <code>200</code>, since
YAML would otherwise make them integers. Wildcards like <code>'4XX'</code> are
allowed, and <code>default</code> covers anything not otherwise listed. Every
response needs a <code>description</code>; it is the only required field.</p>

<h2>Examples in 3.1</h2>
<p>Two similarly named keywords do different things. <code>example</code> (singular)
is a single free-form value on a media type or schema. <code>examples</code> is a map
of named example objects on a media type — and in 3.1 the <em>schema</em> keyword
<code>examples</code> is an array, inherited from JSON Schema. Mixing them up
produces a document that validates but renders nothing.</p>

<h2>Response headers</h2>
<p>Declare headers the caller depends on, especially the operational ones:</p>
<pre><code>'429':
  description: Rate limit exceeded
  headers:
    Retry-After:
      schema: { type: integer }
      description: Seconds to wait before retrying</code></pre>
<p><code>Content-Type</code> is not declared here — it comes from the
<code>content</code> map keys.</p>

<h2>Using the document as a test</h2>
<p>The practical payoff of an accurate document is that a real response can be
validated against it. Compile the response schema with a JSON Schema 2020-12
validator and check the body you actually received. A mismatch is a finding about the
contract, not a request failure, and it catches the drift that documentation reviews
never do.</p>
`,
  },
];
