# 我的技能分你一半 - Web 全栈应用

该目录是与微信小程序完全分离的 Web 应用，包含独立前端、后端、PostgreSQL 数据库结构和生产部署配置。数据库默认为空，不包含演示账号、技能或消息。

## 目录

```text
frontend/    Vite SPA、响应式界面、WebSocket 客户端
backend/     Node.js API、认证、Session、限流、实时消息、备份调度
database/    PostgreSQL migration、数据目录、备份与恢复脚本
deployment/  Docker Compose、Caddy HTTPS、容器构建配置
```

## 本地运行

需要 Node.js 20 或更高版本。无需预装 PostgreSQL；未配置 `DATABASE_URL` 时，后端使用持久化 PGlite PostgreSQL 引擎，数据写入 `database/data/pglite/`。

```bash
npm install
npm run dev
```

打开：`http://127.0.0.1:4180`

前端由 Vite 提供，`/api` 与 `/ws` 自动代理至 `http://127.0.0.1:3100`。

## 高德地图与距离筛选

地点搜索和逆地理编码使用高德地图 Web 服务 API。高德 Key 只保存在后端环境变量中，不会进入前端构建产物。

1. 在高德开放平台控制台创建应用。
2. 添加一个类型为“Web 服务”的 Key。
3. 在项目根目录 `.env` 中设置 `AMAP_WEB_SERVICE_KEY=你的Key`。
4. 重启 `npm run dev`。

发布技能时选择的地点名称、纬度和经度会持久化到 PostgreSQL。技能广场以用户选择的地点或浏览器当前位置为中心，由 PostgreSQL 实时执行 1-50 km 半径筛选和距离排序。浏览器定位在本地 `127.0.0.1` 可用，生产环境必须使用 HTTPS。

## 生产部署

1. 将 `.env.example` 复制为 `.env`。
2. 设置真实 `DOMAIN`、高强度 `POSTGRES_PASSWORD` 和 `AMAP_WEB_SERVICE_KEY`。
3. 将域名 A/AAAA 记录指向服务器，开放 TCP 80/443 与 UDP 443。
4. 启动服务：

```bash
docker compose --env-file .env -f deployment/docker-compose.yml up -d --build
```

Caddy 会自动申请并续期 HTTPS 证书。PostgreSQL 数据保存在 `database/data/postgres/`，备份保存在 `database/backups/`，证书状态保存在 `deployment/data/`。

## 安全与持久化

- 密码使用 Node.js `scrypt` 加盐哈希。
- Session 使用随机 token；数据库仅保存 SHA-256 token hash。
- Session、登录失败次数和限流窗口均持久化在 PostgreSQL。
- Cookie 使用 `HttpOnly`、`SameSite=Strict`；生产环境启用 `Secure`。
- 写请求校验 `Origin`，HTTP 响应启用 Helmet 安全头。
- WebSocket 连接使用同一持久化 Session 鉴权。
- 生产环境默认每 24 小时执行 `pg_dump`，本地 PGlite 使用压缩目录归档；备份默认保留 14 天。

手工备份和恢复：

```bash
# 当前运行模式自动选择 pg_dump 或 PGlite 压缩归档
npm run backup

# 标准 PostgreSQL
DATABASE_URL=postgresql://... database/scripts/backup.sh
DATABASE_URL=postgresql://... database/scripts/restore.sh database/backups/skill-share-xxx.dump

# 本地 PGlite，恢复前先停止开发服务器
npm run restore:pglite -- database/backups/skill-share-xxx.tar.gz
```

也可在不使用 Caddy 时通过 `TLS_KEY_PATH` 和 `TLS_CERT_PATH` 让 Node 直接监听 HTTPS。
