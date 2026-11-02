import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import { pagination } from './userValidation.js';
import { projectId, projectInput } from './projectValidation.js';

export function createProjectController(db: Kysely<Database>) {
  async function find(id: number) {
    const project = await db.selectFrom('projects').selectAll().where('id', '=', id).executeTakeFirst();
    if (!project) throw new HttpError(404, 'Project not found');
    return project;
  }
  async function assertOwner(id: number, userId: number) {
    const project = await find(id);
    if (project.user_id !== userId) throw new HttpError(403, 'You can only modify your own projects');
  }
  const create: RequestHandler = async (req, res) => {
    const input = projectInput(req.body);
    const project = await db.insertInto('projects').values({
      ...input, title: input.title!, description: input.description!,
      project_url: input.project_url ?? null, is_seeking_collaborators: input.is_seeking_collaborators ?? false,
      user_id: res.locals.userId as number,
    }).returningAll().executeTakeFirstOrThrow();
    res.status(201).location(`/api/projects/${project.id}`).json({ project });
  };
  const list: RequestHandler = async (req, res) => {
    const limit = pagination(req.query.limit, 20, 100);
    const offset = pagination(req.query.offset, 0, 2147483647);
    const projects = await db.selectFrom('projects').selectAll().orderBy('id').limit(limit).offset(offset).execute();
    res.json({ projects, pagination: { limit, offset } });
  };
  const get: RequestHandler = async (req, res) => {
    res.json({ project: await find(projectId(req.params.id)) });
  };
  const update: RequestHandler = async (req, res) => {
    const id = projectId(req.params.id);
    const userId = res.locals.userId as number;
    await assertOwner(id, userId);
    const input = projectInput(req.body, true);
    const project = await db.updateTable('projects').set({ ...input, updated_at: new Date() })
      .where('id', '=', id).where('user_id', '=', userId).returningAll().executeTakeFirst();
    if (!project) throw new HttpError(404, 'Project not found');
    res.json({ project });
  };
  const remove: RequestHandler = async (req, res) => {
    const id = projectId(req.params.id);
    const userId = res.locals.userId as number;
    await assertOwner(id, userId);
    const result = await db.deleteFrom('projects').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst();
    if (result.numDeletedRows === 0n) throw new HttpError(404, 'Project not found');
    res.status(204).end();
  };
  return { create, list, get, update, remove };
}
