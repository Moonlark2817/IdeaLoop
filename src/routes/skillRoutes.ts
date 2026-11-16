import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';

const MAX_QUERY_LENGTH = 100;

export function createSkillRoutes(db: Kysely<Database>) {
  const skills = Router();

  skills.get('/', async (req, res) => {
    const raw = req.query.q;
    if (raw !== undefined && typeof raw !== 'string') throw new HttpError(400, 'q must be a single value');
    const q = (raw ?? '').trim();
    if (q.length > MAX_QUERY_LENGTH) throw new HttpError(400, `q must be ${MAX_QUERY_LENGTH} characters or fewer`);

    let query = db.selectFrom('skills').select(['id', 'name', 'category']).orderBy('name').orderBy('id');
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) => eb.or([eb('name', 'ilike', pattern), eb('category', 'ilike', pattern)]));
    }
    res.json({ skills: await query.execute() });
  });

  return skills;
}
