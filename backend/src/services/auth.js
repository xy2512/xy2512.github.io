import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config/index.js';
import { HttpError } from '../http/errors.js';

const scrypt = promisify(scryptCallback);
const dummySalt = 'd7588c407e29516027fb2549ff054f1a';
const dummyHash = 'b3be7e7f68c39b5f208a68caab2f49f08b65dc1562e6c71b6a6c42cb3d94e301c8f988545bdd47e7555f3e1e3a5617b676844c62ce5e1d5b8494845f4c9e22f7';

export function normalizeAccount(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateCredentials(account, password) {
  if (!/^[a-z0-9_]{3,24}$/.test(account)) {
    throw new HttpError(400, '账号需为 3-24 位字母、数字或下划线', 'INVALID_ACCOUNT');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new HttpError(400, '密码需为 8-72 位字符', 'INVALID_PASSWORD');
  }
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, user) {
  const salt = user?.password_salt || dummySalt;
  const expected = user?.password_hash || dummyHash;
  const candidate = await hashPassword(password, salt);
  const candidateBuffer = Buffer.from(candidate.hash, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer) && Boolean(user);
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(database, userId, request) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
  await database.query(
    `INSERT INTO user_sessions (token_hash, user_id, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, userId, request.ip || '', String(request.headers['user-agent'] || '').slice(0, 500), expiresAt]
  );
  return { token, expiresAt };
}

export async function findSessionUser(database, token) {
  if (!token) return null;
  const result = await database.query(
    `SELECT u.id, u.account, u.display_name, u.city, u.bio, u.avatar_url, u.created_at
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)]
  );
  if (!result.rows[0]) return null;
  await database.query(
    `UPDATE user_sessions SET last_seen_at = NOW()
     WHERE token_hash = $1 AND last_seen_at < NOW() - INTERVAL '15 minutes'`,
    [hashSessionToken(token)]
  );
  return result.rows[0];
}

export async function deleteSession(database, token) {
  if (token) await database.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

export async function enforceLoginRateLimit(database, account, ipAddress) {
  const result = await database.query(
    `SELECT
       COUNT(*) FILTER (WHERE account = $1) AS account_failures,
       COUNT(*) FILTER (WHERE ip_address = $2) AS ip_failures
     FROM login_attempts
     WHERE succeeded = FALSE
       AND attempted_at > NOW() - ($3 * INTERVAL '1 minute')`,
    [account, ipAddress, config.loginWindowMinutes]
  );
  const accountFailures = Number(result.rows[0]?.account_failures || 0);
  const ipFailures = Number(result.rows[0]?.ip_failures || 0);
  if (accountFailures >= config.loginAccountLimit || ipFailures >= config.loginIpLimit) {
    throw new HttpError(429, `登录尝试过多，请 ${config.loginWindowMinutes} 分钟后再试`, 'LOGIN_RATE_LIMITED');
  }
}

export async function recordLoginAttempt(database, account, ipAddress, succeeded) {
  await database.query(
    'INSERT INTO login_attempts (account, ip_address, succeeded) VALUES ($1, $2, $3)',
    [account, ipAddress, succeeded]
  );
}

export async function cleanupAuthData(database) {
  await database.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
  await database.query("DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days'");
}
