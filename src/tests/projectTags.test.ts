
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';

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

const secret = 'test-only-secret-with-at-least-32-characters';
const password = 'correct horse battery staple';

test('Project Tags API integration tests', async (t) => {
  const postgres = new PGlite();

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

  const app = createApp({
    checkDatabase: async () => {
      await sql`select 1`.execute(db);
    },
    production: true,
    users: { db, jwtSecret: secret },
  });

  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');

    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const base = `http://127.0.0.1:${address.port}`;

    for (const migrate of [
      usersMigration,
      projectsMigration,
      engagementMigration,
      requestsMigration,
      identityMigration,
    ]) {
      await migrate(db);
    }

    async function request(
      method: string,
      path: string,
      body?: unknown,
      token?: string,
    ) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {}),
        },
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
      });

      return {
        status: response.status,
        body: await response.json() as any,
      };
    }

    const alice = await request('POST', '/api/auth/register', {
      username: 'TagTestAlice',
      email: 'tagalice@example.com',
      password,
    });

    const bob = await request('POST', '/api/auth/register', {
      username: 'TagTestBob',
      email: 'tagbob@example.com',
      password,
    });

    assert.equal(alice.status, 201);
    assert.equal(bob.status, 201);

    const aliceToken: string = alice.body.token;
    const bobToken: string = bob.body.token;

    const created = await request(
      'POST',
      '/api/projects',
      { title: 'Test Project', description: 'Testing project tags' },
      aliceToken,
    );

    assert.equal(created.status, 201);

    const projectId: number = created.body.project.id;
    const path = `/api/projects/${projectId}/tags`;

    const tag1 = await db
      .insertInto('tags')
      .values({ name: 'Animation' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const tag2 = await db
      .insertInto('tags')
      .values({ name: 'Game Development' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const skill1 = await db
      .insertInto('skills')
      .values({ name: 'Blender', category: 'Art' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const skill2 = await db
      .insertInto('skills')
      .values({ name: 'Python', category: 'Programming' })
      .returning('id')
      .executeTakeFirstOrThrow();


    await t.test('GET catalog returns tags alphabetically', async () => {
      const response = await request(
        'GET',
        '/api/projects/tags/catalog'
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        tags: [
          { id: tag1.id, name: 'Animation' },
          { id: tag2.id, name: 'Game Development' },
        ],
      });
    });



    await t.test('GET returns empty tags and skills', async () => {
      const response = await request('GET', path);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { tags: [], skills: [] });
    });

    await t.test('PUT requires authentication', async () => {
      const response = await request('PUT', path, {
        tag_ids: [tag1.id],
        skill_ids: [skill1.id],
      });

      assert.equal(response.status, 401);
    });

    await t.test('PUT rejects changes by another user', async () => {
      const response = await request(
        'PUT',
        path,
        { tag_ids: [tag1.id], skill_ids: [skill1.id] },
        bobToken,
      );

      assert.equal(response.status, 403);
    });

    await t.test('PUT saves tags and skills', async () => {
      const response = await request(
        'PUT',
        path,
        {
          tag_ids: [tag2.id, tag1.id],
          skill_ids: [skill2.id, skill1.id],
        },
        aliceToken,
      );

      assert.equal(response.status, 200);

      assert.deepEqual(response.body, {
        tags: [
          { id: tag1.id, name: 'Animation' },
          { id: tag2.id, name: 'Game Development' },
        ],
        skills: [
          { id: skill1.id, name: 'Blender', category: 'Art' },
          { id: skill2.id, name: 'Python', category: 'Programming' },
        ],
      });

      const fetched = await request('GET', path);
      assert.deepEqual(fetched.body, response.body);
    });

    await t.test('PUT rejects duplicate IDs', async () => {
      const response = await request(
        'PUT',
        path,
        { tag_ids: [tag1.id, tag1.id], skill_ids: [] },
        aliceToken,
      );

      assert.equal(response.status, 400);
    });

    await t.test('PUT rejects nonexistent tag IDs', async () => {
      const response = await request(
        'PUT',
        path,
        { tag_ids: [2147483647], skill_ids: [] },
        aliceToken,
      );

      assert.equal(response.status, 400);
    });

    await t.test('PUT rejects nonexistent skill IDs', async () => {
      const response = await request(
        'PUT',
        path,
        { tag_ids: [], skill_ids: [2147483647] },
        aliceToken,
      );

      assert.equal(response.status, 400);
    });

    await t.test('PUT rejects malformed requests', async () => {
      const invalid = [
        null,
        [],
        {},
        { tag_ids: [], skill_ids: [0] },
        { tag_ids: ['1'], skill_ids: [] },
        { tag_ids: [], skill_ids: [1, 1] },
        { tag_ids: [], skill_ids: [], user_id: 1 },
      ];

      for (const body of invalid) {
        const response = await request(
          'PUT',
          path,
          body,
          aliceToken,
        );

        assert.equal(response.status, 400, JSON.stringify(body));
      }
    });

    await t.test('PUT replaces existing associations', async () => {
      const response = await request(
        'PUT',
        path,
        { tag_ids: [tag2.id], skill_ids: [skill2.id] },
        aliceToken,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        tags: [{ id: tag2.id, name: 'Game Development' }],
        skills: [
          { id: skill2.id, name: 'Python', category: 'Programming' },
        ],
      });
    });

    await t.test('PUT accepts empty arrays to remove associations', async () => {
      const response = await request(
        'PUT',
        path,
        { tag_ids: [], skill_ids: [] },
        aliceToken,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { tags: [], skills: [] });
    });

    await t.test('GET rejects nonexistent projects', async () => {
      const response = await request(
        'GET',
        '/api/projects/2147483647/tags',
      );

      assert.equal(response.status, 404);
    });

    await t.test('GET rejects invalid project IDs', async () => {
      const response = await request('GET', '/api/projects/abc/tags');

      assert.equal(response.status, 400);
    });
  } finally {
    server.close();
    await once(server, 'close');
    await db.destroy();
  }
});
