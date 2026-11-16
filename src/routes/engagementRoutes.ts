import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { createEngagementController } from '../controllers/engagementController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

function mutationLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { message: 'Too many like or save changes; try again later' } },
  });
}

export function createEngagementRoutes(db: Kysely<Database>, secret: string) {
  const routes = Router({ mergeParams: true });
  const controller = createEngagementController(db);
  const authenticate = requireAuth(db, secret);
  const optionalAuth: RequestHandler = (req, res, next) =>
    req.get('authorization') ? authenticate(req, res, next) : next();
  const limit = mutationLimit();

  routes.get('/', optionalAuth, controller.get);
  routes.put('/like', limit, authenticate, controller.like);
  routes.delete('/like', limit, authenticate, controller.unlike);
  routes.put('/save', limit, authenticate, controller.save);
  routes.delete('/save', limit, authenticate, controller.unsave);
  return routes;
}

export function createSavedProjectRoutes(db: Kysely<Database>, secret: string) {
  const routes = Router();
  routes.get('/', requireAuth(db, secret), createEngagementController(db).listSaved);
  return routes;
}
