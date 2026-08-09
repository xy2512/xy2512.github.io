import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { config } from '../config/index.js';

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
}

async function removeExpiredBackups() {
  const cutoff = Date.now() - config.backupRetentionDays * 86_400_000;
  const entries = await readdir(config.backupDir, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile() && (entry.name.endsWith('.dump') || entry.name.endsWith('.tar.gz'))).map(async (entry) => {
    const path = join(config.backupDir, entry.name);
    const info = await stat(path);
    if (info.mtimeMs < cutoff) await unlink(path);
  }));
}

export async function runBackup(database) {
  await mkdir(config.backupDir, { recursive: true });
  if (database.kind === 'pglite') {
    const outputPath = join(config.backupDir, `skill-share-${timestamp()}.tar.gz`);
    await writeFile(outputPath, await database.dumpBackup());
    await removeExpiredBackups();
    console.log(JSON.stringify({ level: 'info', event: 'backup_complete', database: 'pglite', path: outputPath }));
    return;
  }
  const databaseUrl = new URL(config.databaseUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');
  const outputPath = join(config.backupDir, `skill-share-${timestamp()}.dump`);
  const args = [
    '--format=custom', '--no-owner', '--no-privileges',
    '--host', databaseUrl.hostname,
    '--port', databaseUrl.port || '5432',
    '--username', decodeURIComponent(databaseUrl.username),
    '--file', outputPath,
    databaseName
  ];
  const environment = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(databaseUrl.password),
    PGSSLMODE: config.databaseSsl ? 'require' : 'prefer'
  };

  await new Promise((resolve, reject) => {
    const child = spawn('pg_dump', args, { env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = '';
    child.stderr.on('data', (chunk) => { errorOutput += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `pg_dump exited with ${code}`));
    });
  });
  await removeExpiredBackups();
  console.log(JSON.stringify({ level: 'info', event: 'backup_complete', path: outputPath }));
}

export function startBackupScheduler(database) {
  if (!config.backupEnabled) return () => {};
  let running = false;
  const execute = async () => {
    if (running) return;
    running = true;
    try {
      await runBackup(database);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'backup_failed', message: error.message }));
    } finally {
      running = false;
    }
  };
  const firstRun = setTimeout(execute, 60_000);
  const interval = setInterval(execute, config.backupIntervalHours * 3_600_000);
  firstRun.unref();
  interval.unref();
  return () => {
    clearTimeout(firstRun);
    clearInterval(interval);
  };
}
