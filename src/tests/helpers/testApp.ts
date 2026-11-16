import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Express } from 'express';
import type { TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { Kysely, PostgresDialect, sql, type PostgresPoolClient } from 'kysely';
import type { Database } from '../../db/types.js';
import { createApp } from '../../app.js';
import { hashPassword } from '../../security/password.js';
import { issueToken } from '../../security/token.js';
import { up as users } from '../../db/migrations/001_users_skills.js';
import { up as projects } from '../../db/migrations/002_projects_media.js';
import { up as engagement } from '../../db/migrations/003_engagement.js';
import { up as requests } from '../../db/migrations/004_requests.js';
import { up as identity } from '../../db/migrations/005_user_identity.js';

export const testSecret = 'isolated-backend-tests-secret-at-least-32-characters';
export const testPassword = 'backend-test-password';

export async function startHttpServer(app: Express) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

/** A fresh database, real migrations, and fresh rate limiters for each test. */
export async function createTestApp(t: TestContext, production = true) {
  const postgres = new PGlite();
  const db = new Kysely<Database>({dialect: new PostgresDialect({pool: {
    options: {},
    connect: async () => ({
      query: async (query: string, parameters: readonly unknown[]) => {
        const result = await postgres.query(query, [...parameters]);
        return {rows: result.rows, rowCount: result.affectedRows ?? result.rows.length,
          command: /^(insert|update|delete|merge)/i.exec(query)?.[1]?.toUpperCase() ?? 'SELECT'};
      },
      release() {},
    }) as PostgresPoolClient,
    end: () => postgres.close(),
  }})});
  let http: Awaited<ReturnType<typeof startHttpServer>>;
  try {
    for (const migrate of [users, projects, engagement, requests, identity]) await migrate(db);
    http = await startHttpServer(createApp({production, users: {db, jwtSecret: testSecret}, checkDatabase: async () => {await sql`select 1`.execute(db);}}));
  } catch (error) {
    await db.destroy();
    throw error;
  }
  t.after(async () => {try {await http.close();} finally {await db.destroy();}});

  async function request(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
    const response = await fetch(`${http.base}${path}`, {
      method,
      headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(token ? {Authorization: `Bearer ${token}`} : {}), ...headers},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    return {status: response.status, headers: response.headers,
      body: response.status === 204 ? null : await response.json() as any};
  }
  async function createUser(username = 'TestUser') {
    const passwordHash = await hashPassword(testPassword);
    const user = await db.insertInto('users').values({username, email: `${username.toLowerCase()}@example.com`, password_hash: passwordHash})
      .returning(['id', 'username']).executeTakeFirstOrThrow();
    return {...user, token: issueToken(user.id, passwordHash, testSecret)};
  }
  async function createProject(userId: number) {
    return db.insertInto('projects').values({user_id: userId, title: 'Test project', description: 'Test description'})
      .returningAll().executeTakeFirstOrThrow();
  }
  return {db, base: http.base, request, createUser, createProject};
}
