import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { createCommentController } from '../controllers/commentController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export function createCommentRoutes(db: Kysely<Database>, secret: string) {
  const routes = Router({ mergeParams: true });
  const controller = createCommentController(db);
  const authenticate = requireAuth(db, secret);
  const mutationLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { message: 'Too many comment changes; try again later' } },
  });
  routes.get('/', controller.list);
  routes.get('/:commentId', controller.get);
  routes.post('/', mutationLimit, authenticate, controller.create);
  routes.patch('/:commentId', mutationLimit, authenticate, controller.update);
  routes.delete('/:commentId', mutationLimit, authenticate, controller.remove);
  return routes;
}
