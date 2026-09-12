/**
 * HTTP reference.
 *
 * Original content authored for Developer Toolbox. The `url` on each document is a
 * canonical upstream reference a reader can follow for the full specification —
 * linking to a specification is not redistribution of it.
 */

export const source = {
  id: 'http',
  name: 'HTTP',
  url: 'https://www.rfc-editor.org/rfc/rfc9110.html',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to RFC 9110 and related specifications; no specification text is reproduced.',
};

export const documents = [
  {
    id: 'http/status-codes',
    title: 'HTTP status codes: choosing the right one',
    url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-15',
    tags: '200 201 202 204 301 302 303 304 307 308 400 401 403 404 405 409 410 412 415 422 429 500 502 503 504 status code',
    headings: ['Success', 'Redirection', 'Client error', 'Server error', 'The ones people get wrong'],
    body: `
<p>A status code is the first thing a client branches on, so picking the wrong one
makes correct client behaviour impossible. The class matters most: <code>2xx</code>
worked, <code>3xx</code> go elsewhere, <code>4xx</code> the caller must change
something, <code>5xx</code> the server must.</p>

<h2>Success</h2>
<ul>
<li><strong>200 OK</strong> — the default. The response carries the result.</li>
<li><strong>201 Created</strong> — a new resource exists. Include a
<code>Location</code> header pointing at it.</li>
<li><strong>202 Accepted</strong> — queued, not done. Only honest if the caller can
later discover the outcome.</li>
<li><strong>204 No Content</strong> — success with nothing to return. A
<code>204</code> must not have a body; some clients will error if it does.</li>
</ul>

<h2>Redirection</h2>
<ul>
<li><strong>301</strong> permanent, <strong>308</strong> permanent preserving the
method. Caches and browsers may remember a <code>301</code> indefinitely, so do not
use it while you are still deciding.</li>
<li><strong>302</strong> and <strong>303</strong> are temporary.
<strong>303</strong> explicitly tells the client to switch to <code>GET</code>, which
is what you want after a successful <code>POST</code>.</li>
<li><strong>307</strong> temporary, preserving the method and body.</li>
<li><strong>304 Not Modified</strong> answers a conditional request. It carries no
body: the client already has it.</li>
</ul>

<h2>Client error</h2>
<ul>
<li><strong>400</strong> — malformed. The request could not be understood.</li>
<li><strong>401 Unauthorized</strong> — actually means unauthenticated. Must include
a <code>WWW-Authenticate</code> header.</li>
<li><strong>403 Forbidden</strong> — authenticated but not permitted. Retrying with
the same credentials will not help.</li>
<li><strong>404</strong> — not found, and also the right answer when you do not want
to admit a resource exists to this caller.</li>
<li><strong>405</strong> — wrong method for a URL that does exist. Must include
<code>Allow</code>.</li>
<li><strong>409 Conflict</strong> — the request conflicts with current state, such as
a duplicate unique key.</li>
<li><strong>412 Precondition Failed</strong> — an <code>If-Match</code> or
<code>If-Unmodified-Since</code> condition did not hold. This is how you implement
optimistic concurrency.</li>
<li><strong>415</strong> — unsupported <code>Content-Type</code>.</li>
<li><strong>422</strong> — syntactically valid but semantically wrong. Widely used for
validation failures, though <code>400</code> is also defensible.</li>
<li><strong>429 Too Many Requests</strong> — rate limited. Include
<code>Retry-After</code> or the caller can only guess.</li>
</ul>

<h2>Server error</h2>
<ul>
<li><strong>500</strong> — an unhandled fault. Never leak a stack trace in the body.</li>
<li><strong>502</strong> — an upstream returned something invalid.</li>
<li><strong>503</strong> — temporarily unavailable; include <code>Retry-After</code>.</li>
<li><strong>504</strong> — an upstream did not answer in time.</li>
</ul>

<h2>The ones people get wrong</h2>
<p>Returning <code>200</code> with <code>{"error": ...}</code> in the body defeats
every generic client, proxy and monitoring tool, all of which branch on the status.
Returning <code>401</code> when you mean <code>403</code> makes clients retry
authentication pointlessly. Returning <code>500</code> for a validation failure turns
a caller's bug into your on-call page.</p>
`,
  },

  {
    id: 'http/methods-and-idempotence',
    title: 'HTTP methods, safety and idempotence',
    url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-9',
    tags: 'GET POST PUT PATCH DELETE HEAD OPTIONS idempotent safe method retry',
    headings: ['Safe methods', 'Idempotent methods', 'PUT versus PATCH', 'Why it matters for retries'],
    body: `
<p>Two properties govern how a method may be treated by clients, caches and proxies.</p>

<h2>Safe methods</h2>
<p><code>GET</code>, <code>HEAD</code> and <code>OPTIONS</code> are <em>safe</em>: they
are read-only from the client's point of view. Anything may prefetch them. Putting a
state change behind a <code>GET</code> means a crawler, a link preview or a browser
prefetch can trigger it.</p>

<h2>Idempotent methods</h2>
<p>An <em>idempotent</em> method has the same effect whether applied once or many
times. <code>GET</code>, <code>HEAD</code>, <code>OPTIONS</code>, <code>PUT</code> and
<code>DELETE</code> are idempotent. <code>POST</code> and <code>PATCH</code> are
not.</p>
<p>Idempotent is not the same as safe: <code>DELETE</code> changes state, but deleting
twice leaves the same state as deleting once.</p>

<h2>PUT versus PATCH</h2>
<p><code>PUT</code> replaces the resource with the body you send. Any field you omit
is <em>removed</em> — this is the single most common API mistake, because clients
routinely send a partial object and are surprised when fields vanish.</p>
<p><code>PATCH</code> applies a partial modification. The body is a description of
changes, not a resource, which is why <code>PATCH</code> is not idempotent in general:
"increment by one" applied twice differs from applied once.</p>

<h2>Why it matters for retries</h2>
<p>A client that times out does not know whether the server processed the request. It
can safely retry an idempotent method. It cannot safely retry a <code>POST</code> —
which is why payment and order APIs accept an idempotency key, giving the caller a way
to make a non-idempotent operation safe to repeat.</p>
`,
  },

  {
    id: 'http/caching',
    title: 'HTTP caching: Cache-Control, ETag and revalidation',
    url: 'https://www.rfc-editor.org/rfc/rfc9111.html',
    tags: 'Cache-Control ETag If-None-Match max-age no-store no-cache immutable stale-while-revalidate 304 Last-Modified',
    headings: ['Cache-Control directives', 'Validators', 'Conditional requests', 'A practical policy'],
    body: `
<p>Caching is the cheapest performance work available, and the easiest to get subtly
wrong.</p>

<h2>Cache-Control directives</h2>
<ul>
<li><code>max-age=N</code> — fresh for N seconds.</li>
<li><code>no-cache</code> — may be stored, but must be revalidated before reuse. It
does <em>not</em> mean "do not cache".</li>
<li><code>no-store</code> — must not be written to any cache. This is the one for
sensitive responses.</li>
<li><code>private</code> — a browser may cache it, a shared proxy may not.</li>
<li><code>public</code> — cacheable even when the request was authenticated.</li>
<li><code>immutable</code> — the content will never change at this URL, so do not
revalidate even on reload. Correct only for fingerprinted assets.</li>
<li><code>stale-while-revalidate=N</code> — serve stale for up to N seconds while
fetching a fresh copy in the background.</li>
</ul>

<h2>Validators</h2>
<p>An <code>ETag</code> is an opaque version identifier for a representation. A
<code>Last-Modified</code> date is a weaker alternative with one-second granularity.
Prefer <code>ETag</code>: it works for content that changes more than once a second
and for content whose modification time is not meaningful.</p>

<h2>Conditional requests</h2>
<p>A client holding an <code>ETag</code> sends <code>If-None-Match</code>. If the tag
still matches, the server answers <code>304 Not Modified</code> with no body, saving
the transfer but not the round trip.</p>
<p>The same mechanism prevents lost updates: send <code>If-Match</code> with a write,
and the server answers <code>412 Precondition Failed</code> if someone else changed
the resource first.</p>

<h2>A practical policy</h2>
<p>Fingerprinted static assets: <code>max-age=31536000, immutable</code>. HTML and
API responses that must reflect current state: <code>no-store</code>, or
<code>no-cache</code> plus an <code>ETag</code> so revalidation is cheap. Anything
carrying credentials or personal data: <code>no-store</code>, always.</p>
`,
  },

  {
    id: 'http/cors',
    title: 'CORS: what the browser actually enforces',
    url: 'https://fetch.spec.whatwg.org/#http-cors-protocol',
    tags: 'CORS preflight OPTIONS Access-Control-Allow-Origin credentials same-origin wildcard',
    headings: ['What CORS is not', 'Simple versus preflighted requests', 'Credentials', 'Common failures'],
    body: `
<p>CORS relaxes the same-origin policy. It is enforced by the browser, on the
response, after the request has usually already reached your server.</p>

<h2>What CORS is not</h2>
<p>CORS is not server-side access control. A CORS failure stops the <em>page</em> from
reading the response; it does not stop the request from arriving and taking effect.
Anything that must be forbidden has to be forbidden by authentication and
authorization. <code>curl</code> ignores CORS entirely.</p>

<h2>Simple versus preflighted requests</h2>
<p>A request avoids a preflight only if it uses <code>GET</code>, <code>HEAD</code> or
<code>POST</code>, carries no custom headers, and uses one of three content types:
<code>text/plain</code>, <code>application/x-www-form-urlencoded</code> or
<code>multipart/form-data</code>.</p>
<p>Anything else — including the <code>application/json</code> that nearly every API
uses, and any <code>Authorization</code> header — triggers an <code>OPTIONS</code>
preflight first. The server must answer it with
<code>Access-Control-Allow-Methods</code> and
<code>Access-Control-Allow-Headers</code>.</p>

<h2>Credentials</h2>
<p>When a request carries cookies or uses <code>credentials: 'include'</code>, the
response must set <code>Access-Control-Allow-Credentials: true</code> <em>and</em>
name a specific origin. A wildcard <code>Access-Control-Allow-Origin: *</code> is
rejected with credentials — deliberately, since it would let any site read
authenticated responses.</p>

<h2>Common failures</h2>
<ul>
<li>The preflight is not handled, so the real request never happens. Check for an
<code>OPTIONS</code> route.</li>
<li>A header the client sends is missing from
<code>Access-Control-Allow-Headers</code>. The list is not automatic.</li>
<li>The client reads a custom response header that is not in
<code>Access-Control-Expose-Headers</code>, and sees <code>null</code>.</li>
<li>A redirect in the middle of a CORS request, which most browsers refuse.</li>
</ul>
`,
  },

  {
    id: 'http/content-negotiation',
    title: 'Content negotiation and Content-Type',
    url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-12',
    tags: 'Accept Content-Type charset q-value Vary 406 415 media type',
    headings: ['Accept and quality values', 'Content-Type on requests', 'Vary', 'Charset'],
    body: `
<h2>Accept and quality values</h2>
<p>A client states preferences with <code>Accept</code>, optionally weighted with
q-values: <code>Accept: application/json;q=1.0, text/plain;q=0.5</code>. The server
picks one and states its choice in <code>Content-Type</code>. If it can satisfy none
of them, <code>406 Not Acceptable</code> is the honest answer — though returning your
default representation is common and usually kinder.</p>

<h2>Content-Type on requests</h2>
<p><code>Content-Type</code> describes the body being sent, so it belongs on requests
with bodies and on responses. Sending JSON without it means the server is guessing.
If the server cannot handle the type it should answer <code>415 Unsupported Media
Type</code>, not <code>400</code>.</p>

<h2>Vary</h2>
<p>If a response differs depending on a request header, that header must be listed in
<code>Vary</code>, or a shared cache will serve one client's representation to
another. <code>Vary: Accept-Encoding</code> is near-universal;
<code>Vary: Authorization</code> matters any time responses are user-specific and
cacheable.</p>

<h2>Charset</h2>
<p><code>application/json</code> is always UTF-8 by specification, so a charset
parameter is redundant there. For <code>text/*</code> types it is not: omit it and a
browser may guess, which is how mojibake happens.</p>
`,
  },

  {
    id: 'http/authentication-headers',
    title: 'Authorization, Bearer tokens and WWW-Authenticate',
    url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-11',
    tags: 'Authorization Bearer Basic WWW-Authenticate 401 403 token scheme',
    headings: ['The Authorization header', 'Bearer tokens', '401 versus 403', 'What not to do'],
    body: `
<h2>The Authorization header</h2>
<p>The format is a scheme followed by credentials:
<code>Authorization: &lt;scheme&gt; &lt;credentials&gt;</code>. The scheme is
case-insensitive; the credentials format is defined by the scheme.</p>

<h2>Bearer tokens</h2>
<p><code>Authorization: Bearer &lt;token&gt;</code> means exactly what it says: mere
possession of the token grants access. There is no proof the holder is the party it
was issued to. That makes transport security non-optional and makes token lifetime
the primary control — a leaked bearer token is usable by anyone until it expires or is
revoked.</p>
<p><code>Basic</code> carries base64 of <code>user:password</code>. Base64 is not
encryption; it is an encoding with no secrecy property whatsoever.</p>

<h2>401 versus 403</h2>
<p><code>401</code> means "I do not know who you are" and must carry a
<code>WWW-Authenticate</code> header telling the client how to authenticate.
<code>403</code> means "I know who you are and the answer is no" — the client should
not retry with the same credentials. Conflating them makes clients loop.</p>

<h2>What not to do</h2>
<p>Never put a token in a query string: URLs are logged by servers, proxies and
browser history, and are sent in <code>Referer</code> headers. Never log the
<code>Authorization</code> header. Strip it on redirect to another origin — some HTTP
clients forward it by default, which leaks the credential to whoever controls the
redirect target.</p>
`,
  },
];
