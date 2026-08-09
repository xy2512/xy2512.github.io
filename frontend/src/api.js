export class ApiError extends Error {
  constructor(status, payload) {
    super(payload.error || '请求失败，请稍后重试');
    this.status = status;
    this.code = payload.code || 'REQUEST_ERROR';
  }
}

export async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  updateProfile: (body) => request('/api/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  skills: (params = {}) => request(`/api/skills?${new URLSearchParams(params)}`),
  skill: (id) => request(`/api/skills/${encodeURIComponent(id)}`),
  places: (query, city = '') => request(`/api/map/places?${new URLSearchParams({ query, city })}`),
  reverseLocation: (latitude, longitude) => request(`/api/map/reverse?${new URLSearchParams({ latitude, longitude })}`),
  mySkills: () => request('/api/skills/mine'),
  createSkill: (body) => request('/api/skills', { method: 'POST', body: JSON.stringify(body) }),
  updateSkill: (id, body) => request(`/api/skills/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSkill: (id) => request(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  conversations: () => request('/api/conversations'),
  startConversation: (skillId) => request('/api/conversations', { method: 'POST', body: JSON.stringify({ skillId }) }),
  messages: (id) => request(`/api/conversations/${encodeURIComponent(id)}/messages`),
  sendMessage: (id, body) => request(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST', body: JSON.stringify({ body })
  })
};
