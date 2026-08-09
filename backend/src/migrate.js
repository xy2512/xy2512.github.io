import { createDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';

const database = await createDatabase();
try {
  await runMigrations(database);
  console.log(JSON.stringify({ level: 'info', event: 'migrations_complete', database: database.kind }));
} finally {
  await database.close();
}
