import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = resolve(backendRoot, '..');
const envFile = resolve(projectRoot, '.env');

if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const booleanValue = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const numberValue = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const config = Object.freeze({
  environment: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: numberValue(process.env.PORT, 3100),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:4180',
  trustProxy: booleanValue(process.env.TRUST_PROXY, false),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: booleanValue(process.env.DATABASE_SSL, false),
  pgliteDataDir: process.env.PGLITE_DATA_DIR || resolve(projectRoot, 'database/data/pglite'),
  migrationsDir: resolve(projectRoot, 'database/migrations'),
  frontendDist: process.env.FRONTEND_DIST || resolve(projectRoot, 'frontend/dist'),
  cookieName: process.env.SESSION_COOKIE_NAME || 'skill_session',
  cookieSecure: booleanValue(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  sessionDays: numberValue(process.env.SESSION_DAYS, 7),
  loginWindowMinutes: numberValue(process.env.LOGIN_WINDOW_MINUTES, 15),
  loginAccountLimit: numberValue(process.env.LOGIN_ACCOUNT_LIMIT, 5),
  loginIpLimit: numberValue(process.env.LOGIN_IP_LIMIT, 20),
  amapWebServiceKey: process.env.AMAP_WEB_SERVICE_KEY || '',
  amapApiBase: process.env.AMAP_API_BASE || 'https://restapi.amap.com',
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  tlsCertPath: process.env.TLS_CERT_PATH || '',
  backupEnabled: booleanValue(process.env.BACKUP_ENABLED, false),
  backupIntervalHours: numberValue(process.env.BACKUP_INTERVAL_HOURS, 24),
  backupRetentionDays: numberValue(process.env.BACKUP_RETENTION_DAYS, 14),
  backupDir: process.env.BACKUP_DIR || resolve(projectRoot, 'database/backups')
});
