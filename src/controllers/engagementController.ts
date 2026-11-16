import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import { projectId } from './projectValidation.js';
import { pagination } from './userValidation.js';

type EngagementTable = 'project_likes' | 'saved_projects';

export function createEngagementController(db: Kysely<Database>) {
  async function assertProject(id: number) {
    if (!await db.selectFrom('projects').select('id').where('id', '=', id).executeTakeFirst()) {
      throw new HttpError(404, 'Project not found');
    }
  }

  // Like/save counts for a project, plus whether the signed-in user has liked/saved it.
  async function summary(project: number, userId?: number) {
    const [likes, saves] = await Promise.all(
      (['project_likes', 'saved_projects'] as const).map(table =>
        db.selectFrom(table).select(eb => eb.fn.countAll<string>().as('count'))
          .where('project_id', '=', project).executeTakeFirstOrThrow()),
    );
    let liked = false;
    let saved = false;
    if (userId !== undefined) {
      const [like, save] = await Promise.all(
        (['project_likes', 'saved_projects'] as const).map(table =>
          db.selectFrom(table).select('user_id').where('project_id', '=', project)
            .where('user_id', '=', userId).executeTakeFirst()),
      );
      liked = like !== undefined;
      saved = save !== undefined;
    }
    return { likes: Number(likes!.count), saves: Number(saves!.count), liked, saved };
  }

  // GET /api/projects/:projectId/engagement
  const get: RequestHandler = async (req, res) => {
    const project = projectId(req.params.projectId);
    await assertProject(project);
    res.json({ engagement: await summary(project, res.locals.userId as number | undefined) });
  };

  // PUT adds and DELETE removes; both are safe to repeat.
  function toggle(table: EngagementTable, on: boolean): RequestHandler {
    return async (req, res) => {
      const project = projectId(req.params.projectId);
      const userId = res.locals.userId as number;
      await assertProject(project);
      if (on) {
        try {
          await db.insertInto(table).values({ user_id: userId, project_id: project })
            .onConflict(oc => oc.columns(['user_id', 'project_id']).doNothing()).execute();
        } catch (err) {
          // The project was deleted between the check and the insert.
          if ((err as { code?: string } | null)?.code === '23503') throw new HttpError(404, 'Project not found');
          throw err;
        }
      } else {
        await db.deleteFrom(table).where('user_id', '=', userId).where('project_id', '=', project).execute();
      }
      res.json({ engagement: await summary(project, userId) });
    };
  }

  // GET /api/saved-projects — the signed-in user's saved projects, most recently saved first.
  const listSaved: RequestHandler = async (req, res) => {
    const limit = pagination(req.query.limit, 20, 100);
    const offset = pagination(req.query.offset, 0, 2147483647);
    const rows = await db.selectFrom('saved_projects')
      .innerJoin('projects', 'projects.id', 'saved_projects.project_id')
      .selectAll('projects')
      .select('saved_projects.created_at as saved_at')
      .where('saved_projects.user_id', '=', res.locals.userId as number)
      .orderBy('saved_projects.created_at', 'desc').orderBy('projects.id', 'desc')
      .limit(limit + 1).offset(offset).execute();
    res.json({ projects: rows.slice(0, limit), pagination: { limit, offset, has_more: rows.length > limit } });
  };

  return {
    get,
    like: toggle('project_likes', true),
    unlike: toggle('project_likes', false),
    save: toggle('saved_projects', true),
    unsave: toggle('saved_projects', false),
    listSaved,
  };
}
