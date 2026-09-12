/**
 * SQL reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'sql',
  name: 'SQL',
  url: 'https://www.iso.org/standard/76583.html',
  license: 'MIT',
  attribution: 'Original reference content authored for Developer Toolbox.',
};

export const documents = [
  {
    id: 'sql/joins',
    title: 'Joins: inner, left, right, full and cross',
    url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html',
    tags: 'join inner left outer right full cross lateral on using semi anti exists',
    headings: ['The five kinds', 'ON versus WHERE on an outer join', 'Semi and anti joins', 'Row multiplication'],
    body: `
<h2>The five kinds</h2>
<ul>
<li><code>INNER JOIN</code> — rows with a match on both sides.</li>
<li><code>LEFT JOIN</code> — all left rows; right columns are <code>NULL</code> where
there is no match.</li>
<li><code>RIGHT JOIN</code> — the mirror image. Rare in practice, because reordering
the tables and using <code>LEFT</code> reads better.</li>
<li><code>FULL JOIN</code> — all rows from both sides.</li>
<li><code>CROSS JOIN</code> — every combination. A comma join with no
<code>WHERE</code> is the same thing, usually by accident.</li>
</ul>

<h2>ON versus WHERE on an outer join</h2>
<p>On an inner join these are interchangeable. On an outer join they are not, and the
difference silently changes the result:</p>
<pre><code>-- All customers, with their open orders if any
SELECT c.id, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'open';

-- Only customers who HAVE an open order: the WHERE discards
-- the NULL-extended rows the LEFT JOIN just produced.
SELECT c.id, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'open';</code></pre>
<p>A predicate on the outer table belongs in <code>ON</code>. The second query is a
<code>LEFT JOIN</code> that behaves as an inner one.</p>

<h2>Semi and anti joins</h2>
<p>To ask "does a related row exist" without multiplying rows or selecting from the
other table, use <code>EXISTS</code>:</p>
<pre><code>SELECT c.id FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

SELECT c.id FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);</code></pre>
<p>Prefer <code>NOT EXISTS</code> over <code>NOT IN</code>: if the subquery returns a
single <code>NULL</code>, <code>NOT IN</code> yields no rows at all, because
<code>x NOT IN (NULL)</code> is unknown rather than true. This is a genuine
wrong-results bug, not a style preference.</p>

<h2>Row multiplication</h2>
<p>A join produces one row per matching pair. Joining a customer to their three orders
gives three rows, so a <code>SUM</code> over a customer column now triple-counts. When
aggregating across a join, aggregate the detail first in a subquery or CTE, then
join.</p>
`,
  },

  {
    id: 'sql/indexes',
    title: 'Indexes: what they help, and what they cannot',
    url: 'https://use-the-index-luke.com/',
    tags: 'index b-tree composite covering selectivity leading column sargable EXPLAIN partial index',
    headings: ['How a B-tree index is used', 'Column order in a composite index', 'Making a predicate usable', 'Covering indexes', 'The cost'],
    body: `
<h2>How a B-tree index is used</h2>
<p>An index is a sorted structure. It helps when the database can narrow a range
within that order: equality, ranges, prefix matches, and <code>ORDER BY</code> in the
indexed order. It cannot help a predicate that must look at every row to decide.</p>

<h2>Column order in a composite index</h2>
<p>An index on <code>(a, b, c)</code> is sorted by <code>a</code>, then <code>b</code>
within equal <code>a</code>, and so on. So it serves:</p>
<ul>
<li><code>WHERE a = ?</code></li>
<li><code>WHERE a = ? AND b = ?</code></li>
<li><code>WHERE a = ? AND b = ? AND c = ?</code></li>
<li><code>WHERE a = ? ORDER BY b</code></li>
</ul>
<p>but not <code>WHERE b = ?</code> alone — there is no way to seek without a value
for <code>a</code>. This is the leftmost-prefix rule, and it means an index on
<code>(a, b)</code> plus one on <code>(b, a)</code> are two different indexes.</p>
<p>A range on an early column stops later columns being used for seeking:
<code>WHERE a &gt; 5 AND b = 3</code> can only seek on <code>a</code>. Put equality
columns before range columns.</p>

<h2>Making a predicate usable</h2>
<p>Wrapping the column in a function defeats the index, because the index stores the
column's values, not the function's:</p>
<pre><code>-- Cannot use an index on created_at
WHERE date(created_at) = '2026-09-12'
-- Can
WHERE created_at &gt;= '2026-09-12' AND created_at &lt; '2026-09-13'

-- Cannot use a plain index on email
WHERE lower(email) = ?
-- Can, given an expression index on lower(email)
CREATE INDEX ON users (lower(email));</code></pre>
<p>A leading wildcard, <code>LIKE '%term'</code>, is unusable for the same reason:
there is no prefix to seek on.</p>

<h2>Covering indexes</h2>
<p>If an index contains every column a query needs, the database can answer from the
index alone and never touch the table. Adding a rarely-filtered column to the index
specifically to achieve this is a real and often large win. A partial index —
<code>WHERE status = 'open'</code> on the index itself — keeps it small when only a
fraction of rows are ever queried.</p>

<h2>The cost</h2>
<p>Every index must be updated on write and occupies space and cache. An unused index
is pure overhead, and several redundant indexes on overlapping column sets are common
in mature schemas. Check what the planner actually does with
<code>EXPLAIN</code> before adding one, and check usage statistics before keeping
one.</p>
`,
  },

  {
    id: 'sql/transactions-and-isolation',
    title: 'Transactions and isolation levels',
    url: 'https://www.postgresql.org/docs/current/transaction-iso.html',
    tags: 'transaction BEGIN COMMIT ROLLBACK isolation read committed repeatable read serializable dirty read phantom lost update SELECT FOR UPDATE',
    headings: ['The anomalies', 'The four levels', 'What your database actually defaults to', 'Locking a row', 'Retrying'],
    body: `
<h2>The anomalies</h2>
<ul>
<li><strong>Dirty read</strong> — seeing another transaction's uncommitted write.</li>
<li><strong>Non-repeatable read</strong> — reading a row twice and getting different
values.</li>
<li><strong>Phantom read</strong> — re-running a query and finding new rows that match.</li>
<li><strong>Lost update</strong> — two transactions read, both write, one write is
silently discarded. This is the one that loses money, and no isolation level below
serializable prevents it for a read-modify-write in application code.</li>
</ul>

<h2>The four levels</h2>
<table>
<tr><th>Level</th><th>Dirty</th><th>Non-repeatable</th><th>Phantom</th></tr>
<tr><td>Read uncommitted</td><td>possible</td><td>possible</td><td>possible</td></tr>
<tr><td>Read committed</td><td>no</td><td>possible</td><td>possible</td></tr>
<tr><td>Repeatable read</td><td>no</td><td>no</td><td>possible*</td></tr>
<tr><td>Serializable</td><td>no</td><td>no</td><td>no</td></tr>
</table>
<p>*In PostgreSQL, repeatable read uses snapshot isolation and does prevent phantoms,
but permits write skew, which serializable does not.</p>

<h2>What your database actually defaults to</h2>
<p>PostgreSQL and SQL Server default to read committed. MySQL with InnoDB defaults to
repeatable read. Oracle offers read committed and serializable only. Code written
against one default can behave differently against another, which is worth knowing
before a migration.</p>

<h2>Locking a row</h2>
<p>To make a read-modify-write safe, take a lock when reading:</p>
<pre><code>BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
-- no other transaction can now read this row FOR UPDATE
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;</code></pre>
<p>Better still, avoid the round trip: <code>SET balance = balance - 100</code>
computes in the database and needs no lock held across application code.</p>
<p><code>FOR UPDATE SKIP LOCKED</code> is how a work queue is drained by several
consumers without contention.</p>

<h2>Retrying</h2>
<p>Under serializable isolation the database may abort a transaction with a
serialization failure. That is not a bug — it is the mechanism. Any code using
serializable must be prepared to retry the whole transaction, which means the
transaction body has to be free of non-idempotent side effects.</p>
`,
  },

  {
    id: 'sql/window-functions',
    title: 'Window functions',
    url: 'https://www.postgresql.org/docs/current/tutorial-window.html',
    tags: 'window function OVER PARTITION BY ROW_NUMBER RANK DENSE_RANK LAG LEAD running total frame ROWS RANGE',
    headings: ['Aggregate versus window', 'Ranking', 'LAG and LEAD', 'Frames', 'Filtering on a window'],
    body: `
<h2>Aggregate versus window</h2>
<p><code>GROUP BY</code> collapses rows. A window function computes across a set of
rows while keeping every row:</p>
<pre><code>SELECT
  id, customer_id, amount,
  SUM(amount) OVER (PARTITION BY customer_id) AS customer_total,
  amount / SUM(amount) OVER (PARTITION BY customer_id) AS share
FROM orders;</code></pre>
<p>This is how you show a row alongside its own group's total without a self-join.</p>

<h2>Ranking</h2>
<ul>
<li><code>ROW_NUMBER()</code> — 1, 2, 3, 4. Always distinct, ties broken
arbitrarily.</li>
<li><code>RANK()</code> — 1, 2, 2, 4. Ties share a rank and leave a gap.</li>
<li><code>DENSE_RANK()</code> — 1, 2, 2, 3. Ties share, no gap.</li>
<li><code>NTILE(n)</code> — buckets into n roughly equal groups.</li>
</ul>
<p>The most-used pattern: the latest row per group.</p>
<pre><code>SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY customer_id ORDER BY created_at DESC
  ) AS rn
  FROM orders
) t
WHERE rn = 1;</code></pre>

<h2>LAG and LEAD</h2>
<p>Reach into the previous or next row without a self-join — differences between
consecutive readings, gap detection, change logs:</p>
<pre><code>SELECT
  reading_at, value,
  value - LAG(value) OVER (ORDER BY reading_at) AS delta
FROM readings;</code></pre>

<h2>Frames</h2>
<p>A frame limits which rows within the partition are considered. The default for an
ordered window is <code>RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW</code>,
which is why adding <code>ORDER BY</code> to a <code>SUM</code> turns it into a
running total:</p>
<pre><code>SUM(amount) OVER (ORDER BY created_at)                    -- running total
SUM(amount) OVER (ORDER BY created_at
                  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) -- 7-row moving sum</code></pre>
<p><code>ROWS</code> counts physical rows; <code>RANGE</code> includes peers with the
same <code>ORDER BY</code> value. With duplicate timestamps they give different
answers.</p>

<h2>Filtering on a window</h2>
<p>A window function cannot appear in <code>WHERE</code>, because windows are computed
after filtering. Wrap it in a subquery or CTE and filter outside, as the
<code>rn = 1</code> example does.</p>
`,
  },

  {
    id: 'sql/null-semantics',
    title: 'NULL semantics and three-valued logic',
    url: 'https://www.postgresql.org/docs/current/functions-comparison.html',
    tags: 'NULL IS NULL three-valued logic unknown COALESCE NULLIF DISTINCT aggregate NOT IN ordering',
    headings: ['NULL is not a value', 'Comparisons', 'Aggregates and GROUP BY', 'NOT IN', 'Ordering', 'Handling it'],
    body: `
<h2>NULL is not a value</h2>
<p><code>NULL</code> means unknown. It is not zero, not an empty string, and not equal
to itself. Nearly every SQL surprise traces back to this.</p>

<h2>Comparisons</h2>
<p>Any comparison with <code>NULL</code> yields unknown, and <code>WHERE</code> keeps
only rows where the predicate is true:</p>
<pre><code>WHERE x = NULL      -- never true, not even for NULL rows
WHERE x IS NULL     -- correct
WHERE x &lt;&gt; 'a'      -- excludes NULL rows too, which is rarely intended</code></pre>
<p>That last line catches people constantly: asking for rows where the status is not
'a' silently omits rows with no status.</p>

<h2>Aggregates and GROUP BY</h2>
<p>Aggregates skip <code>NULL</code>. <code>COUNT(*)</code> counts rows;
<code>COUNT(col)</code> counts non-null values — so they differ, and the difference is
the null count. <code>AVG</code> divides by the non-null count, not the row count.</p>
<p><code>GROUP BY</code> and <code>DISTINCT</code>, unlike <code>=</code>, treat all
<code>NULL</code>s as one group. So <code>NULL</code> is not equal to itself for
comparison but is grouped with itself for aggregation — inconsistent, but
standardised.</p>

<h2>NOT IN</h2>
<pre><code>-- Returns NO ROWS if the subquery yields even one NULL
WHERE id NOT IN (SELECT parent_id FROM child);</code></pre>
<p>Because <code>id NOT IN (1, NULL)</code> is <code>id &lt;&gt; 1 AND id &lt;&gt; NULL</code>,
and the second is unknown. Use <code>NOT EXISTS</code>, which has no such trap.</p>

<h2>Ordering</h2>
<p><code>ORDER BY</code> must place nulls somewhere, and the default differs by
engine: PostgreSQL and Oracle sort them last ascending, MySQL and SQL Server first.
Say what you mean with <code>NULLS FIRST</code> or <code>NULLS LAST</code> where
supported.</p>

<h2>Handling it</h2>
<p><code>COALESCE(a, b, c)</code> returns the first non-null.
<code>NULLIF(a, b)</code> returns null when the two are equal — useful for turning a
sentinel like <code>''</code> or <code>0</code> into a real null.
<code>IS NOT DISTINCT FROM</code> compares treating nulls as equal, which is the
comparison people usually wanted in the first place.</p>
`,
  },
];
