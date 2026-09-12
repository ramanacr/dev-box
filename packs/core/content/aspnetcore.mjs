/**
 * ASP.NET Core reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'aspnetcore',
  name: 'ASP.NET Core',
  url: 'https://learn.microsoft.com/aspnet/core/',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to Microsoft Learn; no documentation text is reproduced.',
};

export const documents = [
  {
    id: 'aspnetcore/dependency-injection',
    title: 'Dependency injection and service lifetimes',
    url: 'https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection',
    tags: 'dependency injection DI singleton scoped transient IServiceCollection captive dependency IServiceProvider AddScoped',
    headings: ['Registering services', 'The three lifetimes', 'Captive dependencies', 'Scopes outside a request'],
    body: `
<h2>Registering services</h2>
<p>Services are registered on the builder and resolved by constructor injection:</p>
<pre><code>builder.Services.AddSingleton&lt;IClock, SystemClock&gt;();
builder.Services.AddScoped&lt;IOrderRepository, SqlOrderRepository&gt;();
builder.Services.AddTransient&lt;IEmailFormatter, EmailFormatter&gt;();
builder.Services.AddHttpClient&lt;IPaymentGateway, PaymentGateway&gt;();</code></pre>

<h2>The three lifetimes</h2>
<ul>
<li><strong>Singleton</strong> — one instance for the application's lifetime. Must be
thread-safe, because concurrent requests share it.</li>
<li><strong>Scoped</strong> — one instance per request. The right default for anything
holding per-request state, which is why <code>DbContext</code> is scoped.</li>
<li><strong>Transient</strong> — a new instance every time it is resolved, including
several times within one request. Cheap and stateless things only.</li>
</ul>

<h2>Captive dependencies</h2>
<p>A longer-lived service that depends on a shorter-lived one captures it and keeps it
alive beyond its intended scope. A singleton holding a scoped <code>DbContext</code>
is the canonical bug: the context is never disposed, its change tracker grows, and it
is shared across concurrent requests, which it is not built for.</p>
<p>The development-time provider validates scopes and throws on this, which is why
<code>ValidateScopes</code> should stay on in development. To use a scoped service
from a singleton, inject <code>IServiceScopeFactory</code> and create a scope
explicitly:</p>
<pre><code>using var scope = scopeFactory.CreateScope();
var repo = scope.ServiceProvider.GetRequiredService&lt;IOrderRepository&gt;();</code></pre>

<h2>Scopes outside a request</h2>
<p>A background service is a singleton, so it has no ambient scope. Every unit of work
it performs should create its own scope and dispose it — otherwise a long-running
worker accumulates tracked entities for as long as the process lives.</p>
`,
  },

  {
    id: 'aspnetcore/middleware-pipeline',
    title: 'The middleware pipeline and ordering',
    url: 'https://learn.microsoft.com/aspnet/core/fundamentals/middleware/',
    tags: 'middleware pipeline Use Run Map ordering UseRouting UseAuthentication UseAuthorization short-circuit next',
    headings: ['How it composes', 'Order matters', 'The conventional order', 'Use versus Run'],
    body: `
<h2>How it composes</h2>
<p>Each middleware receives the request, may act on it, then calls the next one — and
gets control back on the way out. So code before <code>await next()</code> runs on the
way in and code after it runs on the way out, which is where response-shaping and
timing belong.</p>
<pre><code>app.Use(async (context, next) =&gt;
{
    var start = Stopwatch.GetTimestamp();
    await next();
    var elapsed = Stopwatch.GetElapsedTime(start);
    logger.LogInformation("{Path} took {Ms}ms",
        context.Request.Path, elapsed.TotalMilliseconds);
});</code></pre>
<p>Note that once the response has started, headers cannot be changed. Setting a
header after <code>await next()</code> usually throws for this reason.</p>

<h2>Order matters</h2>
<p>The pipeline is built in registration order, and mistakes here fail open rather
than loudly. Putting <code>UseAuthorization</code> before
<code>UseAuthentication</code> means there is no identity to authorize yet, so
policies evaluate against an anonymous user. Putting <code>UseCors</code> after
<code>UseResponseCaching</code> can cache a response with the wrong origin header.</p>

<h2>The conventional order</h2>
<pre><code>app.UseExceptionHandler("/error");
app.UseHsts();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();</code></pre>
<p>Exception handling goes first so it can catch everything after it. Static files go
before routing so asset requests never enter it.</p>

<h2>Use versus Run</h2>
<p><code>Use</code> takes a <code>next</code> and may continue the pipeline.
<code>Run</code> is terminal: nothing registered after it will execute. Forgetting to
<code>await next()</code> inside a <code>Use</code> silently turns it into a
<code>Run</code>, and the symptom is an empty 200 response.</p>
`,
  },

  {
    id: 'aspnetcore/minimal-apis',
    title: 'Minimal APIs: routing, binding and results',
    url: 'https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis',
    tags: 'minimal API MapGet MapPost TypedResults IResult route parameter binding FromBody validation filter',
    headings: ['Defining endpoints', 'Parameter binding', 'Returning results', 'Grouping and filters'],
    body: `
<h2>Defining endpoints</h2>
<pre><code>var app = builder.Build();

app.MapGet("/orders/{id:guid}", async (Guid id, IOrderRepository repo) =&gt;
{
    var order = await repo.FindAsync(id);
    return order is null ? Results.NotFound() : Results.Ok(order);
});

app.MapPost("/orders", async (CreateOrder body, IOrderRepository repo) =&gt;
{
    var created = await repo.CreateAsync(body);
    return TypedResults.Created($"/orders/{created.Id}", created);
});</code></pre>
<p>Route constraints such as <code>:guid</code> and <code>:int</code> filter at
routing time, so a malformed id produces a 404 without reaching the handler.</p>

<h2>Parameter binding</h2>
<p>Binding is by convention: a name matching a route parameter comes from the route,
a simple type not in the route comes from the query string, a registered service comes
from DI, and a complex type comes from the JSON body. Only one parameter may come from
the body.</p>
<p><code>[AsParameters]</code> collects several sources into one record, which keeps a
handler signature from growing unmanageable.</p>

<h2>Returning results</h2>
<p><code>TypedResults</code> is preferable to <code>Results</code>: it returns a
concrete type, so the endpoint's response shape is visible to OpenAPI generation and
to tests without reflection. Where a handler returns more than one shape, declare it:
<code>Results&lt;Ok&lt;Order&gt;, NotFound&gt;</code>.</p>

<h2>Grouping and filters</h2>
<p><code>MapGroup</code> shares a prefix and metadata across endpoints, and an endpoint
filter is where cross-cutting concerns belong — validation in particular, since
minimal APIs do not run model validation automatically the way controllers do:</p>
<pre><code>var orders = app.MapGroup("/orders")
    .RequireAuthorization()
    .AddEndpointFilter&lt;ValidationFilter&gt;();</code></pre>
`,
  },

  {
    id: 'aspnetcore/configuration-and-secrets',
    title: 'Configuration, options and secrets',
    url: 'https://learn.microsoft.com/aspnet/core/fundamentals/configuration/',
    tags: 'configuration appsettings environment variables IOptions IOptionsSnapshot user-secrets connection string precedence',
    headings: ['Provider order', 'Environment variable naming', 'The options pattern', 'Secrets'],
    body: `
<h2>Provider order</h2>
<p>Later providers override earlier ones. The default order is:
<code>appsettings.json</code>, then
<code>appsettings.{Environment}.json</code>, then user secrets (in Development),
then environment variables, then command-line arguments.</p>
<p>So an environment variable always beats a file, which is what makes container
configuration work — and also why a stale variable can override the setting you just
edited.</p>

<h2>Environment variable naming</h2>
<p>Nested keys use a double underscore, because a colon is not portable across
shells:</p>
<pre><code>ConnectionStrings__Default=Host=db;Database=app
Logging__LogLevel__Default=Warning</code></pre>

<h2>The options pattern</h2>
<p>Bind a section to a class rather than reading string keys throughout the code, and
validate it at start-up so a misconfiguration fails immediately rather than on first
use:</p>
<pre><code>builder.Services
    .AddOptions&lt;PaymentOptions&gt;()
    .Bind(builder.Configuration.GetSection("Payments"))
    .ValidateDataAnnotations()
    .ValidateOnStart();</code></pre>
<p>Inject <code>IOptions&lt;T&gt;</code> for a value fixed at start-up,
<code>IOptionsSnapshot&lt;T&gt;</code> for one that may change per request, and
<code>IOptionsMonitor&lt;T&gt;</code> in a singleton that must observe changes.
Injecting <code>IOptions</code> into a singleton and expecting reload to work is a
common misunderstanding.</p>

<h2>Secrets</h2>
<p>Never commit a secret to <code>appsettings.json</code>. In development use
<code>dotnet user-secrets</code>, which stores values outside the repository. In
production use the platform's secret store or environment variables injected at run
time.</p>
<p>Be careful what gets logged: a connection string logged at start-up for
"diagnostics" leaks a password into every log sink, and configuration dumps are a
frequent source of that.</p>
`,
  },

  {
    id: 'aspnetcore/async-and-cancellation',
    title: 'Async, cancellation tokens and common pitfalls',
    url: 'https://learn.microsoft.com/aspnet/core/fundamentals/best-practices',
    tags: 'async await CancellationToken Task.Result deadlock sync over async ConfigureAwait thread pool starvation IAsyncEnumerable',
    headings: ['Do not block on async', 'Cancellation tokens', 'async void', 'Parallel work'],
    body: `
<h2>Do not block on async</h2>
<p><code>.Result</code>, <code>.Wait()</code> and <code>GetAwaiter().GetResult()</code>
occupy a thread-pool thread while waiting for work that needs a thread-pool thread.
Under load this starves the pool: throughput collapses and latency spikes, and the
symptom looks like a slow database rather than a blocked pool.</p>
<p>Make the whole path async. If a synchronous API must call async code, that is a
design problem to fix at the boundary rather than paper over.</p>
<p><code>ConfigureAwait(false)</code> is not needed in ASP.NET Core — there is no
synchronization context to return to. It still matters in library code that might run
on a framework that has one.</p>

<h2>Cancellation tokens</h2>
<p>Accept a <code>CancellationToken</code> and pass it down. ASP.NET Core supplies one
tied to the client connection, so when a caller disconnects the work stops instead of
completing for nobody:</p>
<pre><code>app.MapGet("/reports/{id}", async (
    Guid id, IReportService svc, CancellationToken ct) =&gt;
{
    var report = await svc.BuildAsync(id, ct);
    return Results.Ok(report);
});</code></pre>
<p>A token that is accepted and then not passed to the database call is the usual
reason cancellation appears not to work.</p>

<h2>async void</h2>
<p>An <code>async void</code> method cannot be awaited and its exceptions cannot be
caught by the caller — they reach the synchronization context and typically crash the
process. The only legitimate use is an event handler. Return
<code>Task</code> everywhere else.</p>

<h2>Parallel work</h2>
<p>To run independent calls concurrently, start them then await together:</p>
<pre><code>var customerTask = repo.GetCustomerAsync(id, ct);
var ordersTask   = repo.GetOrdersAsync(id, ct);
await Task.WhenAll(customerTask, ordersTask);</code></pre>
<p>Note this does not work with <code>DbContext</code>: it is not thread-safe and
permits one operation at a time, so concurrent queries on one context throw. Use a
scope and context per parallel branch.</p>
`,
  },
];
