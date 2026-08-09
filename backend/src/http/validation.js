import { HttpError } from './errors.js';

export const categories = new Set([
  'design', 'programming', 'language', 'career', 'art', 'music',
  'sports', 'cooking', 'lifestyle', 'health', 'study', 'other'
]);

export function requiredText(value, label, min, max) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) {
    throw new HttpError(400, `${label}需为 ${min}-${max} 个字符`, 'INVALID_INPUT');
  }
  return text;
}

export function optionalText(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function skillInput(body) {
  const category = String(body.category || '');
  const teachingMode = String(body.teachingMode || '');
  const hourlyRate = Number(body.hourlyRate);
  const availabilityDays = [...new Set((Array.isArray(body.availabilityDays) ? body.availabilityDays : [])
    .map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))];
  const availabilityStart = /^\d{2}:\d{2}$/.test(body.availabilityStart || '') ? body.availabilityStart : null;
  const availabilityEnd = /^\d{2}:\d{2}$/.test(body.availabilityEnd || '') ? body.availabilityEnd : null;
  const latitude = body.locationLatitude === '' || body.locationLatitude == null ? null : Number(body.locationLatitude);
  const longitude = body.locationLongitude === '' || body.locationLongitude == null ? null : Number(body.locationLongitude);

  if (!categories.has(category)) throw new HttpError(400, '请选择有效的技能分类', 'INVALID_CATEGORY');
  if (!['online', 'offline', 'both'].includes(teachingMode)) throw new HttpError(400, '请选择有效的授课方式', 'INVALID_MODE');
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 999999) {
    throw new HttpError(400, '请输入有效的参考课时费', 'INVALID_RATE');
  }
  if (availabilityStart && availabilityEnd && availabilityStart >= availabilityEnd) {
    throw new HttpError(400, '结束时间必须晚于开始时间', 'INVALID_TIME_RANGE');
  }
  if ((latitude === null) !== (longitude === null)
      || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
      || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    throw new HttpError(400, '地点坐标无效，请重新选择地点', 'INVALID_COORDINATES');
  }

  return {
    title: requiredText(body.title, '技能标题', 4, 60),
    category,
    hourlyRate,
    teachingMode,
    location: optionalText(body.location, 120),
    locationLatitude: latitude,
    locationLongitude: longitude,
    tags: [...new Set((Array.isArray(body.tags) ? body.tags : [])
      .map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 8),
    description: requiredText(body.description, '技能介绍', 20, 1200),
    availabilityDays,
    availabilityStart,
    availabilityEnd
  };
}
