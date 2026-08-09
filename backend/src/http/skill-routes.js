import { Router } from 'express';
import { asyncRoute, HttpError } from './errors.js';
import { requireAuth } from './middleware.js';
import { serializeSkill } from './serializers.js';
import { categories, skillInput } from './validation.js';

const selectSkill = (distanceExpression = 'NULL::DOUBLE PRECISION') => `
  SELECT s.*,
         ${distanceExpression} AS distance_km,
         u.id AS teacher_id, u.display_name AS teacher_display_name,
         u.city AS teacher_city, u.bio AS teacher_bio, u.avatar_url AS teacher_avatar_url
  FROM skills s
  JOIN users u ON u.id = s.owner_id
`;

function queryCoordinate(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new HttpError(400, `${label}无效`, 'INVALID_COORDINATES');
  }
  return number;
}

function distanceSql(latitudeParameter, longitudeParameter) {
  return `6371 * 2 * ASIN(SQRT(LEAST(1::DOUBLE PRECISION,
    POWER(SIN(RADIANS(s.location_latitude - $${latitudeParameter}) / 2), 2)
    + COS(RADIANS($${latitudeParameter})) * COS(RADIANS(s.location_latitude))
    * POWER(SIN(RADIANS(s.location_longitude - $${longitudeParameter}) / 2), 2)
  )))`;
}

export function skillRoutes(database) {
  const router = Router();

  router.get('/', asyncRoute(async (request, response) => {
    const search = String(request.query.search || '').trim().slice(0, 80);
    const category = categories.has(request.query.category) ? request.query.category : '';
    const mode = ['online', 'offline', 'both'].includes(request.query.mode) ? request.query.mode : '';
    const sort = ['newest', 'rate-low', 'rate-high', 'distance'].includes(request.query.sort) ? request.query.sort : 'newest';
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const limit = 24;
    const offset = (page - 1) * limit;
    const filters = [`s.status = 'published'`];
    const params = [];
    const hasLatitude = request.query.latitude !== undefined;
    const hasLongitude = request.query.longitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new HttpError(400, '地点坐标不完整', 'INVALID_COORDINATES');

    let distanceExpression = 'NULL::DOUBLE PRECISION';
    if (hasLatitude) {
      const latitude = queryCoordinate(request.query.latitude, '纬度', -90, 90);
      const longitude = queryCoordinate(request.query.longitude, '经度', -180, 180);
      params.push(latitude, longitude);
      distanceExpression = distanceSql(1, 2);
      filters.push('s.location_latitude IS NOT NULL AND s.location_longitude IS NOT NULL');
    }
    if (sort === 'distance' && !hasLatitude) {
      throw new HttpError(400, '按距离排序前请先选择地点', 'LOCATION_REQUIRED');
    }

    const hasMaxDistance = request.query.maxDistance !== undefined;
    if (hasMaxDistance) {
      const maxDistance = Number(request.query.maxDistance);
      if (!hasLatitude || !Number.isFinite(maxDistance) || maxDistance < 1 || maxDistance > 50) {
        throw new HttpError(400, '筛选距离需为 1-50 公里', 'INVALID_DISTANCE');
      }
      params.push(maxDistance);
      filters.push(`${distanceExpression} <= $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(s.title ILIKE $${params.length} OR s.description ILIKE $${params.length}
        OR u.display_name ILIKE $${params.length} OR array_to_string(s.tags, ' ') ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      filters.push(`s.category = $${params.length}`);
    }
    if (mode) {
      params.push(mode);
      filters.push(`(s.teaching_mode = $${params.length} OR s.teaching_mode = 'both')`);
    }
    const orderBy = {
      newest: 's.created_at DESC',
      'rate-low': 's.hourly_rate ASC, s.created_at DESC',
      'rate-high': 's.hourly_rate DESC, s.created_at DESC',
      distance: 'distance_km ASC NULLS LAST, s.created_at DESC'
    }[sort];
    params.push(limit, offset);
    const result = await database.query(
      `${selectSkill(distanceExpression)} WHERE ${filters.join(' AND ')} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    response.json({ skills: result.rows.map(serializeSkill), page, hasMore: result.rows.length === limit });
  }));

  router.get('/mine', requireAuth, asyncRoute(async (request, response) => {
    const result = await database.query(
      `${selectSkill()} WHERE s.owner_id = $1 AND s.status <> 'archived' ORDER BY s.created_at DESC`,
      [request.user.id]
    );
    response.json({ skills: result.rows.map(serializeSkill) });
  }));

  router.get('/:id', asyncRoute(async (request, response) => {
    const result = await database.query(`${selectSkill()} WHERE s.id = $1`, [request.params.id]);
    const skill = result.rows[0];
    if (!skill || (skill.status !== 'published' && skill.owner_id !== request.user?.id)) {
      throw new HttpError(404, '技能不存在', 'SKILL_NOT_FOUND');
    }
    response.json({ skill: serializeSkill(skill) });
  }));

  router.post('/', requireAuth, asyncRoute(async (request, response) => {
    const input = skillInput(request.body);
    const result = await database.query(
      `INSERT INTO skills (
         owner_id, title, category, hourly_rate, teaching_mode, location,
         location_latitude, location_longitude, tags, description,
         availability_days, availability_start, availability_end
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [request.user.id, input.title, input.category, input.hourlyRate, input.teachingMode,
        input.location, input.locationLatitude, input.locationLongitude, input.tags,
        input.description, input.availabilityDays,
        input.availabilityStart, input.availabilityEnd]
    );
    const complete = await database.query(`${selectSkill()} WHERE s.id = $1`, [result.rows[0].id]);
    response.status(201).json({ skill: serializeSkill(complete.rows[0]) });
  }));

  router.put('/:id', requireAuth, asyncRoute(async (request, response) => {
    const input = skillInput(request.body);
    const result = await database.query(
      `UPDATE skills SET title=$1, category=$2, hourly_rate=$3, teaching_mode=$4,
         location=$5, location_latitude=$6, location_longitude=$7, tags=$8,
         description=$9, availability_days=$10, availability_start=$11,
         availability_end=$12
       WHERE id=$13 AND owner_id=$14 AND status <> 'archived' RETURNING id`,
      [input.title, input.category, input.hourlyRate, input.teachingMode,
        input.location, input.locationLatitude, input.locationLongitude, input.tags,
        input.description, input.availabilityDays, input.availabilityStart,
        input.availabilityEnd, request.params.id, request.user.id]
    );
    if (!result.rows[0]) throw new HttpError(404, '技能不存在或无权编辑', 'SKILL_NOT_FOUND');
    const complete = await database.query(`${selectSkill()} WHERE s.id = $1`, [request.params.id]);
    response.json({ skill: serializeSkill(complete.rows[0]) });
  }));

  router.delete('/:id', requireAuth, asyncRoute(async (request, response) => {
    const result = await database.query(
      `UPDATE skills SET status = 'archived' WHERE id = $1 AND owner_id = $2 AND status <> 'archived' RETURNING id`,
      [request.params.id, request.user.id]
    );
    if (!result.rows[0]) throw new HttpError(404, '技能不存在或无权删除', 'SKILL_NOT_FOUND');
    response.json({ success: true });
  }));

  return router;
}
