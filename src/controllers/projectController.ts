import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import * as validate from './projectValidation.js';

const projectFields = [
  'id',
  'user_id',
  'title',
  'description',
  'project_url',
  'is_seeking_collaborators',
  'created_at',
  'updated_at',
] as const;

export function createProjectController(db: Kysely<Database>) {
  const list: RequestHandler = async (_req, res) => {
    const projects = await db
      .selectFrom('projects')
      .select(projectFields)
      .orderBy('created_at', 'desc')
      .execute();

    res.json({ projects });
  };

  const get: RequestHandler = async (req, res) => {
    const id = validate.projectId(req.params.id);

    const project = await db
      .selectFrom('projects')
      .select(projectFields)
      .where('id', '=', id)
      .executeTakeFirst();

    if (!project) {
      throw new HttpError(404, 'Project not found');
    }

    res.json({ project });
  };

  const create: RequestHandler = async (req, res) => {
    const body = validate.objectBody(req.body, [
      'title',
      'description',
      'project_url',
      'is_seeking_collaborators',
    ]);

    const input = {
      user_id: res.locals.userId as number,
      title: validate.title(body.title),
      description: validate.description(body.description),
      project_url:
        body.project_url === undefined
          ? null
          : validate.projectUrl(body.project_url),
      is_seeking_collaborators:
        body.is_seeking_collaborators === undefined
          ? false
          : validate.seekingCollaborators(body.is_seeking_collaborators),
    };

    const project = await db
      .insertInto('projects')
      .values(input)
      .returning(projectFields)
      .executeTakeFirstOrThrow();

    res
      .status(201)
      .location(`/api/projects/${project.id}`)
      .json({ project });
  };

  const update: RequestHandler = async (req, res) => {
    const id = validate.projectId(req.params.id);
    const userId = res.locals.userId as number;

    const existing = await db
      .selectFrom('projects')
      .select(['id', 'user_id'])
      .where('id', '=', id)
      .executeTakeFirst();

    if (!existing) {
      throw new HttpError(404, 'Project not found');
    }

    if (existing.user_id !== userId) {
      throw new HttpError(403, 'You can only edit your own projects');
    }

    const body = validate.objectBody(req.body, [
      'title',
      'description',
      'project_url',
      'is_seeking_collaborators',
    ]);

    const updates: {
      title?: string;
      description?: string;
      project_url?: string | null;
      is_seeking_collaborators?: boolean;
      updated_at?: Date;
    } = {};

    if (body.title !== undefined) {
      updates.title = validate.title(body.title);
    }

    if (body.description !== undefined) {
      updates.description = validate.description(body.description);
    }

    if (body.project_url !== undefined) {
      updates.project_url = validate.projectUrl(body.project_url);
    }

    if (body.is_seeking_collaborators !== undefined) {
      updates.is_seeking_collaborators =
        validate.seekingCollaborators(body.is_seeking_collaborators);
    }

    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, 'Provide at least one field to update');
    }

    updates.updated_at = new Date();

    const project = await db
      .updateTable('projects')
      .set(updates)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returning(projectFields)
      .executeTakeFirst();

    if (!project) {
      throw new HttpError(404, 'Project not found');
    }

    res.json({ project });
  };

  const remove: RequestHandler = async (req, res) => {
    const id = validate.projectId(req.params.id);
    const userId = res.locals.userId as number;

    const existing = await db
      .selectFrom('projects')
      .select(['id', 'user_id'])
      .where('id', '=', id)
      .executeTakeFirst();

    if (!existing) {
      throw new HttpError(404, 'Project not found');
    }

    if (existing.user_id !== userId) {
      throw new HttpError(403, 'You can only delete your own projects');
    }

    await db
      .deleteFrom('projects')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();

    res.status(204).end();
  };

  return { list, get, create, update, remove };
}