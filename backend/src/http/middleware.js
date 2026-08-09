import { config } from '../config/index.js';
import { findSessionUser } from '../services/auth.js';
import { HttpError } from './errors.js';

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index === -1) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionCookie(token, expiresAt) {
  const secure = config.cookieSecure ? '; Secure' : '';
  return `${config.cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearSessionCookie() {
  const secure = config.cookieSecure ? '; Secure' : '';
  return `${config.cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

export function authenticate(database) {
  return async (request, _response, next) => {
    try {
      const token = parseCookies(request.headers.cookie)[config.cookieName];
      request.sessionToken = token || '';
      request.user = await findSessionUser(database, token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(request, _response, next) {
  if (!request.user) return next(new HttpError(401, '请先登录', 'AUTH_REQUIRED'));
  next();
}

export function sameOrigin(request, _response, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  const origin = request.headers.origin;
  if (origin && origin !== config.publicOrigin) {
    return next(new HttpError(403, '请求来源无效', 'INVALID_ORIGIN'));
  }
  next();
}

export function notFound(_request, _response, next) {
  next(new HttpError(404, '接口不存在', 'NOT_FOUND'));
}

export function errorHandler(error, request, response, _next) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(JSON.stringify({
      level: 'error', event: 'request_error', method: request.method, path: request.path,
      message: error.message, stack: error.stack
    }));
  }
  response.status(status).json({
    error: status >= 500 ? '服务器内部错误' : error.message,
    code: error.code || 'INTERNAL_ERROR'
  });
}
