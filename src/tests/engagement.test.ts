import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestApp } from './helpers/testApp.js';

const empty = { likes: 0, saves: 0, liked: false, saved: false };

test('signed-out visitors see like and save counts', async t => {
  const {request, createUser, createProject} = await createTestApp(t);
  const owner = await createUser('Owner');
  const fan = await createUser('Fan');
  const project = await createProject(owner.id);
  const path = `/api/projects/${project.id}/engagement`;

  assert.deepEqual((await request('GET', path)).body.engagement, empty);
  await request('PUT', `${path}/like`, undefined, fan.token);
  await request('PUT', `${path}/save`, undefined, fan.token);
  assert.deepEqual((await request('GET', path)).body.engagement, { likes: 1, saves: 1, liked: false, saved: false });
});

test('a signed-in user can like, unlike, save, and unsave a project', async t => {
  const {request, createUser, createProject} = await createTestApp(t);
  const user = await createUser('Liker');
  const project = await createProject(user.id);
  const path = `/api/projects/${project.id}/engagement`;

  const liked = await request('PUT', `${path}/like`, undefined, user.token);
  assert.equal(liked.status, 200);
  assert.deepEqual(liked.body.engagement, { likes: 1, saves: 0, liked: true, saved: false });

  const saved = await request('PUT', `${path}/save`, undefined, user.token);
  assert.deepEqual(saved.body.engagement, { likes: 1, saves: 1, liked: true, saved: true });

  assert.deepEqual((await request('GET', path, undefined, user.token)).body.engagement, { likes: 1, saves: 1, liked: true, saved: true });

  assert.deepEqual((await request('DELETE', `${path}/like`, undefined, user.token)).body.engagement, { likes: 0, saves: 1, liked: false, saved: true });
  assert.deepEqual((await request('DELETE', `${path}/save`, undefined, user.token)).body.engagement, empty);
});

test('liking or saving twice counts once, and removing twice is harmless', async t => {
  const {request, createUser, createProject} = await createTestApp(t);
  const user = await createUser('Repeat');
  const project = await createProject(user.id);
  const path = `/api/projects/${project.id}/engagement`;

  await request('PUT', `${path}/like`, undefined, user.token);
  const again = await request('PUT', `${path}/like`, undefined, user.token);
  assert.equal(again.status, 200);
  assert.equal(again.body.engagement.likes, 1);

  await request('DELETE', `${path}/save`, undefined, user.token);
  const removed = await request('DELETE', `${path}/save`, undefined, user.token);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.engagement.saves, 0);
});

test('counts include every user, and liked/saved reflect only the requester', async t => {
  const {request, createUser, createProject} = await createTestApp(t);
  const alice = await createUser('Alice');
  const bob = await createUser('Bob');
  const project = await createProject(alice.id);
  const path = `/api/projects/${project.id}/engagement`;

  await request('PUT', `${path}/like`, undefined, alice.token);
  await request('PUT', `${path}/like`, undefined, bob.token);
  await request('PUT', `${path}/save`, undefined, bob.token);

  assert.deepEqual((await request('GET', path, undefined, alice.token)).body.engagement, { likes: 2, saves: 1, liked: true, saved: false });
  assert.deepEqual((await request('GET', path, undefined, bob.token)).body.engagement, { likes: 2, saves: 1, liked: true, saved: true });
});

test('likes and saves require a valid token', async t => {
  const {request, createUser, createProject} = await createTestApp(t);
  const user = await createUser('Guest');
  const project = await createProject(user.id);
  const path = `/api/projects/${project.id}/engagement`;

  for (const [method, action] of [['PUT', 'like'], ['DELETE', 'like'], ['PUT', 'save'], ['DELETE', 'save']] as const) {
    assert.equal((await request(method, `${path}/${action}`)).status, 401);
  }
  assert.equal((await request('GET', path, undefined, 'not-a-token')).status, 401);
  assert.equal((await request('GET', '/api/saved-projects')).status, 401);
});

test('missing projects return 404 and invalid IDs return 400', async t => {
  const {request, createUser} = await createTestApp(t);
  const user = await createUser('Lost');

  assert.equal((await request('GET', '/api/projects/999/engagement')).status, 404);
  assert.equal((await request('PUT', '/api/projects/999/engagement/like', undefined, user.token)).status, 404);
  assert.equal((await request('PUT', '/api/projects/999/engagement/save', undefined, user.token)).status, 404);
  assert.equal((await request('GET', '/api/projects/abc/engagement')).status, 400);
  assert.equal((await request('PUT', '/api/projects/0/engagement/like', undefined, user.token)).status, 400);
});

test('GET /api/saved-projects lists only the requester\'s saves, newest first, with pagination', async t => {
  const {request, createUser, createProject, db} = await createTestApp(t);
  const alice = await createUser('Alice');
  const bob = await createUser('Bob');
  const first = await createProject(alice.id);
  const second = await createProject(alice.id);
  const third = await createProject(bob.id);

  await db.insertInto('saved_projects').values([
    {user_id: alice.id, project_id: first.id, created_at: new Date('2026-01-01T00:00:00Z')},
    {user_id: alice.id, project_id: third.id, created_at: new Date('2026-01-03T00:00:00Z')},
    {user_id: alice.id, project_id: second.id, created_at: new Date('2026-01-02T00:00:00Z')},
    {user_id: bob.id, project_id: first.id, created_at: new Date('2026-01-04T00:00:00Z')},
  ]).execute();

  const all = await request('GET', '/api/saved-projects', undefined, alice.token);
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.projects.map((p: {id: number}) => p.id), [third.id, second.id, first.id]);
  assert.equal(all.body.projects[0].title, 'Test project');
  assert.equal(all.body.pagination.has_more, false);

  const page = await request('GET', '/api/saved-projects?limit=2&offset=0', undefined, alice.token);
  assert.equal(page.body.projects.length, 2);
  assert.equal(page.body.pagination.has_more, true);

  const bobs = await request('GET', '/api/saved-projects', undefined, bob.token);
  assert.deepEqual(bobs.body.projects.map((p: {id: number}) => p.id), [first.id]);
});

test('deleting a project or account removes its likes and saves', async t => {
  const {request, createUser, createProject, db} = await createTestApp(t);
  const owner = await createUser('Owner');
  const fan = await createUser('Fan');
  const project = await createProject(owner.id);
  const path = `/api/projects/${project.id}/engagement`;
  await request('PUT', `${path}/like`, undefined, fan.token);
  await request('PUT', `${path}/save`, undefined, fan.token);
  await request('PUT', `${path}/like`, undefined, owner.token);

  await db.deleteFrom('users').where('id', '=', fan.id).execute();
  assert.deepEqual((await request('GET', path)).body.engagement, { likes: 1, saves: 0, liked: false, saved: false });

  await db.deleteFrom('projects').where('id', '=', project.id).execute();
  const remaining = await db.selectFrom('project_likes').selectAll().execute();
  assert.equal(remaining.length, 0);
});
