import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const PACK_DIR = resolve('packs/core');
const DB_PATH = join(PACK_DIR, 'docs.db');
const MANIFEST_PATH = join(PACK_DIR, 'manifest.json');
const CREATE_SQL_PATH = join(PACK_DIR, 'create.sql');
const SEED_SQL_PATH = join(PACK_DIR, 'seed.sql');

console.log('Building core documentation pack...');

if (existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
}

const db = new DatabaseSync(DB_PATH);
const createSql = readFileSync(CREATE_SQL_PATH, 'utf-8');
const seedSql = readFileSync(SEED_SQL_PATH, 'utf-8');

db.exec(createSql);
db.exec(seedSql);
db.close();

// Compute SHA256 of the generated DB
const dbBuffer = readFileSync(DB_PATH);
const sha256 = createHash('sha256').update(dbBuffer).digest('hex');

const manifest = {
  id: 'core',
  version: '0.1.0',
  database: 'docs.db',
  sha256: sha256,
  sources: [
    {
      name: 'Microsoft Learn (ASP.NET Core)',
      url: 'https://learn.microsoft.com/aspnet/core/',
      license: 'CC-BY-4.0',
      attribution: 'Documentation derived from Microsoft Learn, licensed under CC BY 4.0.',
    },
    {
      name: 'TypeScript Handbook',
      url: 'https://www.typescriptlang.org/docs/',
      license: 'Apache-2.0',
      attribution: 'Documentation derived from TypeScript Handbook, licensed under Apache-2.0.',
    },
    {
      name: 'Git Documentation',
      url: 'https://git-scm.com/doc',
      license: 'GPLv2, MIT',
      attribution: 'Documentation derived from Git Documentation, licensed under GPLv2 and MIT.',
    },
    {
      name: 'Docker Documentation',
      url: 'https://docs.docker.com/',
      license: 'Apache-2.0',
      attribution: 'Documentation derived from Docker Docs, licensed under Apache-2.0.',
    },
  ],
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Core pack built successfully.`);
console.log(`DB SHA-256: ${sha256}`);
