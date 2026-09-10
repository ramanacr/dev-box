import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = resolve('apps/web/dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');

console.log('Checking bundle budgets against performance targets...');

try {
  const files = readdirSync(ASSETS_DIR);
  let initialJsGzip = 0;
  let totalCssGzip = 0;
  const chunkSizes = [];

  for (const f of files) {
    const filePath = join(ASSETS_DIR, f);
    const content = readFileSync(filePath);
    const gzipped = gzipSync(content);
    const gzipSizeKb = gzipped.length / 1024;

    if (f.endsWith('.js')) {
      chunkSizes.push({ file: f, gzipSizeKb });
      if (f.startsWith('index-')) {
        initialJsGzip += gzipSizeKb;
      }
    } else if (f.endsWith('.css')) {
      totalCssGzip += gzipSizeKb;
    }
  }

  console.log('\n--- Chunk Sizes (gzipped) ---');
  chunkSizes.forEach((c) => {
    console.log(`  ${c.file}: ${c.gzipSizeKb.toFixed(2)} KB`);
  });
  console.log(`  Total CSS: ${totalCssGzip.toFixed(2)} KB\n`);

  let failed = false;

  // 1. Initial JS budget: <= 250 KB
  const INITIAL_JS_BUDGET = 250;
  if (initialJsGzip > INITIAL_JS_BUDGET) {
    console.error(`❌ Initial JS gzip (${initialJsGzip.toFixed(2)} KB) exceeds budget of ${INITIAL_JS_BUDGET} KB`);
    failed = true;
  } else {
    console.log(`✓ Initial JS gzip: ${initialJsGzip.toFixed(2)} KB <= ${INITIAL_JS_BUDGET} KB budget`);
  }

  // 2. CSS budget: <= 50 KB
  const CSS_BUDGET = 50;
  if (totalCssGzip > CSS_BUDGET) {
    console.error(`❌ Total CSS gzip (${totalCssGzip.toFixed(2)} KB) exceeds budget of ${CSS_BUDGET} KB`);
    failed = true;
  } else {
    console.log(`✓ Total CSS gzip: ${totalCssGzip.toFixed(2)} KB <= ${CSS_BUDGET} KB budget`);
  }

  // 3. Lazy tool chunks: <= 50 KB
  const CHUNK_BUDGET = 50;
  for (const c of chunkSizes) {
    if (!c.file.startsWith('index-') && c.gzipSizeKb > CHUNK_BUDGET) {
      console.error(`❌ Chunk ${c.file} (${c.gzipSizeKb.toFixed(2)} KB) exceeds budget of ${CHUNK_BUDGET} KB`);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log('\n✓ All bundle budgets passed!');
} catch (err) {
  console.error('Error checking bundle budgets:', err.message);
  process.exit(1);
}
