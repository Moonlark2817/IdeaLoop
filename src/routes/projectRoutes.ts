import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

import { createProjectController } from '../controllers/projectController.js';

import { createProjectTagController } from '../controllers/projectTagController.js';

import {
  createProjectMediaController,
  uploadProjectImage,
} from '../controllers/projectMediaController.js';

import { requireAuth } from '../middleware/authMiddleware.js';

export function createProjectRoutes(db: Kysely<Database>, secret: string) {
  const routes = Router();
  const controller = createProjectController(db);
  const tagController = createProjectTagController(db);
  const mediaController = createProjectMediaController(db);
  const authenticate = requireAuth(db, secret);
  const mutationLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { message: 'Too many project changes; try again later' } },
  });
  routes.get('/', controller.list);

  routes.get('/tags/catalog', tagController.catalog);

  routes.get('/:id', controller.get);
  routes.get('/:id/tags', tagController.list);
  routes.put('/:id/tags', mutationLimit, authenticate, tagController.replace);
  routes.post('/', mutationLimit, authenticate, controller.create);
  routes.patch('/:id', mutationLimit, authenticate, controller.update);
  routes.delete('/:id', mutationLimit, authenticate, controller.remove);
  return routes;
}
