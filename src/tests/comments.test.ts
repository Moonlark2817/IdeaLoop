
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

test('Comment API integration tests', async (t) => {
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

    // Apply the actual project migrations.
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
        headers: response.headers,
        body: response.status === 204 ? null : await response.json() as any,
      };
    }

    // Create two users for authentication and ownership tests.
    const aliceResponse = await request('POST', '/api/auth/register', {
      username: 'SkillsAlice',
      email: 'skillsalice@example.com',
      password,
    });
    assert.equal(aliceResponse.status, 201);

    const aliceId: number = aliceResponse.body.user.id;
    const aliceToken: string = aliceResponse.body.token;

    const bobResponse = await request('POST', '/api/auth/register', {
      username: 'SkillsBob',
      email: 'skillsbob@example.com',
      password,
    });
    assert.equal(bobResponse.status, 201);

    const bobId: number = bobResponse.body.user.id;
    const bobToken: string = bobResponse.body.token;

    const project = await db.insertInto('projects').values({ user_id: aliceId, title: 'One', description: 'Test', project_url: null }).returning('id').executeTakeFirstOrThrow();
    const other = await db.insertInto('projects').values({ user_id: bobId, title: 'Two', description: 'Test', project_url: null }).returning('id').executeTakeFirstOrThrow();
    const path = `/api/projects/${project.id}/comments`;
    const otherPath = `/api/projects/${other.id}/comments`;
    let root: any;
    let reply: any;
    let nested: any;
    let independent: any;
    await t.test('creates, reads, paginates, and edits comments and replies', async () => {
      assert.deepEqual((await request('GET', path)).body, { comments: [], pagination: { limit: 20, offset: 0 } });
      const created = await request('POST', path, { content: '  Hello  ' }, bobToken);
      assert.equal(created.status, 201);
      root = created.body.comment;
      assert.equal(created.headers.get('location'), `${path}/${root.id}`);
      assert.equal(root.content, 'Hello');
      assert.equal(root.user_id, bobId);
      assert.equal(root.project_id, project.id);
      assert.equal(root.parent_comment_id, null);
      assert.deepEqual(Object.keys(root).sort(), ['id', 'user_id', 'project_id', 'parent_comment_id', 'content', 'created_at', 'updated_at'].sort());
      assert.deepEqual((await request('GET', `${path}/${root.id}`)).body, { comment: root });
      const response = await request('POST', path, { content: 'Reply', parent_comment_id: root.id }, aliceToken);
      assert.equal(response.status, 201);
      reply = response.body.comment;
      assert.equal(reply.parent_comment_id, root.id);
      nested = (await request('POST', path, { content: 'Nested', parent_comment_id: reply.id }, bobToken)).body.comment;
      independent = (await request('POST', path, { content: 'Independent', parent_comment_id: null }, aliceToken)).body.comment;
      const page = await request('GET', `${path}?limit=1&offset=1`);
      assert.deepEqual(page.body, { comments: [reply], pagination: { limit: 1, offset: 1 } });
      assert.deepEqual((await request('GET', path)).body.comments.map((c: any) => c.id), [root.id, reply.id, nested.id, independent.id]);
      await db.updateTable('project_comments').set({ updated_at: new Date('2000-01-01') }).where('id', '=', root.id).execute();
      const edited = await request('PATCH', `${path}/${root.id}`, { content: '  Edited  ' }, bobToken);
      assert.equal(edited.status, 200);
      assert.equal(edited.body.comment.content, 'Edited');
      assert.equal(edited.body.comment.created_at, root.created_at);
      assert.ok(new Date(edited.body.comment.updated_at).getTime() > new Date('2000-01-01').getTime());
      assert.equal((await request('GET', `${path}/${root.id}`)).body.comment.content, 'Edited');
    });
    await t.test('enforces authentication, author ownership, project scoping, and validation', async () => {
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const target = method === 'POST' ? path : `${path}/${root.id}`;
        for (const token of [undefined, 'invalid']) {
          assert.equal((await request(method, target, method === 'DELETE' ? undefined : { content: 'X' }, token)).status, 401);
        }
      }
      // Owning the project does not permit editing/deleting another author's comment.
      for (const method of ['PATCH', 'DELETE']) {
        assert.equal((await request(method, `${path}/${root.id}`, method === 'PATCH' ? { content: 'X' } : undefined, aliceToken)).status, 403);
      }
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        assert.equal((await request(method, `${otherPath}/${root.id}`, method === 'PATCH' ? { content: 'X' } : undefined, bobToken)).status, 404);
        assert.equal((await request(method, `${path}/2147483647`, method === 'PATCH' ? { content: 'X' } : undefined, bobToken)).status, 404);
      }
      for (const body of [{}, [], null, { content: '' }, { content: ' ' }, { content: 42 }, { content: null },
        { content: 'X', user_id: aliceId }, { content: 'X', project_id: other.id }, { content: 'X', id: 10 }, { content: 'X', updated_at: 'now' }, { content: 'X', parent_comment_id: root.id }]) {
        assert.equal((await request('PATCH', `${path}/${root.id}`, body, bobToken)).status, 400, JSON.stringify(body));
      }
      for (const parent of ['1', 0, -1, 1.5, 2147483648, true]) {
        assert.equal((await request('POST', path, { content: 'X', parent_comment_id: parent }, bobToken)).status, 400);
      }
      assert.equal((await request('POST', path, { content: 'X', parent_comment_id: 2147483647 }, bobToken)).status, 404);
      assert.equal((await request('POST', otherPath, { content: 'X', parent_comment_id: root.id }, bobToken)).status, 400);
      assert.equal((await request('POST', path, { content: ' ' }, bobToken)).status, 400);
      assert.equal((await request('POST', path, { content: 'X', user_id: aliceId }, bobToken)).status, 400);
      for (const id of ['0', '-1', 'abc', '1.2', '2147483648']) {
        assert.equal((await request('GET', `${path}/${id}`)).status, 400);
        assert.equal((await request('GET', `/api/projects/${id}/comments`)).status, 400);
      }
      for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=abc']) {
        assert.equal((await request('GET', `${path}?${query}`)).status, 400);
      }
      assert.equal((await request('GET', '/api/projects/2147483647/comments')).status, 404);
      assert.equal((await request('POST', '/api/projects/2147483647/comments', { content: 'X' }, bobToken)).status, 404);
      const oversized = await request('POST', path, { content: 'x'.repeat(1024 * 1024) }, bobToken);
      assert.equal(oversized.status, 413);
    });
    await t.test('deletes descendants and preserves unrelated comments', async () => {
      const external = await db.insertInto('project_comments').values({ project_id: other.id, user_id: bobId, content: 'Other', parent_comment_id: null }).returning('id').executeTakeFirstOrThrow();
      const deletion = await request('DELETE', `${path}/${root.id}`, undefined, bobToken);
      assert.equal(deletion.status, 204);
      assert.equal(deletion.body, null);
      for (const id of [root.id, reply.id, nested.id]) {
        assert.equal((await request('GET', `${path}/${id}`)).status, 404);
      }
      assert.equal((await request('GET', `${path}/${independent.id}`)).status, 200);
      assert.equal((await request('GET', `${otherPath}/${external.id}`)).status, 200);
      assert.equal((await request('DELETE', `${path}/${root.id}`, undefined, bobToken)).status, 404);
      await db.deleteFrom('projects').where('id', '=', other.id).execute();
      assert.equal((await request('GET', otherPath)).status, 404);
      assert.equal(await db.selectFrom('project_comments').select('id').where('id', '=', external.id).executeTakeFirst(), undefined);
      // Deleting an author removes their thread, including other users' replies, and revokes their token.
      const child = await db.insertInto('project_comments').values({ project_id: project.id, user_id: bobId, content: 'Child', parent_comment_id: independent.id }).returning('id').executeTakeFirstOrThrow();
      const bobRoot = await db.insertInto('project_comments').values({ project_id: project.id, user_id: bobId, content: 'Bob root', parent_comment_id: null }).returning('id').executeTakeFirstOrThrow();
      const aliceReply = await db.insertInto('project_comments').values({ project_id: project.id, user_id: aliceId, content: 'Alice reply', parent_comment_id: bobRoot.id }).returning('id').executeTakeFirstOrThrow();
      assert.equal((await request('DELETE', `/api/users/${bobId}`, undefined, bobToken)).status, 204);
      assert.equal(await db.selectFrom('project_comments').select('id').where('id', 'in', [child.id, bobRoot.id, aliceReply.id]).executeTakeFirst(), undefined);
      assert.equal((await request('POST', path, { content: 'Revoked' }, bobToken)).status, 401);
      assert.equal((await request('GET', `${path}/${independent.id}`)).status, 200);
    });
    await t.test('shares the mutation rate limit across endpoints without limiting reads', async () => {
      // Previous mutations count toward the same 60-request window.
      let limited = false;
      for (let i = 0; i < 61; i++) {
        const response = await request('PATCH', `${path}/${independent.id}`, { content: 'Rate test' }, aliceToken);
        if (response.status === 429) { limited = true; break; }
        assert.equal(response.status, 200);
      }
      assert.ok(limited);
      assert.equal((await request('POST', path, { content: 'Limited' }, aliceToken)).status, 429);
      assert.equal((await request('DELETE', `${path}/${independent.id}`, undefined, aliceToken)).status, 429);
      assert.equal((await request('GET', path)).status, 200);
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );

    await db.destroy();
  }
});
