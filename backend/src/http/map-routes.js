import { Router } from 'express';
import { asyncRoute, HttpError } from './errors.js';
import { reverseAmapLocation, searchAmapPlaces } from '../services/amap.js';

const windows = new Map();

function limitMapRequests(request, _response, next) {
  const now = Date.now();
  const key = request.ip || request.socket.remoteAddress || 'unknown';
  const current = windows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    windows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > 60) return next(new HttpError(429, '地点搜索过于频繁，请稍后再试', 'MAP_RATE_LIMITED'));
  next();
}

function coordinate(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new HttpError(400, `${label}无效`, 'INVALID_COORDINATES');
  }
  return number;
}

export function mapRoutes() {
  const router = Router();
  router.use(limitMapRequests);

  router.get('/places', asyncRoute(async (request, response) => {
    const query = String(request.query.query || '').trim().slice(0, 80);
    const city = String(request.query.city || '').trim().slice(0, 40);
    if (!query) throw new HttpError(400, '请输入地点关键词', 'INVALID_MAP_QUERY');
    const places = await searchAmapPlaces(query, city);
    response.json({ places });
  }));

  router.get('/reverse', asyncRoute(async (request, response) => {
    const latitude = coordinate(request.query.latitude, '纬度', -90, 90);
    const longitude = coordinate(request.query.longitude, '经度', -180, 180);
    response.json({ place: await reverseAmapLocation(latitude, longitude) });
  }));

  return router;
}
