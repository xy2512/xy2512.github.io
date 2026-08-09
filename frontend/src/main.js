import { createIcons, icons } from 'lucide';
import { api, ApiError } from './api.js';
import { RealtimeClient } from './realtime.js';
import './styles.css';

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const categories = [
  ['all', '全部', 'grid-3x3'], ['design', '设计', 'pen-tool'], ['programming', '编程', 'square-terminal'],
  ['language', '语言', 'languages'], ['career', '职业', 'briefcase-business'], ['art', '艺术', 'palette'],
  ['music', '音乐', 'music-2'], ['sports', '运动', 'dumbbell'], ['cooking', '烹饪', 'cooking-pot'],
  ['lifestyle', '生活', 'lamp-desk'], ['health', '健康', 'heart-pulse'], ['study', '学业', 'book-open-check'],
  ['other', '其他', 'shapes']
];
const categoryNames = Object.fromEntries(categories.map(([id, name]) => [id, name]));
const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const state = {
  user: null,
  authChecked: false,
  authMode: 'login',
  pendingPath: '',
  pendingContact: '',
  skills: [],
  skill: null,
  mySkills: [],
  conversations: [],
  conversation: null,
  messages: [],
  loading: true,
  fatalError: '',
  home: {
    search: '', category: 'all', mode: '', sort: 'newest',
    locationName: '', latitude: null, longitude: null, maxDistance: 10
  },
  locationPicker: { target: '', places: [], loading: false }
};

const realtime = new RealtimeClient(async (event) => {
  if (event.type === 'message.created') {
    const route = currentRoute();
    if (route.page === 'chat' && route.id === event.conversationId) {
      if (!state.messages.some((message) => message.id === event.message.id)) state.messages.push(event.message);
      render();
      scrollChat();
    } else {
      showToast('收到一条新消息', 'info');
      if (route.page === 'messages') {
        const result = await api.conversations().catch(() => null);
        if (result) { state.conversations = result.conversations; render(); }
      }
    }
  }
  if (event.type === 'conversation.updated' && currentRoute().page === 'messages') {
    const result = await api.conversations().catch(() => null);
    if (result) { state.conversations = result.conversations; render(); }
  }
});

function icon(name, extra = '') {
  return `<i data-lucide="${name}" class="icon ${extra}" aria-hidden="true"></i>`;
}

function refreshIcons() {
  requestAnimationFrame(() => createIcons({ icons, attrs: { 'stroke-width': 1.8 } }));
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { page: parts[0] || 'home', id: parts[1] || '', params: new URLSearchParams(query) };
}

function go(path) {
  const hash = `#/${path}`;
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

function initials(user) {
  return escapeHtml((user?.displayName || '用户').slice(0, 1).toUpperCase());
}

function avatar(user, className = '') {
  if (user?.avatarUrl) return `<img class="avatar ${className}" src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.displayName || '')}" />`;
  return `<span class="avatar avatar-fallback ${className}" aria-hidden="true">${initials(user)}</span>`;
}

function categoryAsset(category) {
  const assets = {
    design: '/images/skills/ui-design.svg',
    programming: '/images/skills/python.svg',
    language: '/images/skills/english.svg',
    career: '/images/category/programming.svg',
    art: '/images/category/design.svg',
    music: '/images/category/music.svg',
    sports: '/images/category/sports.svg',
    cooking: '/images/category/cooking.svg',
    lifestyle: '/images/category/cooking.svg',
    health: '/images/category/sports.svg',
    study: '/images/category/language.svg',
    other: '/images/category/other.svg'
  };
  return assets[category] || assets.other;
}

function modeLabel(mode) {
  return { online: '线上', offline: '线下', both: '线上或线下' }[mode] || '沟通确定';
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function hasHomeLocation() {
  return Number.isFinite(state.home.latitude) && Number.isFinite(state.home.longitude);
}

function locationLabel(place) {
  const name = String(place.name || '').trim();
  const address = String(place.address || '').trim();
  return (address && !address.includes(name) ? `${name}，${address}` : name || address || '已选地点').slice(0, 120);
}

function protectedPage(page) {
  return ['messages', 'chat', 'publish', 'my-skills', 'profile'].includes(page);
}

function navItem(path, label, iconName, active) {
  return `<a class="nav-item ${active === path ? 'active' : ''}" href="#/${path}">${icon(iconName)}<span>${label}</span></a>`;
}

function shell(content, page) {
  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#/home"><span class="brand-symbol"><img src="/images/category/all.svg" alt="" /></span><span><strong>我的技能分你一半</strong><small>SKILL EXCHANGE</small></span></a>
      <nav class="desktop-menu" aria-label="主导航">
        ${navItem('home', '发现技能', 'compass', page)}
        ${state.user ? navItem('messages', '消息', 'message-square', page) : ''}
        ${state.user ? navItem('my-skills', '我的技能', 'layers-3', page) : ''}
      </nav>
      <div class="header-actions">
        ${state.user ? `<a class="account-link" href="#/profile">${avatar(state.user, 'avatar-small')}<span>${escapeHtml(state.user.displayName)}</span></a><a class="button primary compact" href="#/publish">${icon('plus')}发布技能</a>` : `<a class="button primary compact" href="#/auth">登录 / 注册</a>`}
      </div>
    </div>
  </header>
  <main>${content}</main>
  <nav class="mobile-menu" aria-label="移动端导航">
    ${navItem('home', '发现', 'compass', page)}
    ${navItem('messages', '消息', 'message-square', page)}
    ${navItem('publish', '发布', 'plus-circle', page)}
    ${navItem(state.user ? 'profile' : 'auth', state.user ? '我的' : '登录', 'user-round', page)}
  </nav>`;
}

function loadingView() {
  return `<section class="status-view"><span class="loader"></span><p>正在加载</p></section>`;
}

function errorView(message) {
  return `<section class="status-view"><span class="status-icon error">${icon('wifi-off')}</span><h1>服务暂时不可用</h1><p>${escapeHtml(message)}</p><button class="button primary" data-action="retry">重新连接</button></section>`;
}

function emptyView(iconName, title, text, action = '') {
  return `<section class="empty-view"><span class="status-icon">${icon(iconName)}</span><h2>${title}</h2><p>${text}</p>${action}</section>`;
}

function skillCard(skill) {
  return `<article class="skill-card">
    <a class="skill-cover" href="#/skill/${skill.id}"><img src="${categoryAsset(skill.category)}" alt="" /><span>${escapeHtml(modeLabel(skill.teachingMode))}</span></a>
    <div class="skill-content">
      <p class="card-category">${escapeHtml(categoryNames[skill.category] || '其他')}</p>
      <h2><a href="#/skill/${skill.id}">${escapeHtml(skill.title)}</a></h2>
      <p class="card-description">${escapeHtml(skill.description)}</p>
      <div class="teacher-row">${avatar(skill.teacher, 'avatar-tiny')}<span>${escapeHtml(skill.teacher?.displayName || '用户')}</span></div>
      <div class="card-location">${icon('map-pin')}<span>${escapeHtml(skill.location || skill.teacher?.city || '地点沟通确定')}</span>${skill.distanceKm != null ? `<strong>${escapeHtml(skill.distanceKm)} km</strong>` : ''}</div>
      <div class="skill-footer"><p><strong>¥${Number(skill.hourlyRate).toFixed(0)}</strong><span>参考 / 小时</span></p><a href="#/skill/${skill.id}" aria-label="查看详情">${icon('arrow-up-right')}</a></div>
    </div>
  </article>`;
}

function homeView() {
  const located = hasHomeLocation();
  return `<div class="home-page">
    <section class="search-band"><div class="content-width search-layout">
      <div><p class="overline">真实的人，真实的经验</p><h1>找到你想学的技能</h1><p>直接联系分享者，沟通时间、地点和费用。</p></div>
      <form id="search-form" class="main-search"><span>${icon('search')}</span><input name="search" value="${escapeHtml(state.home.search)}" placeholder="搜索技能、老师或关键词" aria-label="搜索技能、老师或关键词" /><button class="button primary" type="submit">搜索</button></form>
    </div></section>
    <section class="category-strip"><div class="content-width category-scroller">${categories.map(([id, name, iconName]) => `<button class="category-item ${state.home.category === id ? 'active' : ''}" data-action="category" data-id="${id}">${icon(iconName)}<span>${name}</span></button>`).join('')}</div></section>
    <section class="location-filter-band"><div class="content-width location-filter">
      <div class="location-value"><span>${icon('map-pin')}</span><div><small>筛选地点</small><strong>${escapeHtml(located ? state.home.locationName : '未设置')}</strong></div></div>
      <div class="location-actions"><button class="button ghost compact" data-action="open-location" data-target="home">${icon('map')}选择地点</button><button class="button ghost compact" data-action="current-location" data-target="home">${icon('locate-fixed')}当前位置</button>${located ? `<button class="icon-button" data-action="clear-location" title="清除地点筛选" aria-label="清除地点筛选">${icon('x')}</button>` : ''}</div>
      <label class="distance-range ${located ? '' : 'disabled'}"><span>距离范围</span><input data-action="home-distance" type="range" min="1" max="50" step="1" value="${state.home.maxDistance}" ${located ? '' : 'disabled'} /><output>${state.home.maxDistance} km</output></label>
    </div></section>
    <section class="content-width browse-section">
      <div class="browse-head"><div><p class="overline">技能广场</p><h2>${located ? `${state.home.maxDistance} km 内` : state.home.category === 'all' ? '最新发布' : categoryNames[state.home.category]}</h2></div><div class="browse-controls"><label><span class="sr-only">授课方式</span><select data-action="home-mode"><option value="" ${!state.home.mode ? 'selected' : ''}>全部方式</option><option value="online" ${state.home.mode === 'online' ? 'selected' : ''}>线上</option><option value="offline" ${state.home.mode === 'offline' ? 'selected' : ''}>线下</option></select></label><label><span class="sr-only">排序</span><select data-action="home-sort"><option value="newest" ${state.home.sort === 'newest' ? 'selected' : ''}>最新发布</option><option value="distance" ${state.home.sort === 'distance' ? 'selected' : ''} ${located ? '' : 'disabled'}>距离最近</option><option value="rate-low" ${state.home.sort === 'rate-low' ? 'selected' : ''}>价格从低到高</option><option value="rate-high" ${state.home.sort === 'rate-high' ? 'selected' : ''}>价格从高到低</option></select></label></div></div>
      ${state.loading ? loadingView() : state.skills.length ? `<div class="skill-grid">${state.skills.map(skillCard).join('')}</div>` : emptyView('search-x', '暂时没有匹配的技能', '尝试更换搜索条件，或成为第一个发布这项技能的人。', `<a class="button primary" href="#/${state.user ? 'publish' : 'auth'}">发布技能</a>`)}
    </section>
  </div>`;
}

function authView() {
  const login = state.authMode === 'login';
  return `<section class="auth-page">
    <div class="auth-image"><img src="/images/skills/ui-design.svg" alt="" /><div><span>${icon('messages-square')}</span><h1>技能，因为交流而流动。</h1><p>与真实用户直接沟通学习安排。</p></div></div>
    <div class="auth-panel"><div class="auth-box"><p class="overline">${login ? '欢迎回来' : '加入技能社区'}</p><h2>${login ? '登录账号' : '创建账号'}</h2><p class="auth-intro">${login ? '查看消息，继续你的技能交流。' : '注册后即可发布技能或联系分享者。'}</p>
      <div class="tab-switch"><button class="${login ? 'active' : ''}" data-action="auth-mode" data-mode="login">登录</button><button class="${!login ? 'active' : ''}" data-action="auth-mode" data-mode="register">注册</button></div>
      <form id="auth-form" class="form-stack">
        ${login ? '' : `<label><span>昵称</span><input name="displayName" minlength="2" maxlength="30" autocomplete="nickname" placeholder="你希望别人如何称呼你" required /></label>`}
        <label><span>账号</span><input name="account" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="3-24 位字母、数字或下划线" required /></label>
        <label><span>密码</span><span class="password-control"><input name="password" type="password" minlength="8" maxlength="72" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="至少 8 位字符" required /><button type="button" data-action="toggle-password" title="显示密码" aria-label="显示密码">${icon('eye')}</button></span></label>
        <button class="button primary large full" type="submit">${login ? '登录' : '注册并登录'}</button>
      </form>
      <p class="auth-note">${login ? '还没有账号？' : '已经注册？'} <button data-action="auth-mode" data-mode="${login ? 'register' : 'login'}">${login ? '创建账号' : '直接登录'}</button></p>
    </div></div>
  </section>`;
}

function skillDetailView() {
  const skill = state.skill;
  if (!skill) return notFoundView();
  const isOwner = state.user?.id === skill.ownerId;
  const days = skill.availability.days.map((day) => weekDays[day]).join('、');
  return `<div class="detail-page">
    <div class="content-width crumb"><a href="#/home">技能广场</a>${icon('chevron-right')}<span>${escapeHtml(categoryNames[skill.category] || '其他')}</span></div>
    <section class="content-width detail-main">
      <div class="detail-cover"><img src="${categoryAsset(skill.category)}" alt="" /><span>${escapeHtml(categoryNames[skill.category] || '其他')}</span></div>
      <div class="detail-summary"><div class="detail-labels"><span>${escapeHtml(modeLabel(skill.teachingMode))}</span><span>${escapeHtml(skill.location || '地点沟通确定')}</span></div><h1>${escapeHtml(skill.title)}</h1><p class="detail-description">${escapeHtml(skill.description)}</p>
        <div class="owner-block">${avatar(skill.teacher, 'avatar-medium')}<div><strong>${escapeHtml(skill.teacher.displayName)}</strong><span>${escapeHtml(skill.teacher.city || '未填写城市')}</span></div></div>
        <div class="contact-bar"><div><span>参考课时费</span><strong>¥${Number(skill.hourlyRate).toFixed(0)}<small> / 小时</small></strong></div>${isOwner ? `<a class="button dark large" href="#/publish?id=${skill.id}">${icon('square-pen')}编辑技能</a>` : `<button class="button primary large" data-action="contact" data-id="${skill.id}">${icon('message-square')}联系分享者</button>`}</div>
        <p class="privacy-note">${icon('shield-check')} 平台不收取费用，具体安排请双方在站内消息中确认。</p>
      </div>
    </section>
    <section class="facts-band"><div class="content-width fact-grid"><div>${icon('calendar-days')}<span>方便日期</span><strong>${escapeHtml(days || '灵活安排')}</strong></div><div>${icon('clock-3')}<span>方便时段</span><strong>${escapeHtml(skill.availability.start && skill.availability.end ? `${skill.availability.start} - ${skill.availability.end}` : '沟通确定')}</strong></div><div>${icon('monitor-smartphone')}<span>授课方式</span><strong>${escapeHtml(modeLabel(skill.teachingMode))}</strong></div></div></section>
    <section class="content-width detail-body"><div><p class="overline">技能介绍</p><h2>关于这项技能</h2><p>${escapeHtml(skill.description)}</p></div><aside><h3>技能标签</h3>${skill.tags.length ? `<div class="detail-tags">${skill.tags.map((tag) => `<span>${icon('check')}${escapeHtml(tag)}</span>`).join('')}</div>` : '<p>分享者暂未添加标签</p>'}</aside></section>
  </div>`;
}

function messagesView() {
  return `<section class="content-width page-section"><div class="page-title"><div><p class="overline">沟通中心</p><h1>消息</h1><p>直接确认学习目标、时间、地点和费用。</p></div></div>${state.loading ? loadingView() : state.conversations.length ? `<div class="conversation-list">${state.conversations.map((item) => `<a class="conversation-item" href="#/chat/${item.id}">${avatar(item.otherUser, 'avatar-medium')}<div><div class="conversation-name"><strong>${escapeHtml(item.otherUser.displayName)}</strong><time>${formatTime(item.lastMessage?.createdAt || item.updatedAt)}</time></div><span>${escapeHtml(item.skill?.title || '技能沟通')}</span><p>${escapeHtml(item.lastMessage?.body || '会话已建立，发送第一条消息吧')}</p></div>${item.unreadCount ? `<b>${item.unreadCount > 99 ? '99+' : item.unreadCount}</b>` : icon('chevron-right')}</a>`).join('')}</div>` : emptyView('message-square-dashed', '还没有会话', '在技能详情页联系分享者后，会话会出现在这里。', '<a class="button primary" href="#/home">浏览技能</a>')}</section>`;
}

function chatView() {
  if (!state.conversation) return loadingView();
  const other = state.conversation.otherUser;
  return `<section class="chat-page"><header class="chat-top"><div class="content-width"><a class="icon-button" href="#/messages" title="返回消息" aria-label="返回消息">${icon('arrow-left')}</a>${avatar(other, 'avatar-small')}<div><h1>${escapeHtml(other.displayName)}</h1><a href="${state.conversation.skill ? `#/skill/${state.conversation.skill.id}` : '#/messages'}">${escapeHtml(state.conversation.skill?.title || '技能沟通')}</a></div></div></header><div class="chat-scroll" id="chat-scroll"><p class="safety-tip">${icon('shield-alert')} 请勿发送验证码、银行卡密码等敏感信息</p>${state.messages.length ? state.messages.map((message) => `<div class="message-row ${message.senderId === state.user.id ? 'mine' : ''}"><div class="message"><p>${escapeHtml(message.body)}</p><time>${formatTime(message.createdAt)}</time></div></div>`).join('') : `<div class="chat-empty"><span>${icon('messages-square')}</span><h2>开始沟通</h2><p>可以先介绍你的学习目标和方便的时间。</p></div>`}</div><form id="message-form" class="composer"><textarea name="body" rows="1" maxlength="1000" placeholder="输入消息" required></textarea><button class="icon-button send" type="submit" title="发送消息" aria-label="发送消息">${icon('send')}</button></form></section>`;
}

function publishView(route) {
  const skill = route.params.get('id') ? state.mySkills.find((item) => item.id === route.params.get('id')) : null;
  if (route.params.get('id') && !skill) return notFoundView('没有找到可编辑的技能');
  const availability = skill?.availability || { days: [1, 3, 5], start: '19:00', end: '21:00' };
  const field = (key, fallback = '') => escapeHtml(skill?.[key] ?? fallback);
  return `<section class="content-width page-section"><div class="page-title form-title"><div><p class="overline">技能资料</p><h1>${skill ? '编辑技能' : '发布技能'}</h1><p>内容将公开展示，感兴趣的用户可以直接联系你。</p></div><a class="button ghost" href="#/my-skills">取消</a></div><form id="skill-form" class="editor" data-id="${skill?.id || ''}"><div class="editor-fields">
    <fieldset><legend>基本信息</legend><label class="span-2"><span>技能标题</span><input name="title" minlength="4" maxlength="60" value="${field('title')}" placeholder="准确描述你能分享的技能" required /></label><label><span>分类</span><select name="category">${categories.filter(([id]) => id !== 'all').map(([id, name]) => `<option value="${id}" ${skill?.category === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label><span>参考课时费</span><span class="suffix-input"><input name="hourlyRate" type="number" min="0" max="999999" step="0.01" value="${field('hourlyRate', 0)}" required /><em>元 / 小时</em></span></label><label class="span-2"><span>标签</span><input name="tags" value="${escapeHtml((skill?.tags || []).join('，'))}" placeholder="用逗号分隔，最多 8 个" /></label><label class="span-2"><span>详细介绍</span><textarea name="description" minlength="20" maxlength="1200" rows="8" placeholder="介绍内容范围、分享方式、适合人群和预期收获" required>${field('description')}</textarea><small>20-1200 个字符</small></label></fieldset>
    <fieldset><legend>沟通偏好</legend><div class="span-2"><span class="field-label">授课方式</span><div class="mode-picker">${[['online', 'video', '线上'], ['offline', 'map-pin', '线下'], ['both', 'shuffle', '均可']].map(([mode, iconName, label]) => `<label><input type="radio" name="teachingMode" value="${mode}" ${(skill?.teachingMode || 'both') === mode ? 'checked' : ''} /><span>${icon(iconName)}${label}</span></label>`).join('')}</div></div><div class="span-2 map-field"><label><span>授课地点</span><input id="skill-location" name="location" maxlength="120" value="${field('location')}" placeholder="线上授课可留空" data-location-input /></label><input id="skill-location-latitude" name="locationLatitude" type="hidden" value="${field('locationLatitude')}" /><input id="skill-location-longitude" name="locationLongitude" type="hidden" value="${field('locationLongitude')}" /><div class="map-field-actions"><button class="button ghost compact" type="button" data-action="open-location" data-target="skill">${icon('map')}搜索地点</button><button class="button ghost compact" type="button" data-action="current-location" data-target="skill">${icon('locate-fixed')}当前位置</button><span id="skill-location-status" class="coordinate-status ${skill?.locationLatitude != null ? 'active' : ''}">${skill?.locationLatitude != null ? `${icon('badge-check')}已记录地图坐标` : ''}</span></div></div><div class="span-2"><span class="field-label">方便日期</span><div class="day-picker">${weekDays.slice(1).map((day, index) => `<label><input type="checkbox" name="availabilityDays" value="${index + 1}" ${availability.days.includes(index + 1) ? 'checked' : ''} /><span>${day}</span></label>`).join('')}</div></div><label><span>开始时间</span><input name="availabilityStart" type="time" value="${escapeHtml(availability.start || '')}" /></label><label><span>结束时间</span><input name="availabilityEnd" type="time" value="${escapeHtml(availability.end || '')}" /></label></fieldset>
    </div><aside class="publish-aside"><img src="${categoryAsset(skill?.category || 'design')}" alt="" /><div><h2>公开发布</h2><p>发布后技能会出现在广场，其他用户可以向你发起站内会话。</p><button class="button primary large full" type="submit">${skill ? '保存修改' : '确认发布'}</button></div></aside></form></section>`;
}

function mySkillsView() {
  return `<section class="content-width page-section"><div class="page-title"><div><p class="overline">内容管理</p><h1>我的技能</h1><p>维护你正在公开分享的技能。</p></div><a class="button primary" href="#/publish">${icon('plus')}发布技能</a></div>${state.loading ? loadingView() : state.mySkills.length ? `<div class="manage-list">${state.mySkills.map((skill) => `<article><img src="${categoryAsset(skill.category)}" alt="" /><div><span>${escapeHtml(categoryNames[skill.category])}</span><h2><a href="#/skill/${skill.id}">${escapeHtml(skill.title)}</a></h2><p>¥${Number(skill.hourlyRate).toFixed(0)} 参考 / 小时 · ${escapeHtml(modeLabel(skill.teachingMode))}</p></div><div class="row-actions"><a class="icon-button" href="#/publish?id=${skill.id}" title="编辑" aria-label="编辑">${icon('square-pen')}</a><button class="icon-button danger" data-action="delete-skill" data-id="${skill.id}" title="删除" aria-label="删除">${icon('trash-2')}</button></div></article>`).join('')}</div>` : emptyView('layers-3', '还没有发布技能', '把你的经验整理成一项技能，让真正需要的人联系你。', '<a class="button primary" href="#/publish">发布第一个技能</a>')}</section>`;
}

function profileView() {
  return `<div class="profile-page"><section class="profile-hero"><div class="content-width">${avatar(state.user, 'avatar-large')}<div><p class="overline">个人资料</p><h1>${escapeHtml(state.user.displayName)}</h1><p>${escapeHtml(state.user.city || '未填写所在城市')}</p></div><button class="button dark" data-action="edit-profile">${icon('square-pen')}编辑资料</button></div></section><section class="content-width profile-content"><div><h2>个人介绍</h2><p>${escapeHtml(state.user.bio || '暂未填写个人介绍。')}</p></div><aside><div><strong>${state.mySkills.length}</strong><span>公开技能</span></div><div><strong>${state.conversations.length}</strong><span>沟通会话</span></div></aside></section><section class="content-width profile-links"><a href="#/my-skills">${icon('layers-3')}<span><strong>我的技能</strong><small>管理公开内容</small></span>${icon('chevron-right')}</a><a href="#/messages">${icon('message-square')}<span><strong>我的消息</strong><small>继续技能沟通</small></span>${icon('chevron-right')}</a><button data-action="logout">${icon('log-out')}<span><strong>退出登录</strong><small>结束当前会话</small></span>${icon('chevron-right')}</button></section></div>`;
}

function profileDialog() {
  return `<dialog id="profile-dialog" class="dialog"><form id="profile-form"><header><div><h2>编辑个人资料</h2><p>资料会展示给与你沟通的用户。</p></div><button class="icon-button" type="button" data-action="close-dialog" title="关闭" aria-label="关闭">${icon('x')}</button></header><div class="form-stack"><label><span>昵称</span><input name="displayName" minlength="2" maxlength="30" value="${escapeHtml(state.user.displayName)}" required /></label><label><span>城市</span><input name="city" maxlength="40" value="${escapeHtml(state.user.city || '')}" /></label><label><span>个人介绍</span><textarea name="bio" maxlength="500" rows="6">${escapeHtml(state.user.bio || '')}</textarea></label><button class="button primary large full" type="submit">保存资料</button></div></form></dialog>`;
}

function locationDialog() {
  return `<dialog id="location-dialog" class="dialog location-dialog"><form id="location-search-form"><header><div><h2>选择地点</h2><p>高德地图地点数据</p></div><button class="icon-button" type="button" data-action="close-dialog" title="关闭" aria-label="关闭">${icon('x')}</button></header><div class="location-search"><span>${icon('search')}</span><input name="query" maxlength="80" autocomplete="off" placeholder="小区、商圈、学校或地标" aria-label="地点关键词" required /><button class="button primary" type="submit">搜索</button></div><div id="place-results" class="place-results"><div class="place-placeholder">${icon('map-pin')}<span>搜索地点</span></div></div></form></dialog>`;
}

function notFoundView(message = '页面不存在或内容已被删除') {
  return `<section class="status-view"><strong class="status-code">404</strong><h1>${escapeHtml(message)}</h1><a class="button primary" href="#/home">返回技能广场</a></section>`;
}

function render() {
  const route = currentRoute();
  if (state.fatalError) {
    app.innerHTML = shell(errorView(state.fatalError), route.page);
    refreshIcons();
    return;
  }
  if (!state.authChecked) {
    app.innerHTML = shell(loadingView(), route.page);
    refreshIcons();
    return;
  }
  if (protectedPage(route.page) && !state.user) {
    state.pendingPath = `${route.page}${route.id ? `/${route.id}` : ''}${route.params.size ? `?${route.params}` : ''}`;
    app.innerHTML = shell(authView(), 'auth');
    refreshIcons();
    return;
  }
  let content;
  switch (route.page) {
    case 'home': content = homeView(); break;
    case 'auth': content = state.user ? profileView() : authView(); break;
    case 'skill': content = state.loading ? loadingView() : skillDetailView(); break;
    case 'messages': content = messagesView(); break;
    case 'chat': content = state.loading ? loadingView() : chatView(); break;
    case 'publish': content = state.loading ? loadingView() : publishView(route); break;
    case 'my-skills': content = mySkillsView(); break;
    case 'profile': content = state.loading ? loadingView() : profileView(); break;
    default: content = notFoundView();
  }
  const dialogs = `${route.page === 'profile' && state.user ? profileDialog() : ''}${['home', 'publish'].includes(route.page) ? locationDialog() : ''}`;
  app.innerHTML = shell(content, route.page) + dialogs;
  refreshIcons();
}

async function loadHome() {
  state.loading = true;
  render();
  try {
    const params = { sort: state.home.sort };
    if (state.home.search) params.search = state.home.search;
    if (state.home.category !== 'all') params.category = state.home.category;
    if (state.home.mode) params.mode = state.home.mode;
    if (hasHomeLocation()) {
      params.latitude = state.home.latitude;
      params.longitude = state.home.longitude;
      params.maxDistance = state.home.maxDistance;
    }
    const result = await api.skills(params);
    state.skills = result.skills;
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.loading = false;
    render();
  }
}

async function handleRoute() {
  const route = currentRoute();
  if (!state.authChecked) return render();
  if (route.page === 'auth' && state.user) return go('profile');
  if (protectedPage(route.page) && !state.user) return render();
  state.loading = true;
  render();
  try {
    if (route.page === 'home') await loadHome();
    if (route.page === 'skill') state.skill = (await api.skill(route.id)).skill;
    if (route.page === 'messages') state.conversations = (await api.conversations()).conversations;
    if (route.page === 'chat') {
      const result = await api.messages(route.id);
      state.conversation = result.conversation;
      state.messages = result.messages;
    }
    if (route.page === 'publish' || route.page === 'my-skills') state.mySkills = (await api.mySkills()).skills;
    if (route.page === 'profile') {
      const [skills, conversations] = await Promise.all([api.mySkills(), api.conversations()]);
      state.mySkills = skills.skills;
      state.conversations = conversations.conversations;
    }
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      realtime.disconnect();
      state.pendingPath = `${route.page}${route.id ? `/${route.id}` : ''}`;
    } else if (error.status === 404) {
      state.skill = null;
      showToast(error.message, 'error');
    } else showToast(error.message, 'error');
  } finally {
    state.loading = false;
    render();
    if (route.page === 'chat') scrollChat();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function scrollChat() {
  requestAnimationFrame(() => {
    const element = document.querySelector('#chat-scroll');
    if (element) element.scrollTop = element.scrollHeight;
  });
}

function browserLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('当前浏览器不支持定位'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? '请允许浏览器访问位置' : '暂时无法获取当前位置')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  });
}

async function applyLocation(place, target = state.locationPicker.target) {
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const label = locationLabel(place);
  document.querySelector('#location-dialog')?.close();
  if (target === 'home') {
    state.home.locationName = label;
    state.home.latitude = latitude;
    state.home.longitude = longitude;
    state.home.sort = 'distance';
    await loadHome();
    return;
  }
  const locationInput = document.querySelector('#skill-location');
  const latitudeInput = document.querySelector('#skill-location-latitude');
  const longitudeInput = document.querySelector('#skill-location-longitude');
  const status = document.querySelector('#skill-location-status');
  if (locationInput) locationInput.value = label;
  if (latitudeInput) latitudeInput.value = latitude;
  if (longitudeInput) longitudeInput.value = longitude;
  if (status) {
    status.className = 'coordinate-status active';
    status.innerHTML = `${icon('badge-check')}已记录地图坐标`;
    refreshIcons();
  }
}

async function useCurrentLocation(target, button) {
  button.disabled = true;
  try {
    const coordinates = await browserLocation();
    const result = await api.reverseLocation(coordinates.latitude, coordinates.longitude).catch(() => ({
      place: { ...coordinates, name: '我的当前位置', address: '' }
    }));
    await applyLocation(result.place, target);
    showToast('已使用当前位置');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'category') {
    state.home.category = target.dataset.id;
    await loadHome();
  } else if (action === 'open-location') {
    state.locationPicker.target = target.dataset.target;
    const dialog = document.querySelector('#location-dialog');
    dialog?.showModal();
    requestAnimationFrame(() => dialog?.querySelector('input[name="query"]')?.focus());
  } else if (action === 'current-location') {
    await useCurrentLocation(target.dataset.target, target);
  } else if (action === 'select-location') {
    const place = state.locationPicker.places[Number(target.dataset.index)];
    if (place) await applyLocation(place);
  } else if (action === 'clear-location') {
    state.home.locationName = '';
    state.home.latitude = null;
    state.home.longitude = null;
    if (state.home.sort === 'distance') state.home.sort = 'newest';
    await loadHome();
  } else if (action === 'auth-mode') {
    state.authMode = target.dataset.mode;
    render();
  } else if (action === 'toggle-password') {
    const input = target.closest('.password-control').querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
    target.innerHTML = icon(input.type === 'password' ? 'eye' : 'eye-off');
    refreshIcons();
  } else if (action === 'contact') {
    if (!state.user) {
      state.pendingContact = target.dataset.id;
      return go('auth');
    }
    target.disabled = true;
    try {
      const result = await api.startConversation(target.dataset.id);
      go(`chat/${result.conversation.id}`);
    } catch (error) {
      showToast(error.message, 'error');
      target.disabled = false;
    }
  } else if (action === 'delete-skill') {
    if (!window.confirm('确定删除这项技能吗？相关历史会话仍会保留。')) return;
    try {
      await api.deleteSkill(target.dataset.id);
      state.mySkills = state.mySkills.filter((skill) => skill.id !== target.dataset.id);
      showToast('技能已删除');
      render();
    } catch (error) { showToast(error.message, 'error'); }
  } else if (action === 'edit-profile') {
    document.querySelector('#profile-dialog')?.showModal();
  } else if (action === 'close-dialog') {
    target.closest('dialog')?.close();
  } else if (action === 'logout') {
    await api.logout().catch(() => {});
    state.user = null;
    realtime.disconnect();
    showToast('已退出登录');
    go('home');
  } else if (action === 'retry') {
    location.reload();
  }
});

app.addEventListener('change', async (event) => {
  const action = event.target.dataset.action;
  if (action === 'home-mode') {
    state.home.mode = event.target.value;
    await loadHome();
  }
  if (action === 'home-sort') {
    state.home.sort = event.target.value;
    await loadHome();
  }
  if (action === 'home-distance') {
    state.home.maxDistance = Number(event.target.value);
    await loadHome();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.dataset.action === 'home-distance') {
    state.home.maxDistance = Number(event.target.value);
    event.target.nextElementSibling.textContent = `${state.home.maxDistance} km`;
  }
  if (event.target.matches('[data-location-input]')) {
    const latitude = document.querySelector('#skill-location-latitude');
    const longitude = document.querySelector('#skill-location-longitude');
    const status = document.querySelector('#skill-location-status');
    if (latitude) latitude.value = '';
    if (longitude) longitude.value = '';
    if (status) { status.className = 'coordinate-status'; status.textContent = ''; }
  }
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  if (form.id === 'search-form') {
    state.home.search = String(data.get('search') || '').trim();
    return loadHome();
  }
  if (form.id === 'location-search-form') {
    const results = form.querySelector('#place-results');
    const query = String(data.get('query') || '').trim();
    submit?.setAttribute('disabled', '');
    results.innerHTML = `<div class="place-placeholder"><span class="loader"></span><span>正在搜索</span></div>`;
    try {
      const result = await api.places(query, state.user?.city || '');
      state.locationPicker.places = result.places;
      results.innerHTML = result.places.length ? result.places.map((place, index) => `<button class="place-result" type="button" data-action="select-location" data-index="${index}"><span>${icon('map-pin')}</span><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.address || place.city || '地址信息暂缺')}</small></span>${icon('chevron-right')}</button>`).join('') : `<div class="place-placeholder">${icon('map-pin-off')}<span>没有找到相关地点</span></div>`;
      refreshIcons();
    } catch (error) {
      results.innerHTML = `<div class="place-placeholder error">${icon('triangle-alert')}<span>${escapeHtml(error.message)}</span></div>`;
      refreshIcons();
    } finally {
      submit?.removeAttribute('disabled');
    }
    return;
  }
  submit?.setAttribute('disabled', '');
  try {
    if (form.id === 'auth-form') {
      const payload = { account: data.get('account'), password: data.get('password'), displayName: data.get('displayName') };
      const result = state.authMode === 'login' ? await api.login(payload) : await api.register(payload);
      state.user = result.user;
      realtime.connect();
      showToast(state.authMode === 'login' ? '登录成功' : '账号创建成功');
      if (state.pendingContact) {
        const skillId = state.pendingContact;
        state.pendingContact = '';
        const conversation = await api.startConversation(skillId);
        go(`chat/${conversation.conversation.id}`);
      } else {
        const path = state.pendingPath || 'home';
        state.pendingPath = '';
        go(path);
      }
    } else if (form.id === 'skill-form') {
      const payload = {
        title: data.get('title'), category: data.get('category'), hourlyRate: Number(data.get('hourlyRate')),
        teachingMode: data.get('teachingMode'), location: data.get('location'),
        locationLatitude: data.get('locationLatitude'), locationLongitude: data.get('locationLongitude'),
        tags: String(data.get('tags') || '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
        description: data.get('description'), availabilityDays: data.getAll('availabilityDays').map(Number),
        availabilityStart: data.get('availabilityStart'), availabilityEnd: data.get('availabilityEnd')
      };
      const id = form.dataset.id;
      if (id) await api.updateSkill(id, payload); else await api.createSkill(payload);
      showToast(id ? '技能已更新' : '技能已发布');
      go('my-skills');
    } else if (form.id === 'message-form') {
      const route = currentRoute();
      const result = await api.sendMessage(route.id, String(data.get('body') || ''));
      if (!state.messages.some((message) => message.id === result.message.id)) state.messages.push(result.message);
      form.reset();
      render();
      scrollChat();
    } else if (form.id === 'profile-form') {
      const result = await api.updateProfile({ displayName: data.get('displayName'), city: data.get('city'), bio: data.get('bio') });
      state.user = result.user;
      document.querySelector('#profile-dialog')?.close();
      showToast('资料已保存');
      render();
    }
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '操作失败，请稍后重试';
    showToast(message, 'error');
    submit?.removeAttribute('disabled');
  }
});

window.addEventListener('hashchange', handleRoute);

try {
  const result = await api.me();
  state.user = result.user;
  if (state.user) realtime.connect();
} catch (error) {
  state.fatalError = error.message;
} finally {
  state.authChecked = true;
}
await handleRoute();
