import { existsSync } from 'node:fs';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config/index.js';
import { authRoutes } from './http/auth-routes.js';
import { profileRoutes } from './http/profile-routes.js';
import { skillRoutes } from './http/skill-routes.js';
import { messageRoutes } from './http/message-routes.js';
import { mapRoutes } from './http/map-routes.js';
import {
  authenticate, errorHandler, notFound, requireAuth, sameOrigin
} from './http/middleware.js';
import { asyncRoute } from './http/errors.js';

export function createApp(database, realtimeHub) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(compression());
  app.use(express.json({ limit: '96kb' }));
  app.use('/api', sameOrigin);
  app.use(authenticate(database));

  app.get('/api/health', asyncRoute(async (_request, response) => {
    await database.query('SELECT 1');
    response.json({ status: 'ok', database: database.kind, time: new Date().toISOString() });
  }));
  app.use('/api/auth', authRoutes(database));
  app.use('/api/profile', requireAuth, profileRoutes(database));
  app.use('/api/skills', skillRoutes(database));
  app.use('/api/map', mapRoutes());
  app.use('/api/conversations', messageRoutes(database, realtimeHub));

  app.use('/api', notFound);
  if (existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: config.environment === 'production' ? '1h' : 0 }));
    app.get('*path', (_request, response) => response.sendFile(`${config.frontendDist}/index.html`));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
