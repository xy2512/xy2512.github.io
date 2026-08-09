import { Router } from 'express';
import { asyncRoute, HttpError } from './errors.js';
import { clearSessionCookie, sessionCookie } from './middleware.js';
import { serializeUser } from './serializers.js';
import { requiredText } from './validation.js';
import {
  createSession, deleteSession, enforceLoginRateLimit, hashPassword,
  normalizeAccount, recordLoginAttempt, validateCredentials, verifyPassword
} from '../services/auth.js';

export function authRoutes(database) {
  const router = Router();

  router.get('/me', (request, response) => {
    response.json({ user: serializeUser(request.user) });
  });

  router.post('/register', asyncRoute(async (request, response) => {
    const account = normalizeAccount(request.body.account);
    const password = String(request.body.password || '');
    const displayName = requiredText(request.body.displayName, '昵称', 2, 30);
    validateCredentials(account, password);
    const credentials = await hashPassword(password);

    let user;
    try {
      const result = await database.query(
        `INSERT INTO users (account, password_hash, password_salt, display_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, account, display_name, city, bio, avatar_url, created_at`,
        [account, credentials.hash, credentials.salt, displayName]
      );
      user = result.rows[0];
    } catch (error) {
      if (error.code === '23505') throw new HttpError(409, '该账号已存在', 'ACCOUNT_EXISTS');
      throw error;
    }

    const session = await createSession(database, user.id, request);
    response.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    response.status(201).json({ user: serializeUser(user) });
  }));

  router.post('/login', asyncRoute(async (request, response) => {
    const account = normalizeAccount(request.body.account);
    const password = String(request.body.password || '');
    validateCredentials(account, password);
    const ipAddress = request.ip || 'unknown';
    await enforceLoginRateLimit(database, account, ipAddress);

    const result = await database.query(
      `SELECT id, account, password_hash, password_salt, display_name, city, bio, avatar_url, created_at
       FROM users WHERE account = $1`,
      [account]
    );
    const user = result.rows[0];
    const valid = await verifyPassword(password, user);
    await recordLoginAttempt(database, account, ipAddress, valid);
    if (!valid) throw new HttpError(401, '账号或密码错误', 'INVALID_CREDENTIALS');

    const session = await createSession(database, user.id, request);
    response.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    response.json({ user: serializeUser(user) });
  }));

  router.post('/logout', asyncRoute(async (request, response) => {
    await deleteSession(database, request.sessionToken);
    response.setHeader('Set-Cookie', clearSessionCookie());
    response.json({ success: true });
  }));

  return router;
}
