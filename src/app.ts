import express from 'express';
import { resolve } from 'node:path';
import type { Kysely } from 'kysely';
import type { Database } from './db/types.js';

import { createUserRoutes } from './routes/userRoutes.js';
import { createCommentRoutes } from './routes/commentRoutes.js';
import { createProjectRoutes } from './routes/projectRoutes.js';
import { createSkillRoutes } from './routes/skillRoutes.js';

import {
  createErrorHandler,
  notFound,
} from './middleware/errorHandler.js';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  production?: boolean;
  users?: {
    db: Kysely<Database>;
    jwtSecret: string;
  };
}

export function createApp({
  checkDatabase,
  production = false,
  users,
}: AppOptions) {
  const app = express();

  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/uploads',
    express.static(resolve(process.cwd(), 'uploads'), {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health/ready', async (_req, res) => {
    try {
      await checkDatabase();

      res.json({
        status: 'ok',
        database: 'connected',
      });
    } catch {
      res.status(503).json({
        status: 'unavailable',
        database: 'disconnected',
      });
    }
  });

  if (users) {
    const routes = createUserRoutes(users.db, users.jwtSecret);
    app.use('/api/users', routes.users);
    app.use('/api/auth', routes.auth);
    app.use('/api/skills', createSkillRoutes(users.db));
    app.use('/api/projects/:projectId/comments', createCommentRoutes(users.db, users.jwtSecret));
    app.use('/api/projects', createProjectRoutes(users.db, users.jwtSecret));
  }

  app.use(notFound);
  app.use(createErrorHandler(production));

  return app;
}
