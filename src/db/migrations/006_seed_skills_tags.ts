import type { Kysely } from 'kysely';
import { runSql } from '../run-sql.js';

const statements = `
INSERT INTO skills (name, category)
VALUES
  ('Digital Art', 'Art'),
  ('Python', 'Programming'),
  ('Game Development', 'Technology')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tags (name)
VALUES
  ('Animation'),
  ('Game Development'),
  ('Web Development')
ON CONFLICT (name) DO NOTHING;
`;

export async function up(db: Kysely<any>): Promise<void> {
  await runSql(db, statements);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Keep existing catalog entries to avoid deleting
  // skills and tags used by projects or profiles.
}
