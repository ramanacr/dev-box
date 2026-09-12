import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage for the remaining white-paper utility modules: the cron
 * visualizer (D-3), text diff (D-4), SQL assistant (D-5), gzip/HMAC/timezone
 * encoders (D-2, D-3), and the heap, BST, hash-table and DFS visualizers (E-4).
 */

test.describe('Cron Visualizer', () => {
  test('explains a schedule and projects the next runs', async ({ page }) => {
    const response = await page.goto('/cron');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Cron Visualizer' })).toBeVisible();

    await page.getByLabel('Cron expression').fill('0 9 * * 1-5');
    await expect(page.getByText(/At 09:00 on Monday/)).toBeVisible();
    await expect(page.getByText('Every day of the month.')).toBeVisible();

    // Eight projected occurrences, none of them on a weekend.
    const occurrences = page.locator('.occurrence-list li');
    await expect(occurrences).toHaveCount(8);
    await expect(occurrences.first()).not.toContainText('Saturday');
  });

  // The day-of-month / day-of-week OR semantics is the most common cron mistake.
  test('warns about the day-field OR trap', async ({ page }) => {
    await page.goto('/cron');
    await page.getByLabel('Cron expression').fill('0 0 13 * 5');
    await expect(page.getByText(/OR, not AND/)).toBeVisible();
  });

  test('reports an out-of-range field', async ({ page }) => {
    await page.goto('/cron');
    await page.getByLabel('Cron expression').fill('99 * * * *');
    await expect(page.getByRole('alert')).toContainText('minute field (0-59)');
  });

  test('expands a shorthand', async ({ page }) => {
    await page.goto('/cron');
    await page.getByLabel('Cron expression').fill('@daily');
    await expect(page.getByText('0 0 * * *')).toBeVisible();
  });

  test('says a never-firing schedule will never fire', async ({ page }) => {
    await page.goto('/cron');
    await page.getByLabel('Cron expression').fill('0 0 30 2 *');
    await expect(page.getByText(/parses but never fires/)).toBeVisible();
  });
});

test.describe('Text Diff', () => {
  test('shows a minimal diff with both line numbers', async ({ page }) => {
    const response = await page.goto('/diff');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Text Diff' })).toBeVisible();

    // The sample changes a version and adds a script: 3 added, 2 removed.
    await expect(page.locator('.stat-added')).toHaveText('+3');
    await expect(page.locator('.diff-insert').first()).toBeVisible();
    await expect(page.locator('.diff-delete').first()).toBeVisible();
  });

  test('reports identical documents', async ({ page }) => {
    await page.goto('/diff');

    await page.getByLabel('Left document').fill('same\ntext\n');
    await page.getByLabel('Right document').fill('same\ntext\n');

    await expect(page.getByText('The two documents are identical.')).toBeVisible();
  });

  test('ignores whitespace when the option is set, and says so', async ({ page }) => {
    await page.goto('/diff');

    await page.getByLabel('Left document').fill('  spaced  \n');
    await page.getByLabel('Right document').fill('spaced\n');
    await expect(page.getByText('The two documents are identical.')).toBeHidden();

    await page.getByLabel('Ignore whitespace').check();
    await expect(page.getByText('The two documents are identical.')).toBeVisible();
    // Reporting "identical" without this note would be misleading.
    await expect(page.getByText(/which the current options ignore/)).toBeVisible();
  });

  test('highlights changed words inside a similar line', async ({ page }) => {
    await page.goto('/diff');

    await page.getByLabel('Left document').fill('the quick brown fox\n');
    await page.getByLabel('Right document').fill('the quick red fox\n');

    await expect(page.locator('.word-delete')).toHaveText('brown');
    await expect(page.locator('.word-insert')).toHaveText('red');
  });
});

test.describe('SQL Assistant', () => {
  test('formats a statement and reviews it', async ({ page }) => {
    const response = await page.goto('/sql');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'SQL Assistant' })).toBeVisible();
    await expect(page.getByText('select-star')).toBeVisible();
    await expect(page.getByText('implicit-join')).toBeVisible();
  });

  test('flags an unbounded DELETE', async ({ page }) => {
    await page.goto('/sql');
    await page.getByLabel('SQL statement').fill('DELETE FROM users');

    await expect(page.getByText('unbounded-write')).toBeVisible();
    await expect(page.getByText(/affects every row/)).toBeVisible();
  });

  test('flags a comparison against NULL', async ({ page }) => {
    await page.goto('/sql');
    await page.getByLabel('SQL statement').fill('SELECT id FROM t WHERE x = NULL');
    await expect(page.getByText(/Use IS NULL or IS NOT NULL/)).toBeVisible();
  });

  // The same statement must be judged differently per dialect.
  test('applies dialect-specific rules', async ({ page }) => {
    await page.goto('/sql');
    await page.getByLabel('SQL statement').fill('SELECT id FROM t LIMIT 10');

    await page.getByLabel('Dialect').selectOption('postgres');
    await expect(page.getByText('dialect-limit')).toBeHidden();

    await page.getByLabel('Dialect').selectOption('sqlserver');
    await expect(page.getByText('dialect-limit')).toBeVisible();
  });

  test('shows the parameterised form for the selected dialect', async ({ page }) => {
    await page.goto('/sql');

    await page.getByLabel('Dialect').selectOption('postgres');
    await expect(page.getByText(/node-postgres/)).toBeVisible();

    await page.getByLabel('Dialect').selectOption('sqlite');
    await expect(page.getByText(/better-sqlite3/)).toBeVisible();
  });

  test('formatting preserves the statement', async ({ page }) => {
    await page.goto('/sql');
    await page.getByLabel('SQL statement').fill("select id from t where x <> 'FROM'");

    // The string literal must survive formatting untouched.
    await expect(page.locator('.code-block').first()).toContainText("'FROM'");
  });
});

test.describe('Encoding and Time', () => {
  test('round-trips gzip', async ({ page }) => {
    const response = await page.goto('/encode');
    expect(response?.status()).toBe(200);

    await page.getByLabel('gzip input').fill('compress me '.repeat(20));
    await page.getByRole('button', { name: 'Compress', exact: true }).click();

    // Wait for the result card before reading it; compression is asynchronous.
    const output = page.locator('.code-block').first();
    await expect(output).toBeVisible();
    await expect(page.getByText('Ratio')).toBeVisible();

    const base64 = (await output.textContent()) ?? '';
    expect(base64.length).toBeGreaterThan(0);

    await page.getByLabel('gzip input').fill(base64);
    await page.getByRole('button', { name: 'Decompress' }).click();
    await expect(page.getByText(/compress me compress me/)).toBeVisible();
  });

  test('explains base64 that is not gzip data', async ({ page }) => {
    await page.goto('/encode');
    await page.getByLabel('gzip input').fill('aGVsbG8gd29ybGQ=');
    await page.getByRole('button', { name: 'Decompress' }).click();

    await expect(page.getByRole('alert')).toContainText('magic number');
  });

  // An HMAC with no key authenticates nothing, so the UI must require one.
  test('requires a key before computing an HMAC', async ({ page }) => {
    await page.goto('/encode');
    await page.getByRole('tab', { name: 'HMAC' }).click();

    await expect(page.getByText(/Enter a secret key/)).toBeVisible();

    await page.getByLabel('HMAC secret key').fill('Jefe');
    // RFC 4231 test case 2 fixes this digest for this key and message.
    await expect(
      page.getByText('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'),
    ).toBeVisible();
  });

  test('renders one instant across several zones', async ({ page }) => {
    await page.goto('/encode');
    await page.getByRole('tab', { name: 'Timezones' }).click();

    await expect(page.getByText('One instant, several zones')).toBeVisible();
    // Scoped to the results table: the zone name also appears in the source picker.
    await expect(page.getByRole('cell', { name: 'Asia/Kolkata', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '+05:30', exact: true })).toBeVisible();
  });
});

test.describe('Algorithm Visualizer data structures', () => {
  test('offers every visualizer the white paper lists', async ({ page }) => {
    await page.goto('/algorithms');

    const select = page.getByLabel('Algorithm');
    const labels = [
      'Bubble sort',
      'Merge sort',
      'Breadth-first search',
      'Depth-first search',
      'Dijkstra shortest path',
    ];

    for (const label of labels) {
      await expect(select.getByRole('option', { name: label })).toHaveCount(1);
    }

    // The four that were missing before this change.
    await expect(select.getByRole('option', { name: /Heap/ })).not.toHaveCount(0);
    await expect(select.getByRole('option', { name: /BST/ })).not.toHaveCount(0);
    await expect(select.getByRole('option', { name: /Hash table/ })).not.toHaveCount(0);
  });

  test('renders the heap as a tree with the maximum at the root', async ({ page }) => {
    await page.goto('/algorithms');
    await page.getByLabel('Algorithm').selectOption('heapExtract');

    await expect(page.getByText(/Starting from a valid max-heap/)).toBeVisible();
    // 84 is the largest sample value, so it must be the root.
    await expect(page.locator('.visual-canvas svg text').first()).toHaveText('84');
  });

  test('renders a binary search tree', async ({ page }) => {
    await page.goto('/algorithms');
    await page.getByLabel('Algorithm').selectOption('bstInOrder');

    await expect(page.getByText(/left subtree, then node, then right subtree/)).toBeVisible();
    await expect(page.locator('.visual-canvas svg circle').first()).toBeVisible();
  });

  test('renders hash buckets and switches collision strategy', async ({ page }) => {
    await page.goto('/algorithms');
    await page.getByLabel('Algorithm').selectOption('hashTable');

    await expect(page.locator('.bucket')).toHaveCount(7);
    await expect(page.getByText(/Each bucket holds a list/)).toBeVisible();

    await page.getByRole('tab', { name: 'Linear probing' }).click();
    await expect(page.getByText(/walk forward one slot at a time/)).toBeVisible();
  });

  test('DFS explores depth first', async ({ page }) => {
    await page.goto('/algorithms');
    await page.getByLabel('Algorithm').selectOption('dfs');

    await expect(page.getByText(/A stack follows one branch to its end/)).toBeVisible();
    await expect(page.getByText(/Pushed onto the stack/)).toBeVisible();
  });

  test('keeps an accessible table view of the current step', async ({ page }) => {
    await page.goto('/algorithms');
    await page.getByLabel('Algorithm').selectOption('hashTable');

    await page.getByText('Step state as a table (accessible view)').click();
    await expect(page.getByRole('columnheader', { name: 'Bucket' })).toBeVisible();
  });
});
