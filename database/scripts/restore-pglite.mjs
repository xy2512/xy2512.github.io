import { access, readFile, rename, rm } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../../backend/src/config/index.js';

const archivePath = process.argv[2];
if (!archivePath || !archivePath.endsWith('.tar.gz')) {
  console.error('Usage: npm run restore:pglite -- database/backups/skill-share-xxx.tar.gz');
  process.exit(1);
}

const archive = await readFile(archivePath);
const rollbackPath = `${config.pgliteDataDir}.before-restore-${Date.now()}`;
let hadExistingData = false;
try {
  await access(config.pgliteDataDir);
  await rename(config.pgliteDataDir, rollbackPath);
  hadExistingData = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

try {
  const database = new PGlite(config.pgliteDataDir, { loadDataDir: new Blob([archive]) });
  await database.waitReady;
  await database.query('SELECT 1 FROM schema_migrations LIMIT 1');
  await database.close();
  console.log(JSON.stringify({
    level: 'info', event: 'pglite_restore_complete', archive: archivePath,
    dataDir: config.pgliteDataDir,
    previousDataDir: hadExistingData ? rollbackPath : null
  }));
} catch (error) {
  await rm(config.pgliteDataDir, { recursive: true, force: true }).catch(() => {});
  if (hadExistingData) await rename(rollbackPath, config.pgliteDataDir).catch(() => {});
  throw error;
}
