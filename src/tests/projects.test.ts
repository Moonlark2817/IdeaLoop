
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

test('Project API integration tests', async (t) => {
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
        body: await response.json() as any,
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

    await t.test('core CRUD, validation, and cascades', async () => {
      const empty = await request('GET', '/api/projects');
      assert.deepEqual(empty.body, { projects: [], pagination: { limit: 20, offset: 0, has_more: false } });
      const created = await request('POST', '/api/projects', { title: '  First  ', description: '  Description  ' }, aliceToken);
      assert.equal(created.status, 201);
      const project = created.body.project;
      assert.equal(project.title, 'First');
      assert.equal(project.description, 'Description');
      assert.equal(project.user_id, aliceId);
      assert.equal(project.project_url, null);
      assert.equal(project.is_seeking_collaborators, false);
      assert.deepEqual(Object.keys(project).sort(), ['id', 'user_id', 'title', 'description', 'project_url', 'is_seeking_collaborators', 'created_at', 'updated_at'].sort());
      const path = `/api/projects/${project.id}`;
      assert.deepEqual((await request('GET', path)).body, { project });
      for (const [method, target, data] of [
        ['POST', '/api/projects', { title: 'X', description: 'Y' }],
        ['PATCH', path, { title: 'Changed' }], ['DELETE', path, undefined],
      ] as const) {
        assert.equal((await request(method, target, data)).status, 401);
        assert.equal((await request(method, target, data, 'invalid')).status, 401);
      }
      assert.equal((await request('PATCH', path, { title: 'Stolen' }, bobToken)).status, 403);
      assert.equal((await request('DELETE', path, undefined, bobToken)).status, 403);
      const invalid = [null, [], {}, { title: '' }, { title: ' '.repeat(3) }, { title: 'x'.repeat(151) },
        { description: null }, { description: ' ' }, { project_url: 'ftp://example.com' },
        { project_url: 'https://user:pass@example.com' }, { project_url: 'https://example.com/' + 'x'.repeat(512) },
        { project_url: 123 }, { is_seeking_collaborators: 'true' }, { is_seeking_collaborators: null },
        { user_id: bobId }, { id: 2 }, { updated_at: '2020-01-01' }];
      for (const data of invalid) {
        const response = await request('PATCH', path, data, aliceToken);
        assert.equal(response.status, 400, JSON.stringify(data));
        assert.equal(typeof response.body.error.message, 'string');
      }
      assert.equal((await request('POST', '/api/projects', { title: 'Missing description' }, aliceToken)).status, 400);
      for (const id of ['abc', '0', '-1', '1.5', '2147483648']) {
        assert.equal((await request('GET', `/api/projects/${id}`)).status, 400);
      }
      for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=abc', 'offset=2147483648']) {
        assert.equal((await request('GET', `/api/projects?${query}`)).status, 400);
      }
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        assert.equal((await request(method, '/api/projects/2147483647', method === 'PATCH' ? { title: 'X' } : undefined, aliceToken)).status, 404);
      }
      await db.updateTable('projects').set({ updated_at: new Date('2000-01-01') }).where('id', '=', project.id).execute();
      const patched = await request('PATCH', path, { project_url: 'https://example.com', is_seeking_collaborators: true }, aliceToken);
      assert.equal(patched.status, 200);
      assert.equal(patched.body.project.title, 'First');
      assert.equal(patched.body.project.project_url, 'https://example.com');
      assert.equal(patched.body.project.is_seeking_collaborators, true);
      assert.ok(new Date(patched.body.project.updated_at).getTime() > new Date('2000-01-01').getTime());
      assert.equal((await request('PATCH', path, { project_url: null }, aliceToken)).body.project.project_url, null);
      const second = await request('POST', '/api/projects', { title: 'Second', description: 'Another', project_url: 'http://example.com', is_seeking_collaborators: true }, bobToken);
      assert.equal(second.status, 201);
      const page = await request('GET', '/api/projects?limit=1&offset=1');
      assert.deepEqual(page.body.projects.map((p: any) => p.id), [second.body.project.id]);
      assert.deepEqual(page.body.pagination, { limit: 1, offset: 1, has_more: false });
      assert.deepEqual((await request('GET', '/api/projects')).body.projects.map((p: any) => p.id), [project.id, second.body.project.id]);
      const tag = await db.insertInto('tags').values({ name: 'test' }).returning('id').executeTakeFirstOrThrow();
      const skill = await db.insertInto('skills').values({ name: 'test', category: 'Art' }).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('project_media').values({ project_id: project.id, media_url: 'https://example.com/image', media_type: 'image' }).execute();
      await db.insertInto('project_tags').values({ project_id: project.id, tag_id: tag.id }).execute();
      await db.insertInto('project_skills').values({ project_id: project.id, skill_id: skill.id }).execute();
      await db.insertInto('project_likes').values({ project_id: project.id, user_id: bobId }).execute();
      await db.insertInto('saved_projects').values({ project_id: project.id, user_id: bobId }).execute();
      const comment = await db.insertInto('project_comments').values({ project_id: project.id, user_id: bobId, content: 'Hi', parent_comment_id: null }).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('project_comments').values({ project_id: project.id, user_id: aliceId, content: 'Reply', parent_comment_id: comment.id }).execute();
      await db.insertInto('collaboration_requests').values({ sender_id: bobId, receiver_id: aliceId, project_id: project.id, skill_id: skill.id, message: null }).execute();
      const deletion = await fetch(`${base}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${aliceToken}` } });
      assert.equal(deletion.status, 204);
      assert.equal(await deletion.text(), '');
      assert.equal((await request('GET', path)).status, 404);
      for (const table of ['project_media', 'project_tags', 'project_skills', 'project_likes', 'saved_projects', 'project_comments', 'collaboration_requests'] as const) {
        assert.deepEqual(await db.selectFrom(table).selectAll().where('project_id', '=', project.id).execute(), []);
      }
      assert.equal((await request('GET', `/api/projects/${second.body.project.id}`)).status, 200);
      assert.ok(await db.selectFrom('tags').selectAll().where('id', '=', tag.id).executeTakeFirst());
      assert.ok(await db.selectFrom('skills').selectAll().where('id', '=', skill.id).executeTakeFirst());
      assert.equal((await request('DELETE', path, undefined, aliceToken)).status, 404);
      const finalCreate = await fetch(`${base}/api/projects`, { method: 'POST', headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Location', description: 'Header' }) });
      assert.equal(finalCreate.status, 201);
      const finalBody = await finalCreate.json() as any;
      assert.equal(finalCreate.headers.get('location'), `/api/projects/${finalBody.project.id}`);
    });

    const fixtures = await db.insertInto('projects').values([
      {user_id: aliceId, title: 'Discovery Alpha', description: 'A painting', project_url: null, is_seeking_collaborators: true, created_at: '2020-01-01'},
      {user_id: bobId, title: 'Discovery Beta', description: 'NEEDLE in the description', project_url: null, is_seeking_collaborators: false, created_at: '2022-01-01'},
      {user_id: aliceId, title: 'Discovery Gamma', description: 'needle for a team', project_url: null, is_seeking_collaborators: true, created_at: '2022-01-01'},
      {user_id: bobId, title: 'Discovery Unknown date', description: 'No date', project_url: null, is_seeking_collaborators: false, created_at: null},
      {user_id: bobId, title: 'Discovery literal 100% under_score path\\demo', description: 'Special characters', project_url: null, is_seeking_collaborators: false, created_at: '2023-01-01'},
      {user_id: aliceId, title: 'Unrelated heading', description: 'Discovery in description only', project_url: null, is_seeking_collaborators: true, created_at: '2021-01-01'},
    ]).returningAll().execute();
    const [alpha, beta, gamma, undated, literal, descriptionOnly] = fixtures;
    const ids = (body: any) => body.projects.map((project: any) => project.id);
    const discover = (values: Record<string, string> = {}) => request('GET', `/api/projects?${new URLSearchParams({q: 'discovery', ...values})}`);

    await t.test('discovery searches titles and descriptions with literal case-insensitive substrings', async () => {
      const matching = await discover({q: '  dIsCoVeRy  '});
      assert.equal(matching.status, 200);
      assert.deepEqual(ids(matching.body), fixtures.map(project => project.id));
      assert.deepEqual(ids((await discover({q: 'needle'})).body), [beta.id, gamma.id]);
      assert.deepEqual(ids((await discover({q: 'description only'})).body), [descriptionOnly.id]);
      for (const q of ['%', '_', '\\', '100%', 'under_score', 'path\\demo']) {
        assert.deepEqual(ids((await discover({q})).body), [literal.id], q);
      }
      assert.deepEqual(ids((await discover({q: "' OR 1=1 --"})).body), []);
      const all = await request('GET', '/api/projects');
      assert.deepEqual((await discover({q: '   '})).body, all.body);
      assert.equal((await discover({q: 'a'.repeat(200)})).status, 200);
    });

    await t.test('discovery combines filters, sorts deterministically, and preserves legacy ordering', async () => {
      assert.deepEqual(ids((await discover({sort: 'newest'})).body), [literal.id, gamma.id, beta.id, descriptionOnly.id, alpha.id, undated.id]);
      assert.deepEqual(ids((await discover({sort: 'oldest'})).body), [alpha.id, descriptionOnly.id, beta.id, gamma.id, literal.id, undated.id]);
      assert.deepEqual(ids((await discover()).body), fixtures.map(project => project.id));
      assert.deepEqual(ids((await discover({seeking_collaborators: 'true', sort: 'newest'})).body), [gamma.id, descriptionOnly.id, alpha.id]);
      assert.deepEqual(ids((await discover({seeking_collaborators: 'false'})).body), [beta.id, undated.id, literal.id]);
      assert.deepEqual(ids((await discover({q: 'needle', seeking_collaborators: 'true', sort: 'oldest'})).body), [gamma.id]);
    });

    await t.test('discovery paginates matching results with exact has_more boundaries', async () => {
      const first = await discover({seeking_collaborators: 'true', sort: 'newest', limit: '2'});
      assert.deepEqual(ids(first.body), [gamma.id, descriptionOnly.id]);
      assert.deepEqual(first.body.pagination, {limit: 2, offset: 0, has_more: true});
      const last = await discover({seeking_collaborators: 'true', sort: 'newest', limit: '2', offset: '2'});
      assert.deepEqual(ids(last.body), [alpha.id]);
      assert.equal(last.body.pagination.has_more, false);
      assert.equal((await discover({limit: '6'})).body.pagination.has_more, false);
      assert.equal((await discover({limit: '5'})).body.pagination.has_more, true);
      assert.equal((await discover({limit: '1', offset: '5'})).body.pagination.has_more, false);
      assert.deepEqual((await discover({offset: '6'})).body, {projects: [], pagination: {limit: 20, offset: 6, has_more: false}});
      assert.deepEqual((await discover({q: 'no-such-project'})).body, {projects: [], pagination: {limit: 20, offset: 0, has_more: false}});
    });

    await t.test('discovery rejects malformed and repeated recognized query values', async () => {
      const invalid = ['sort=popular', 'sort=', 'sort=newest&sort=oldest', 'q=a&q=b', 'q[]=a', 'q[x]=a',
        `q=${'a'.repeat(201)}`, 'q=%00', 'seeking_collaborators=1', 'seeking_collaborators=True',
        'seeking_collaborators=', 'seeking_collaborators=true&seeking_collaborators=false',
        'limit=1&limit=2', 'offset=0&offset=1', 'sort[]=newest', 'limit[x]=1'];
      for (const query of invalid) {
        const response = await request('GET', `/api/projects?${query}`);
        assert.equal(response.status, 400, query);
        assert.equal(typeof response.body.error.message, 'string');
      }
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
