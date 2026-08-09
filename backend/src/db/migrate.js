import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config/index.js';

export async function runMigrations(database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries = (await readdir(config.migrationsDir))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  const appliedResult = await database.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map((row) => row.name));

  for (const name of entries) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(config.migrationsDir, name), 'utf8');
    await database.transaction(async (transaction) => {
      await transaction.exec(sql);
      await transaction.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
    console.log(JSON.stringify({ level: 'info', event: 'migration_applied', name }));
  }
}
