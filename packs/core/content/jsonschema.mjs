/**
 * JSON Schema 2020-12 reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'jsonschema',
  name: 'JSON Schema 2020-12',
  url: 'https://json-schema.org/specification',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to the JSON Schema specification; no specification text is reproduced.',
};

export const documents = [
  {
    id: 'jsonschema/types-and-keywords',
    title: 'JSON Schema types and validation keywords',
    url: 'https://json-schema.org/draft/2020-12/json-schema-validation',
    tags: 'type string number integer boolean object array null enum const minimum maximum pattern format',
    headings: ['Types', 'Numbers', 'Strings', 'Enums and constants', 'Keywords only constrain'],
    body: `
<p>A schema is a set of constraints. Anything it does not constrain is allowed —
which is the single most important thing to internalise about JSON Schema.</p>

<h2>Types</h2>
<p><code>type</code> takes a name or an array of names:
<code>{"type": ["string", "null"]}</code>. There are seven: <code>null</code>,
<code>boolean</code>, <code>object</code>, <code>array</code>, <code>number</code>,
<code>string</code> and <code>integer</code>. <code>integer</code> is not a distinct
JSON type — it matches a number with zero fractional part, so <code>1.0</code>
validates.</p>

<h2>Numbers</h2>
<p><code>minimum</code> and <code>maximum</code> are inclusive;
<code>exclusiveMinimum</code> and <code>exclusiveMaximum</code> are numbers in
2020-12, not the booleans they were in draft-04.
<code>multipleOf</code> constrains divisibility, which is how you express "cents".</p>

<h2>Strings</h2>
<p><code>minLength</code> and <code>maxLength</code> count Unicode code points, not
bytes or UTF-16 units. <code>pattern</code> is an unanchored regular expression, so
<code>"pattern": "[0-9]+"</code> matches <code>"abc123"</code> — anchor it with
<code>^</code> and <code>$</code> if you meant the whole string.</p>
<p><code>format</code> (<code>date-time</code>, <code>email</code>,
<code>uuid</code>, <code>uri</code>) is <strong>annotation by default</strong>. Most
validators do not enforce it unless configured to. Never rely on
<code>format</code> alone for a security-relevant constraint.</p>

<h2>Enums and constants</h2>
<p><code>enum</code> lists allowed values of any type; <code>const</code> is the
single-value shorthand. Both compare by JSON equality, so <code>1</code> and
<code>1.0</code> are the same value and <code>"1"</code> is not.</p>

<h2>Keywords only constrain</h2>
<p>An empty schema <code>{}</code> accepts everything. <code>true</code> accepts
everything and <code>false</code> rejects everything. A schema with only
<code>"properties"</code> and no <code>"required"</code> accepts an empty object — a
mistake that lets an API accept requests with nothing in them.</p>
`,
  },

  {
    id: 'jsonschema/objects-and-required',
    title: 'Objects, required properties and additionalProperties',
    url: 'https://json-schema.org/draft/2020-12/json-schema-validation#name-validation-keywords-for-obj',
    tags: 'properties required additionalProperties patternProperties minProperties unevaluatedProperties strict',
    headings: ['properties and required are independent', 'Rejecting unknown fields', 'patternProperties', 'unevaluatedProperties'],
    body: `
<h2>properties and required are independent</h2>
<p><code>properties</code> says what a field must look like <em>if present</em>.
<code>required</code> says which must be present. Listing a property does not make it
required, and requiring one does not describe it.</p>
<pre><code>{
  "type": "object",
  "properties": {
    "id":    { "type": "string" },
    "email": { "type": "string", "format": "email" }
  },
  "required": ["id"]
}</code></pre>
<p>Here <code>{"id": "x"}</code> is valid, and so is
<code>{"id": "x", "anything": 1}</code>.</p>

<h2>Rejecting unknown fields</h2>
<p><code>"additionalProperties": false</code> rejects any property not named in
<code>properties</code> or matched by <code>patternProperties</code>. This is
essential for request validation — without it a typo in a client field name is
silently ignored rather than reported.</p>
<p>It also interacts badly with <code>allOf</code>: <code>additionalProperties</code>
only sees the <code>properties</code> in <em>its own</em> schema object, so combining
two schemas with <code>allOf</code> and setting
<code>additionalProperties: false</code> in one of them rejects the other's fields.
This is the most common source of "my valid object fails validation".</p>

<h2>patternProperties</h2>
<p>Constrains properties whose names match a regular expression, which is how you
describe a map:</p>
<pre><code>{
  "type": "object",
  "patternProperties": { "^[a-z-]+$": { "type": "string" } },
  "additionalProperties": false
}</code></pre>

<h2>unevaluatedProperties</h2>
<p>New in 2019-09 and the fix for the <code>allOf</code> problem above.
<code>unevaluatedProperties: false</code> is evaluated after all applicators have run,
so it rejects genuinely unknown fields while accepting everything any subschema
described.</p>
`,
  },

  {
    id: 'jsonschema/composition',
    title: 'Composition: allOf, anyOf, oneOf, not and conditionals',
    url: 'https://json-schema.org/draft/2020-12/json-schema-core#name-keywords-for-applying-subsc',
    tags: 'allOf anyOf oneOf not if then else dependentSchemas dependentRequired composition',
    headings: ['The four combinators', 'oneOf versus anyOf', 'Conditionals', 'Dependent keywords'],
    body: `
<h2>The four combinators</h2>
<ul>
<li><code>allOf</code> — every subschema must validate. Intersection.</li>
<li><code>anyOf</code> — at least one must validate.</li>
<li><code>oneOf</code> — exactly one must validate.</li>
<li><code>not</code> — the subschema must <em>not</em> validate.</li>
</ul>

<h2>oneOf versus anyOf</h2>
<p><code>oneOf</code> is stricter and produces worse error messages, because a value
matching two branches fails with "matched more than one" rather than anything
actionable. It is also easy to make accidentally unsatisfiable: two branches that both
accept an object with extra fields allowed will both match, so <code>oneOf</code>
fails on valid data. Use <code>anyOf</code> unless the branches are genuinely
mutually exclusive, and make them so with a discriminating <code>const</code>:</p>
<pre><code>{
  "oneOf": [
    { "properties": { "kind": { "const": "card" }, "pan":  { "type": "string" } },
      "required": ["kind", "pan"] },
    { "properties": { "kind": { "const": "bank" }, "iban": { "type": "string" } },
      "required": ["kind", "iban"] }
  ]
}</code></pre>

<h2>Conditionals</h2>
<p><code>if</code> / <code>then</code> / <code>else</code> apply a schema based on
whether another one validates. Note that <code>if</code> alone does nothing — it is
not an assertion, only a condition:</p>
<pre><code>{
  "if":   { "properties": { "type": { "const": "shipped" } }, "required": ["type"] },
  "then": { "required": ["trackingNumber"] }
}</code></pre>

<h2>Dependent keywords</h2>
<p><code>dependentRequired</code> makes a property mandatory when another is present —
"if you gave a card number, you must also give an expiry".
<code>dependentSchemas</code> applies a whole schema on the same condition. Both are
clearer than the equivalent <code>if</code>/<code>then</code>.</p>
`,
  },

  {
    id: 'jsonschema/refs-and-ids',
    title: '$ref, $id, $defs and schema resolution',
    url: 'https://json-schema.org/draft/2020-12/json-schema-core#name-schema-references',
    tags: '$ref $id $defs $anchor $dynamicRef definitions recursive base URI resolution',
    headings: ['$defs and $ref', '$id and base URIs', 'Recursion', 'Why remote refs are dangerous'],
    body: `
<h2>$defs and $ref</h2>
<p>Reusable subschemas live under <code>$defs</code> (renamed from
<code>definitions</code>, which still works in most validators):</p>
<pre><code>{
  "$defs": {
    "money": {
      "type": "object",
      "properties": {
        "amount":   { "type": "integer" },
        "currency": { "type": "string", "pattern": "^[A-Z]{3}$" }
      },
      "required": ["amount", "currency"]
    }
  },
  "properties": { "total": { "$ref": "#/$defs/money" } }
}</code></pre>
<p>In 2020-12 <code>$ref</code> may have siblings, so
<code>{"$ref": "#/$defs/money", "description": "..."}</code> is legal — it was not in
older drafts, where siblings were ignored.</p>

<h2>$id and base URIs</h2>
<p><code>$id</code> sets the schema's identity and the base for resolving relative
references inside it. Nested <code>$id</code> values create new base URIs, which is
powerful and a frequent source of confusion; <code>$anchor</code> is usually the
clearer way to name a location within one schema.</p>

<h2>Recursion</h2>
<p>A schema may reference itself, which is how trees are described:</p>
<pre><code>{
  "$id": "https://example.com/node",
  "type": "object",
  "properties": {
    "value":    { "type": "string" },
    "children": { "type": "array", "items": { "$ref": "#" } }
  }
}</code></pre>
<p><code>$dynamicRef</code> and <code>$dynamicAnchor</code> handle the harder case
where a recursive reference should resolve against an <em>extending</em> schema rather
than the one it was written in.</p>

<h2>Why remote refs are dangerous</h2>
<p>Resolving a <code>$ref</code> to an <code>http://</code> URL makes the validator
issue a request. Against untrusted input that is a request-forgery primitive, and it
also makes validation depend on network availability. Disable schema loading in any
validator that sees user-supplied schemas — in Ajv that means not configuring
<code>loadSchema</code> and compiling only the schema you already hold.</p>
`,
  },

  {
    id: 'jsonschema/inference-limits',
    title: 'Inferring a schema from a sample, and what it cannot tell you',
    url: 'https://json-schema.org/understanding-json-schema/',
    tags: 'infer inference generate sample nullable optional required union widening',
    headings: ['What inference can see', 'What it cannot see', 'Reading an inferred schema'],
    body: `
<p>Generating a schema from example data is a useful starting point and a poor
finishing point. It is worth being explicit about the boundary.</p>

<h2>What inference can see</h2>
<p>From a set of samples an inferrer can establish the shape: which properties occur,
their types, nesting, and array element types. Given several samples it can also
infer optionality (a property absent from one sample is not required) and widening (a
property that is a string in one sample and null in another is nullable).</p>

<h2>What it cannot see</h2>
<ul>
<li><strong>Constraints.</strong> That a string is an email, that an integer is
non-negative, that an array must be non-empty. None of this is visible in a value
that happens to satisfy it.</li>
<li><strong>Rare branches.</strong> A field that is an object in 1% of records and a
string in the rest will be inferred as an object, and the schema will reject real
data in production.</li>
<li><strong>Required-ness, from one sample.</strong> With a single example every
property looks required, which is almost never true.</li>
<li><strong>Meaning.</strong> An integer that is a Unix timestamp and an integer that
is a count are indistinguishable.</li>
</ul>

<h2>Reading an inferred schema</h2>
<p>Treat it as a draft to edit: add <code>required</code> deliberately rather than
accepting what the sample implied, add <code>additionalProperties: false</code> if
you want typos reported, and add the range and pattern constraints that the data
cannot reveal. The value of inference is saving the typing, not the thinking.</p>
`,
  },
];
