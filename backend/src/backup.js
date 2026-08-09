import { createDatabase } from './db/index.js';
import { runBackup } from './services/backup.js';

const database = await createDatabase();
try {
  await runBackup(database);
} finally {
  await database.close();
}
