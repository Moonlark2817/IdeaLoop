import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestApp } from './helpers/testApp.js';

test('GET /api/skills lists the catalog alphabetically without authentication', async t => {
  const {request, db} = await createTestApp(t);
  await db.insertInto('skills').values([
    {name: 'Watercolor', category: 'Art'},
    {name: 'Guitar', category: 'Music'},
    {name: 'Python', category: 'Coding'},
  ]).execute();

  const response = await request('GET', '/api/skills');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.skills.map((s: {name: string}) => s.name), ['Guitar', 'Python', 'Watercolor']);
  assert.deepEqual(Object.keys(response.body.skills[0]).sort(), ['category', 'id', 'name']);
});

test('GET /api/skills returns an empty list when no skills exist', async t => {
  const {request} = await createTestApp(t);
  const response = await request('GET', '/api/skills');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.skills, []);
});

test('GET /api/skills?q= filters by name or category, case-insensitively', async t => {
  const {request, db} = await createTestApp(t);
  await db.insertInto('skills').values([
    {name: 'Python', category: 'Coding'},
    {name: 'TypeScript', category: 'Coding'},
    {name: 'Watercolor', category: 'Art'},
  ]).execute();

  const byName = await request('GET', '/api/skills?q=PYTH');
  assert.deepEqual(byName.body.skills.map((s: {name: string}) => s.name), ['Python']);

  const byCategory = await request('GET', '/api/skills?q=coding');
  assert.deepEqual(byCategory.body.skills.map((s: {name: string}) => s.name), ['Python', 'TypeScript']);

  const blank = await request('GET', '/api/skills?q=%20%20');
  assert.equal(blank.body.skills.length, 3);
});

test('GET /api/skills treats LIKE wildcards literally', async t => {
  const {request, db} = await createTestApp(t);
  await db.insertInto('skills').values([{name: 'C++', category: 'Coding'}, {name: '3D_Modeling', category: 'Art'}]).execute();

  const percent = await request('GET', '/api/skills?q=%25');
  assert.deepEqual(percent.body.skills, []);

  const underscore = await request('GET', '/api/skills?q=_');
  assert.deepEqual(underscore.body.skills.map((s: {name: string}) => s.name), ['3D_Modeling']);
});

test('GET /api/skills rejects repeated or overly long queries', async t => {
  const {request} = await createTestApp(t);
  assert.equal((await request('GET', '/api/skills?q=a&q=b')).status, 400);
  assert.equal((await request('GET', `/api/skills?q=${'a'.repeat(101)}`)).status, 400);
  assert.equal((await request('GET', `/api/skills?q=${'a'.repeat(100)}`)).status, 200);
});
