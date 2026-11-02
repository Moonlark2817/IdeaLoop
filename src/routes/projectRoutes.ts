import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { createProjectController } from '../controllers/projectController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export function createProjectRoutes(db: Kysely<Database>, secret: string) {
  const projects = Router();

  const controller = createProjectController(db);
  const authenticate = requireAuth(db, secret);

  const mutationLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { message: 'Too many project changes; try again later' },
    },
  });

  projects.get('/', controller.list);
  projects.get('/:id', controller.get);

  projects.post('/', mutationLimit, authenticate, controller.create);
  projects.patch('/:id', mutationLimit, authenticate, controller.update);
  projects.delete('/:id', mutationLimit, authenticate, controller.remove);

  return projects;
}