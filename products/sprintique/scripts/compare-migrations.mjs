// Transitional check while both backends exist: the Flyway ledger must produce exactly the schema, functions,
// policies and grants of the previous migrate.ts. Two fresh databases in the isolated test cluster are migrated,
// one by each backend, and their schema dumps are compared.
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import pg from 'pg';
import {migrate as migrateKotlin} from './kotlin-server.mjs';

const LEDGERS = /schema_migrations|flyway_schema_history/;

function dump(bin, url) {
  const run = spawnSync(join(bin, 'pg_dump'), ['--schema-only', '--no-owner', '--no-comments', url], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (run.status !== 0) throw Error(`pg_dump failed: ${run.stderr}`);
  // Statements are compared as a set: the ledgers differ by design, the rest must not.
  // pg_dump 18 wraps every dump in \restrict/\unrestrict with a random key; it says nothing about the schema.
  return run.stdout.replace(/^\\(un)?restrict .*$/gm, '').split(/;\n/).map(statement => statement.replace(/^--.*$/gm, '').trim())
    .filter(statement => statement && !statement.startsWith('SET ') && !statement.startsWith('SELECT pg_catalog.set_config') && !LEDGERS.test(statement))
    .sort();
}

export async function compareMigrations({bin, url, roles}) {
  const admin = new pg.Client({connectionString: url('postgres', 'postgres')});
  await admin.connect();
  try {
    for (const name of ['sprintique_ts_ledger', 'sprintique_kt_ledger']) await admin.query(`CREATE DATABASE ${name} OWNER ${roles.migrator}`);
  } finally {
    await admin.end();
  }
  const typescript = spawnSync(process.execPath, ['--import', 'tsx', '-e',
    `import('./backend/migrate.ts').then(m=>m.migrate(${JSON.stringify(url(roles.migrator, 'sprintique_ts_ledger'))},'${roles.runtime}','${roles.worker}'))`], {stdio: 'inherit'});
  if (typescript.status !== 0) throw Error('TypeScript migrate failed');
  migrateKotlin({migrationUrl: url(roles.migrator, 'sprintique_kt_ledger'), runtimeRole: roles.runtime, workerRole: roles.worker});
  const before = dump(bin, url('postgres', 'sprintique_ts_ledger'));
  const after = new Set(dump(bin, url('postgres', 'sprintique_kt_ledger')));
  const beforeSet = new Set(before);
  const missing = before.filter(statement => !after.has(statement));
  const extra = [...after].filter(statement => !beforeSet.has(statement));
  if (missing.length || extra.length) {
    throw Error(`Flyway schema differs from migrate.ts.\nOnly in migrate.ts:\n${missing.join('\n---\n')}\nOnly in Flyway:\n${extra.join('\n---\n')}`);
  }
  return before.length;
}
