import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import process from 'node:process';
import { config } from './config/index.js';
import { createDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { RealtimeHub } from './realtime/hub.js';
import { cleanupAuthData } from './services/auth.js';
import { startBackupScheduler } from './services/backup.js';

const database = await createDatabase();
await runMigrations(database);
const realtimeHub = new RealtimeHub(database);
const app = createApp(database, realtimeHub);

let server;
let protocol = 'http';
if (config.tlsKeyPath && config.tlsCertPath) {
  const [key, cert] = await Promise.all([readFile(config.tlsKeyPath), readFile(config.tlsCertPath)]);
  server = createHttpsServer({ key, cert }, app);
  protocol = 'https';
} else {
  server = createHttpServer(app);
}

await realtimeHub.attach(server);
const stopBackupScheduler = startBackupScheduler(database);
const cleanupInterval = setInterval(() => {
  cleanupAuthData(database).catch((error) => {
    console.error(JSON.stringify({ level: 'error', event: 'auth_cleanup_failed', message: error.message }));
  });
}, 3_600_000);
cleanupInterval.unref();

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    level: 'info', event: 'server_started',
    url: `${protocol}://${config.host}:${config.port}`,
    database: database.kind,
    websocket: '/ws'
  }));
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', event: 'server_stopping', signal }));
  stopBackupScheduler();
  clearInterval(cleanupInterval);
  await realtimeHub.close();
  await new Promise((resolve) => server.close(resolve));
  await database.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
