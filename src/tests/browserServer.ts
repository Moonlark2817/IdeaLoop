
import { PGlite } from '@electric-sql/pglite';
import {
  Kysely,
  PostgresDialect,
  sql,
  type PostgresPoolClient,
} from 'kysely';
import type { Database } from '../db/types.js';
import { createApp } from '../app.js';
import { up as usersMigration } from '../db/migrations/001_users_skills.js';
import { up as projectsMigration } from '../db/migrations/002_projects_media.js';
import { up as engagementMigration } from '../db/migrations/003_engagement.js';
import { up as requestsMigration } from '../db/migrations/004_requests.js';
import { up as identityMigration } from '../db/migrations/005_user_identity.js';


const secret = 'isolated-browser-test-secret-at-least-32-characters';
  const postgres = new PGlite();

  // Use the same embedded PostgreSQL adapter as users.test.ts.
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: {
        options: {},
        connect: async () => ({
          query: async (query: string, parameters: readonly unknown[]) => {
            const result = await postgres.query(query, [...parameters]);
            return {
              rows: result.rows,
              rowCount: result.affectedRows ?? result.rows.length,
              command:
                /^(insert|update|delete|merge)/i.exec(query)?.[1]?.toUpperCase()
                ?? 'SELECT',
            };
          },
          release() {},
        }) as PostgresPoolClient,
        end: () => postgres.close(),
      },
    }),
  });


async function start() {
 for (const migrate of [usersMigration, projectsMigration, engagementMigration, requestsMigration, identityMigration]) await migrate(db);
 const app = createApp({checkDatabase: async () => {await sql`select 1`.execute(db);}, users:{db,jwtSecret:secret}});
 const server = app.listen(5001, '127.0.0.1', () => console.log('Isolated browser API listening on 5001'));
 async function stop() {server.close(async () => {await db.destroy(); process.exit(0);});}
 process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
void start().catch(error => {console.error(error); process.exit(1);});
