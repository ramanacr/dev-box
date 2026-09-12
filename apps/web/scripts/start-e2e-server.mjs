#!/usr/bin/env node
/**
 * Starts the Go toolbox server for the Playwright end-to-end suite.
 *
 * Playwright's webServer needs a single command it can launch and poll. This builds
 * the server if necessary and runs it against the repository's own build output and
 * content pack, so the suite works from a clean checkout without a Docker daemon.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const repoRoot = resolve(webRoot, '../..');

const distDir = join(webRoot, 'dist');
const docsDB = join(repoRoot, 'packs/core/docs.db');
const runtimeDir = join(repoRoot, '.tmp/e2e');
const binaryName = process.platform === 'win32' ? 'toolbox-server-e2e.exe' : 'toolbox-server-e2e';
const binary = join(runtimeDir, binaryName);

const port = process.env.TOOLBOX_PORT || '8080';

function fail(message) {
  console.error(`[e2e-server] ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail('apps/web/dist is missing. Run "pnpm --filter @toolbox/web build" first.');
}
if (!existsSync(docsDB)) {
  fail('packs/core/docs.db is missing. Run "node scripts/build-core-pack.mjs" first.');
}

mkdirSync(runtimeDir, { recursive: true });

console.log('[e2e-server] building server binary');
const build = spawnSync('go', ['build', '-o', binary, './cmd/toolbox-server'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) {
  fail('go build failed. Is the Go toolchain on PATH?');
}

console.log(`[e2e-server] starting on 127.0.0.1:${port}`);
const server = spawn(binary, {
  stdio: 'inherit',
  env: {
    ...process.env,
    TOOLBOX_BIND_ADDRESS: '127.0.0.1',
    TOOLBOX_PORT: port,
    TOOLBOX_DOCS_DB_PATH: docsDB,
    TOOLBOX_USER_DOCS_DB_PATH: join(runtimeDir, 'user-docs.db'),
    TOOLBOX_WEB_ROOT: distDir,
  },
});

server.on('exit', (code) => process.exit(code ?? 0));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
