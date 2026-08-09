import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../config/index.js';

const { Pool } = pg;

function assertChannel(channel) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(channel)) throw new Error('Invalid PostgreSQL channel');
}

async function createExternalDatabase() {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000
  });
  await pool.query('SELECT 1');

  return {
    kind: 'postgresql',
    query: (text, params = []) => pool.query(text, params),
    exec: (text) => pool.query(text),
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({
          query: (text, params = []) => client.query(text, params),
          exec: (text) => client.query(text)
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async listen(channel, callback) {
      assertChannel(channel);
      const client = await pool.connect();
      client.on('notification', (notification) => {
        if (notification.channel === channel) callback(notification.payload);
      });
      await client.query(`LISTEN ${channel}`);
      return async () => {
        await client.query(`UNLISTEN ${channel}`).catch(() => {});
        client.release();
      };
    },
    async notify(channel, payload) {
      assertChannel(channel);
      await pool.query('SELECT pg_notify($1, $2)', [channel, payload]);
    },
    close: () => pool.end()
  };
}

async function createEmbeddedDatabase() {
  await mkdir(dirname(config.pgliteDataDir), { recursive: true });
  const client = new PGlite(`file://${config.pgliteDataDir}`);
  await client.waitReady;

  return {
    kind: 'pglite',
    query: (text, params = []) => client.query(text, params),
    exec: (text) => client.exec(text),
    async transaction(callback) {
      return client.transaction(async (transaction) => callback({
        query: (text, params = []) => transaction.query(text, params),
        exec: (text) => transaction.exec(text)
      }));
    },
    listen: (channel, callback) => client.listen(channel, callback),
    notify: (channel, payload) => client.query('SELECT pg_notify($1, $2)', [channel, payload]),
    async dumpBackup() {
      await client.syncToFs();
      const archive = await client.dumpDataDir('gzip');
      return new Uint8Array(await archive.arrayBuffer());
    },
    close: () => client.close()
  };
}

export async function createDatabase() {
  return config.databaseUrl ? createExternalDatabase() : createEmbeddedDatabase();
}
