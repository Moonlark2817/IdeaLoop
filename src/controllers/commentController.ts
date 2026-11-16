import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import { projectId } from './projectValidation.js';
import { pagination } from './userValidation.js';
import { commentId, commentInput } from './commentValidation.js';

export function createCommentController(db: Kysely<Database>) {
  async function assertProject(id: number) {
    if (!await db.selectFrom('projects').select('id').where('id', '=', id).executeTakeFirst()) {
      throw new HttpError(404, 'Project not found');
    }
  }
  async function find(project: number, id: number) {
    await assertProject(project);
    const comment = await db.selectFrom('project_comments').selectAll()
      .where('project_id', '=', project).where('id', '=', id).executeTakeFirst();
    if (!comment) throw new HttpError(404, 'Comment not found');
    return comment;
  }
  const create: RequestHandler = async (req, res) => {
    const project = projectId(req.params.projectId);
    const input = commentInput(req.body);
    const userId = res.locals.userId as number;
    let comment;
    try {
      comment = await db.transaction().execute(async trx => {
        // Keep the project and parent alive until the new comment is inserted.
        const existing = await trx.selectFrom('projects').select('id').where('id', '=', project)
          .forKeyShare().executeTakeFirst();
        if (!existing) throw new HttpError(404, 'Project not found');
        if (input.parent_comment_id !== null) {
          const parent = await trx.selectFrom('project_comments').select(['id', 'project_id'])
            .where('id', '=', input.parent_comment_id).forKeyShare().executeTakeFirst();
          if (!parent) throw new HttpError(404, 'Parent comment not found');
          if (parent.project_id !== project) throw new HttpError(400, 'Parent comment must belong to the same project');
        }
        return trx.insertInto('project_comments').values({ ...input, user_id: userId, project_id: project })
          .returningAll().executeTakeFirstOrThrow();
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23503') {
        const user = await db.selectFrom('users').select('id').where('id', '=', userId).executeTakeFirst();
        if (!user) throw new HttpError(401, 'Invalid or expired access token');
        await assertProject(project);
        throw new HttpError(404, 'Parent comment not found');
      }
      throw error;
    }
    res.status(201).location(`/api/projects/${project}/comments/${comment.id}`).json({ comment });
  };
  const list: RequestHandler = async (req, res) => {
    const project = projectId(req.params.projectId);
    const limit = pagination(req.query.limit, 20, 100);
    const offset = pagination(req.query.offset, 0, 2147483647);
    await assertProject(project);
    const comments = await db.selectFrom('project_comments').selectAll().where('project_id', '=', project)
      .orderBy('id').limit(limit).offset(offset).execute();
    res.json({ comments, pagination: { limit, offset } });
  };
  const get: RequestHandler = async (req, res) => {
    res.json({ comment: await find(projectId(req.params.projectId), commentId(req.params.commentId)) });
  };
  const update: RequestHandler = async (req, res) => {
    const project = projectId(req.params.projectId);
    const id = commentId(req.params.commentId);
    const userId = res.locals.userId as number;
    const existing = await find(project, id);
    if (existing.user_id !== userId) throw new HttpError(403, 'You can only modify your own comments');
    const { content } = commentInput(req.body, true);
    const comment = await db.updateTable('project_comments').set({ content, updated_at: new Date() })
      .where('id', '=', id).where('project_id', '=', project).where('user_id', '=', userId)
      .returningAll().executeTakeFirst();
    if (!comment) throw new HttpError(404, 'Comment not found');
    res.json({ comment });
  };
  const remove: RequestHandler = async (req, res) => {
    const project = projectId(req.params.projectId);
    const id = commentId(req.params.commentId);
    const userId = res.locals.userId as number;
    const existing = await find(project, id);
    if (existing.user_id !== userId) throw new HttpError(403, 'You can only modify your own comments');
    const result = await db.deleteFrom('project_comments').where('id', '=', id)
      .where('project_id', '=', project).where('user_id', '=', userId).executeTakeFirst();
    if (result.numDeletedRows === 0n) throw new HttpError(404, 'Comment not found');
    res.status(204).end();
  };
  return { create, list, get, update, remove };
}
