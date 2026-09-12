/**
 * Angular reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'angular',
  name: 'Angular',
  url: 'https://angular.dev/',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to the Angular documentation; no documentation text is reproduced.',
};

export const documents = [
  {
    id: 'angular/standalone-components',
    title: 'Standalone components and imports',
    url: 'https://angular.dev/guide/components/importing',
    tags: 'standalone component NgModule imports bootstrapApplication providers directive pipe',
    headings: ['A standalone component', 'imports replaces NgModule declarations', 'Bootstrapping', 'Migrating'],
    body: `
<h2>A standalone component</h2>
<pre><code>@Component({
  selector: 'app-order-list',
  imports: [RouterLink, DatePipe],
  template: \`
    &#64;for (order of orders(); track order.id) {
      &lt;a [routerLink]="['/orders', order.id]"&gt;
        {{ order.createdAt | date }}
      &lt;/a&gt;
    }
  \`,
})
export class OrderListComponent { }</code></pre>
<p><code>standalone: true</code> is the default from Angular 19 onwards, so the flag
no longer needs writing.</p>

<h2>imports replaces NgModule declarations</h2>
<p>A standalone component declares its own dependencies. Every directive, pipe and
component used in the template must appear in <code>imports</code> — there is no
ambient module scope supplying them.</p>
<p>This is the most common early error: a template using
<code>routerLink</code> or a pipe silently does nothing, or fails to compile, because
the import is missing. Unlike an <code>NgModule</code>, nothing is inherited.</p>

<h2>Bootstrapping</h2>
<pre><code>bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
});</code></pre>
<p>The <code>provide*</code> functions replace the corresponding
<code>forRoot()</code> module calls and are tree-shakeable — an unused feature is not
bundled.</p>

<h2>Migrating</h2>
<p>Standalone components and <code>NgModule</code>s interoperate: a module can import
a standalone component, and a standalone component can import a module. So migration
is incremental rather than a rewrite, and <code>ng generate @angular/core:standalone</code>
automates most of it.</p>
`,
  },

  {
    id: 'angular/signals',
    title: 'Signals: state, computed and effects',
    url: 'https://angular.dev/guide/signals',
    tags: 'signal computed effect writable set update linkedSignal reactivity glitch-free untracked',
    headings: ['Writable signals', 'computed', 'effect', 'Why signals instead of zone change detection'],
    body: `
<h2>Writable signals</h2>
<pre><code>const count = signal(0);

count();            // read — 0
count.set(5);       // replace
count.update(n =&gt; n + 1);   // derive from current</code></pre>
<p>Reading is a function call, which is what lets the framework track who depends on
what. In a template, <code>{{ count() }}</code>.</p>
<p>A signal holding an object compares by reference by default, so mutating the object
in place does not notify anything. Replace it, or supply an
<code>equal</code> comparator.</p>

<h2>computed</h2>
<pre><code>const items = signal&lt;Item[]&gt;([]);
const total = computed(() =&gt; items().reduce((s, i) =&gt; s + i.price, 0));</code></pre>
<p>A computed is lazy and memoised: it recomputes only when read and only if a
dependency actually changed. Dependencies are tracked dynamically, so a branch not
taken creates no dependency.</p>
<p>A computed must be pure. It cannot be set, and doing work with side effects inside
one produces behaviour that depends on whether anything happened to read it.</p>

<h2>effect</h2>
<pre><code>effect(() =&gt; {
  console.log('count is', count());
});</code></pre>
<p>An effect runs when its dependencies change, and is for synchronising with
something outside the reactive graph — logging, a third-party library, local storage.
It is <em>not</em> for deriving state: writing to a signal from an effect is how
loops and ordering problems appear. Use <code>computed</code>, or
<code>linkedSignal</code> where a value is derived but also locally writable.</p>
<p>An effect created in an injection context is cleaned up with its component;
one created outside needs manual destruction.</p>

<h2>Why signals instead of zone change detection</h2>
<p>Zone.js patches async APIs and, when anything completes, checks the whole component
tree. It works without any annotation, and it does far more work than necessary.
Signals tell the framework exactly which views depend on which state, so only those
are re-rendered — which is what makes a zoneless application possible.</p>
`,
  },

  {
    id: 'angular/change-detection',
    title: 'Change detection: OnPush, zoneless and markForCheck',
    url: 'https://angular.dev/best-practices/skipping-subtrees',
    tags: 'change detection OnPush Default markForCheck detectChanges zoneless Zone.js async pipe signal',
    headings: ['Default versus OnPush', 'What marks an OnPush component dirty', 'Zoneless', 'Debugging a view that will not update'],
    body: `
<h2>Default versus OnPush</h2>
<p>With <code>Default</code>, any change-detection pass checks every binding in the
component. With <code>OnPush</code>, a component is checked only when something marks
it dirty — so an unaffected subtree is skipped entirely.</p>
<pre><code>@Component({
  selector: 'app-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '{{ item().name }}',
})</code></pre>

<h2>What marks an OnPush component dirty</h2>
<ul>
<li>An input reference changes. A mutated object with the same reference does not
count, which is the usual surprise.</li>
<li>An event fires from the component's own template.</li>
<li>An <code>async</code> pipe in its template emits.</li>
<li>A signal read in its template changes.</li>
<li><code>ChangeDetectorRef.markForCheck()</code> is called explicitly.</li>
</ul>
<p>Notably <em>not</em> a field mutated from a <code>setTimeout</code> or a
subscription callback. That is the classic "my value changed but the view did not"
bug, and the fix is a signal, the <code>async</code> pipe, or
<code>markForCheck</code>.</p>
<p><code>markForCheck</code> marks the path to the root dirty for the next pass;
<code>detectChanges</code> runs a pass synchronously on that view now. Prefer the
former — the latter re-entrantly runs change detection and is easy to misuse.</p>

<h2>Zoneless</h2>
<p><code>provideZonelessChangeDetection()</code> removes Zone.js entirely. The
application then updates only in response to signals, the <code>async</code> pipe and
explicit marking. Bundle size drops and stack traces stop passing through zone
frames.</p>
<p>The prerequisite is that no component relies on a mutation being noticed
incidentally. Migrating to signals first, then removing the zone, is the order that
works.</p>

<h2>Debugging a view that will not update</h2>
<p>Check in this order: is the component <code>OnPush</code>; did the input reference
actually change or was the object mutated; is the value read in the template as a
signal call rather than captured once; and is the update happening inside a callback
the framework never learns about.</p>
`,
  },

  {
    id: 'angular/dependency-injection',
    title: 'Angular dependency injection and inject()',
    url: 'https://angular.dev/guide/di',
    tags: 'inject providers providedIn root injector InjectionToken hierarchical injection context constructor',
    headings: ['inject() versus constructor injection', 'providedIn root', 'Injection tokens', 'Hierarchical injectors', 'Injection context'],
    body: `
<h2>inject() versus constructor injection</h2>
<pre><code>export class OrderService {
  private http = inject(HttpClient);
  private logger = inject(Logger);
}</code></pre>
<p>Equivalent to constructor parameters, and preferable in most new code: it composes
with inheritance without re-declaring parameters, works in functional guards,
resolvers and interceptors, and allows local helper functions that inject their own
dependencies.</p>

<h2>providedIn root</h2>
<pre><code>@Injectable({ providedIn: 'root' })
export class OrderService { }</code></pre>
<p>One instance for the application, and tree-shakeable: if nothing injects it, it is
removed from the bundle. A service listed in a <code>providers</code> array is always
bundled, because the array references it.</p>

<h2>Injection tokens</h2>
<p>An interface does not exist at run time, so it cannot be a DI key. Use a token:</p>
<pre><code>export const API_BASE_URL = new InjectionToken&lt;string&gt;('API_BASE_URL', {
  providedIn: 'root',
  factory: () =&gt; '/api',
});</code></pre>
<p>The factory gives a default, so consumers work without explicit configuration.</p>

<h2>Hierarchical injectors</h2>
<p>Resolution walks up from the component that asked, through its ancestors, to the
root. Providing a service on a component gives that subtree its own instance — useful
for per-feature state, and a source of confusion when two parts of the application
unexpectedly hold different instances of what looked like a singleton.</p>

<h2>Injection context</h2>
<p><code>inject()</code> works only during construction — in a field initialiser, a
constructor, a factory, or inside <code>runInInjectionContext</code>. Calling it from
a lifecycle hook or an event handler throws. Assign it to a field at construction
time and use the field later.</p>
`,
  },

  {
    id: 'angular/http-and-interceptors',
    title: 'HttpClient, interceptors and error handling',
    url: 'https://angular.dev/guide/http',
    tags: 'HttpClient provideHttpClient interceptor HttpInterceptorFn catchError retry observable subscribe unsubscribe takeUntilDestroyed',
    headings: ['Requests are cold observables', 'Functional interceptors', 'Error handling', 'Unsubscribing'],
    body: `
<h2>Requests are cold observables</h2>
<p>Calling <code>http.get()</code> sends nothing. The request is issued on
subscription, and issued <em>again</em> for each subscriber — so two
<code>subscribe</code> calls on one observable make two HTTP requests. Share it with
<code>shareReplay</code> if several consumers need one result, or use the
<code>async</code> pipe once.</p>
<p>Because they complete after one value, HTTP observables do not strictly need
unsubscribing — but see below.</p>

<h2>Functional interceptors</h2>
<pre><code>export const authInterceptor: HttpInterceptorFn = (req, next) =&gt; {
  const token = inject(AuthService).token();
  if (!token) return next(req);

  return next(req.clone({
    setHeaders: { Authorization: \`Bearer \${token}\` },
  }));
};

provideHttpClient(withInterceptors([authInterceptor]));</code></pre>
<p><code>HttpRequest</code> is immutable, so a header is added by cloning. Mutating
<code>req.headers</code> directly does nothing.</p>
<p>Be careful what an auth interceptor attaches to: adding a bearer token to every
request sends your credential to any third-party host the application happens to call.
Check the URL before attaching.</p>

<h2>Error handling</h2>
<pre><code>this.http.get&lt;Order&gt;(url).pipe(
  retry({ count: 2, delay: 500 }),
  catchError((err: HttpErrorResponse) =&gt; {
    if (err.status === 404) return of(null);
    return throwError(() =&gt; new Error('Could not load the order.'));
  }),
);</code></pre>
<p>A non-2xx response arrives as an error, not a value. Retrying blindly is unsafe for
anything non-idempotent — a retried <code>POST</code> may create two records.</p>

<h2>Unsubscribing</h2>
<p>For long-lived streams, tie the subscription to the component's lifetime:</p>
<pre><code>private destroyRef = inject(DestroyRef);

ngOnInit() {
  this.events$.pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(e =&gt; this.handle(e));
}</code></pre>
<p>Better still, avoid manual subscription: the <code>async</code> pipe or
<code>toSignal()</code> handles teardown for you, and a leaked subscription that keeps
a destroyed component's closure alive is a common memory leak.</p>
`,
  },
];
