import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestApp, testPassword } from './helpers/testApp.js';

test('protected HTTP routes reject malformed Bearer headers without rejecting valid mixed-case schemes', async t => {
  const {request, createUser} = await createTestApp(t);
  const user = await createUser();
  for (const authorization of ['Basic credentials', 'Bearer', 'Bearer token extra', 'Bearer invalid', `Bearer\t${user.token}`]) {
    const response = await request('GET', '/api/users/me', undefined, undefined, {Authorization: authorization});
    assert.equal(response.status, 401);
    assert.equal(typeof response.body.error.message, 'string');
  }
  const accepted = await request('GET', '/api/users/me', undefined, undefined, {Authorization: `bEaReR ${user.token}`});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.user.id, user.id);
});

test('password changes and account deletion revoke project and comment mutation access', async t => {
  const {request, createUser, createProject, db} = await createTestApp(t);
  const alice = await createUser('Alice');
  const bob = await createUser('Bob');
  const project = await createProject(bob.id);
  const ownedProject = await createProject(alice.id);
  const comment = await db.insertInto('project_comments').values({user_id: alice.id, project_id: project.id, parent_comment_id: null, content: 'Keep this comment'})
    .returningAll().executeTakeFirstOrThrow();
  const changed = await request('PATCH', `/api/users/${alice.id}`, {current_password: testPassword, password: 'replacement-backend-password'}, alice.token);
  assert.equal(changed.status, 200);
  const newToken: string = changed.body.token;
  const mutations = [
    ['POST', '/api/projects', {title: 'Unauthorized', description: 'New project'}],
    ['PATCH', `/api/projects/${ownedProject.id}`, {title: 'Unauthorized'}],
    ['DELETE', `/api/projects/${ownedProject.id}`, undefined],
    ['POST', `/api/projects/${project.id}/comments`, {content: 'Unauthorized'}],
    ['PATCH', `/api/projects/${project.id}/comments/${comment.id}`, {content: 'Unauthorized'}],
    ['DELETE', `/api/projects/${project.id}/comments/${comment.id}`, undefined],
  ] as const;
  for (const [method, path, body] of mutations) assert.equal((await request(method, path, body, alice.token)).status, 401, `${method} ${path}`);
  assert.equal((await request('GET', `/api/projects/${ownedProject.id}`)).body.project.title, ownedProject.title);
  assert.equal((await request('GET', `/api/projects/${project.id}/comments/${comment.id}`)).body.comment.content, comment.content);
  assert.equal((await request('PATCH', `/api/projects/${project.id}/comments/${comment.id}`, {content: 'New token works'}, newToken)).status, 200);
  assert.equal((await request('DELETE', `/api/users/${alice.id}`, undefined, newToken)).status, 204);
  for (const [method, path, body] of mutations) assert.equal((await request(method, path, body, newToken)).status, 401);
  assert.equal((await request('GET', `/api/projects/${project.id}`)).status, 200);
});

test('project field boundaries and rejected writes preserve persisted data', async t => {
  const {request, createUser, db} = await createTestApp(t);
  const user = await createUser();
  const baseUrl = 'https://example.com/';
  const validUrl = baseUrl + 'a'.repeat(512 - baseUrl.length);
  const created = await request('POST', '/api/projects', {title: 't'.repeat(150), description: 'Description', project_url: validUrl}, user.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.project.title.length, 150);
  assert.equal(created.body.project.project_url.length, 512);
  const path = `/api/projects/${created.body.project.id}`;
  const before = await db.selectFrom('projects').selectAll().execute();
  const invalidBodies = [{title: 't'.repeat(151)}, {description: '  '}, {project_url: validUrl + 'a'}, {project_url: 'https://user:secret@example.com'}, {user_id: user.id}, {created_at: '2020-01-01'}, {is_seeking_collaborators: 1}];
  for (const body of invalidBodies) {
    assert.equal((await request('PATCH', path, body, user.token)).status, 400);
    assert.deepEqual(await db.selectFrom('projects').selectAll().execute(), before);
    assert.equal((await request('POST', '/api/projects', {title: 'Valid', description: 'Valid', ...body}, user.token)).status, 400);
    assert.deepEqual(await db.selectFrom('projects').selectAll().execute(), before);
  }
  const updated = await request('PATCH', path, {project_url: null, is_seeking_collaborators: true}, user.token);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.project.project_url, null);
  assert.equal(updated.body.project.description, 'Description');
});

test('rejected comment writes leave the thread and original timestamps unchanged', async t => {
  const {request, createUser, createProject, db} = await createTestApp(t);
  const user = await createUser();
  const project = await createProject(user.id);
  const path = `/api/projects/${project.id}/comments`;
  const created = await request('POST', path, {content: '  x  '}, user.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.comment.content, 'x');
  const before = await db.selectFrom('project_comments').selectAll().execute();
  for (const body of [{content: ''}, {content: 5}, {content: null}, {content: 'Valid', parent_comment_id: '1'}, {content: 'Valid', parent_comment_id: 2147483648}, {content: 'Valid', user_id: user.id}]) {
    assert.equal((await request('POST', path, body, user.token)).status, 400);
    assert.deepEqual(await db.selectFrom('project_comments').selectAll().execute(), before);
  }
  for (const body of [{}, {content: ' '}, {content: 'Valid', parent_comment_id: null}, {content: 'Valid', project_id: project.id}]) {
    assert.equal((await request('PATCH', `${path}/${created.body.comment.id}`, body, user.token)).status, 400);
    assert.deepEqual(await db.selectFrom('project_comments').selectAll().execute(), before);
  }
  assert.equal((await request('POST', path, {content: 'Valid', parent_comment_id: 2147483647}, user.token)).status, 404);
  assert.deepEqual(await db.selectFrom('project_comments').selectAll().execute(), before);
});

test('project mutations share one rate limit while public reads remain available', async t => {
  const {request, createUser, createProject} = await createTestApp(t);
  const user = await createUser();
  const project = await createProject(user.id);
  for (let index = 0; index < 60; index++) {
    const kind = index % 3;
    const response = kind === 0 ? await request('POST', '/api/projects', {}, user.token)
      : kind === 1 ? await request('PATCH', `/api/projects/${project.id}`, {}, user.token)
      : await request('DELETE', '/api/projects/2147483647', undefined, user.token);
    assert.equal(response.status, kind === 2 ? 404 : 400);
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const path = method === 'POST' ? '/api/projects' : `/api/projects/${project.id}`;
    const limited = await request(method, path, method === 'DELETE' ? undefined : {}, user.token);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  }
  assert.equal((await request('GET', '/api/projects')).status, 200);
  assert.equal((await request('GET', `/api/projects/${project.id}`)).status, 200);
});

test('user skills accept 50 entries and roll back failed replacements without losing assignments', async t => {
  const {request, createUser, db} = await createTestApp(t);
  const user = await createUser();
  const skills = await db.insertInto('skills').values(Array.from({length: 50}, (_, index) => ({name: `Skill ${String(index).padStart(2, '0')}`, category: 'Testing'})))
    .returning('id').execute();
  const path = `/api/users/${user.id}/skills`;
  const valid = skills.map(skill => ({skill_id: skill.id}));
  assert.equal((await request('PUT', path, {skills: valid}, user.token)).status, 200);
  const saved = (await request('GET', path)).body.skills;
  assert.equal(saved.length, 50);
  assert.ok(saved.every((skill: {proficiency_level: unknown; is_open_to_teach: boolean}) => skill.proficiency_level === null && skill.is_open_to_teach === false));
  const before = await db.selectFrom('user_skills').selectAll().orderBy('skill_id').execute();
  for (const invalid of [[...valid, {skill_id: 2147483647}], [{skill_id: skills[0].id}, {skill_id: 2147483647}]]) {
    assert.equal((await request('PUT', path, {skills: invalid}, user.token)).status, 400);
    assert.deepEqual(await db.selectFrom('user_skills').selectAll().orderBy('skill_id').execute(), before);
  }
});

test('out-of-range skill IDs are client errors and cannot erase existing assignments', async t => {
  t.mock.method(console, 'error', () => {});
  const {request, createUser, db} = await createTestApp(t);
  const user = await createUser();
  const skill = await db.insertInto('skills').values({name: 'Existing', category: 'Test'}).returning('id').executeTakeFirstOrThrow();
  const path = `/api/users/${user.id}/skills`;
  assert.equal((await request('PUT', path, {skills: [{skill_id: skill.id}]}, user.token)).status, 200);
  const before = await db.selectFrom('user_skills').selectAll().execute();
  for (const skillId of [2147483648, Number.MAX_SAFE_INTEGER]) {
    const response = await request('PUT', path, {skills: [{skill_id: skillId}]}, user.token);
    assert.equal(response.status, 400, `skill_id ${skillId}`);
    assert.deepEqual(await db.selectFrom('user_skills').selectAll().execute(), before);
  }
});
