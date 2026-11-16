
import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';

import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import { projectId } from './projectValidation.js';

export function createProjectTagController(db: Kysely<Database>) {

  async function fetchAssociations(id: number) {
    const tags = await db
      .selectFrom('project_tags')
      .innerJoin('tags', 'tags.id', 'project_tags.tag_id')
      .select(['tags.id', 'tags.name'])
      .where('project_tags.project_id', '=', id)
      .orderBy('tags.name')
      .execute();

    const skills = await db
      .selectFrom('project_skills')
      .innerJoin('skills', 'skills.id', 'project_skills.skill_id')
      .select(['skills.id', 'skills.name', 'skills.category'])
      .where('project_skills.project_id', '=', id)
      .orderBy('skills.name')
      .execute();

    return { tags, skills };
  }


  // GET /api/projects/tags/catalog
  const catalog: RequestHandler = async (_req, res) => {
    const tags = await db
      .selectFrom('tags')
      .select(['id', 'name'])
      .orderBy('name')
      .execute();

    res.json({ tags });
  };




  // GET /api/projects/:id/tags
  const list: RequestHandler = async (req, res) => {
    const id = projectId(req.params.id);

    const project = await db
      .selectFrom('projects')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();

    if (!project) {
      throw new HttpError(404, 'Project not found');
    }

    res.json(await fetchAssociations(id));
  };

  // PUT /api/projects/:id/tags
  const replace: RequestHandler = async (req, res) => {
    const id = projectId(req.params.id);
    const userId = res.locals.userId as number;

    const body: unknown = req.body;

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !['tag_ids', 'skill_ids'].includes(key)
      )
    ) {
      throw new HttpError(400, 'Invalid tags and skills request');
    }

    const input = body as Record<string, unknown>;

    function validIds(value: unknown): value is number[] {
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(
          (item) =>
            typeof item === 'number' &&
            Number.isInteger(item) &&
            item > 0 &&
            item <= 2147483647
        ) &&
        new Set(value).size === value.length
      );
    }

    if (!validIds(input.tag_ids) || !validIds(input.skill_ids)) {
      throw new HttpError(
        400,
        'tag_ids and skill_ids must contain unique valid IDs'
      );
    }

    const tagIds = input.tag_ids;
    const skillIds = input.skill_ids;

    await db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .select(['id', 'user_id'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new HttpError(404, 'Project not found');
      }

      if (project.user_id !== userId) {
        throw new HttpError(
          403,
          'You can only modify your own projects'
        );
      }

      if (tagIds.length > 0) {
        const tags = await trx
          .selectFrom('tags')
          .select('id')
          .where('id', 'in', tagIds)
          .execute();

        if (tags.length !== tagIds.length) {
          throw new HttpError(400, 'One or more tags do not exist');
        }
      }

      if (skillIds.length > 0) {
        const skills = await trx
          .selectFrom('skills')
          .select('id')
          .where('id', 'in', skillIds)
          .execute();

        if (skills.length !== skillIds.length) {
          throw new HttpError(400, 'One or more skills do not exist');
        }
      }

      await trx
        .deleteFrom('project_tags')
        .where('project_id', '=', id)
        .execute();

      await trx
        .deleteFrom('project_skills')
        .where('project_id', '=', id)
        .execute();

      if (tagIds.length > 0) {
        await trx
          .insertInto('project_tags')
          .values(
            tagIds.map((tagId) => ({
              project_id: id,
              tag_id: tagId,
            }))
          )
          .execute();
      }

      if (skillIds.length > 0) {
        await trx
          .insertInto('project_skills')
          .values(
            skillIds.map((skillId) => ({
              project_id: id,
              skill_id: skillId,
            }))
          )
          .execute();
      }
    });

    res.json(await fetchAssociations(id));
  };

    return { catalog, list, replace };

}
