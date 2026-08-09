import { config } from '../config/index.js';
import { HttpError } from '../http/errors.js';

function textValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('');
  return String(value || '');
}

function coordinates(value) {
  const [longitude, latitude] = String(value || '').split(',').map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function amapRequest(path, params) {
  if (!config.amapWebServiceKey) {
    throw new HttpError(424, '高德地图 Key 尚未配置', 'AMAP_NOT_CONFIGURED');
  }

  const query = new URLSearchParams({ ...params, key: config.amapWebServiceKey, output: 'JSON' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${config.amapApiBase}${path}?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status !== '1') {
      console.error(JSON.stringify({
        level: 'error', event: 'amap_api_error', path,
        info: payload.info, infocode: payload.infocode
      }));
      throw new HttpError(502, '高德地图服务暂时不可用', 'AMAP_API_ERROR');
    }
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(JSON.stringify({ level: 'error', event: 'amap_request_failed', path, message: error.message }));
    throw new HttpError(502, '高德地图服务暂时不可用', 'AMAP_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

export async function searchAmapPlaces(keyword, city = '') {
  const payload = await amapRequest('/v3/place/text', {
    keywords: keyword,
    city,
    citylimit: city ? 'true' : 'false',
    extensions: 'base',
    offset: '12',
    page: '1'
  });

  return (Array.isArray(payload.pois) ? payload.pois : []).flatMap((poi) => {
    const point = coordinates(poi.location);
    if (!point) return [];
    const province = textValue(poi.pname);
    const cityName = textValue(poi.cityname);
    const district = textValue(poi.adname);
    const street = textValue(poi.address);
    return [{
      id: textValue(poi.id),
      name: textValue(poi.name),
      address: [province, cityName !== province ? cityName : '', district, street].filter(Boolean).join(''),
      city: cityName || province,
      district,
      ...point
    }];
  });
}

export async function reverseAmapLocation(latitude, longitude) {
  const payload = await amapRequest('/v3/geocode/regeo', {
    location: `${longitude},${latitude}`,
    radius: '1000',
    extensions: 'base',
    roadlevel: '0'
  });
  const component = payload.regeocode?.addressComponent || {};
  return {
    name: textValue(payload.regeocode?.formatted_address) || '当前位置',
    city: textValue(component.city) || textValue(component.province),
    district: textValue(component.district),
    latitude,
    longitude
  };
}
