import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createApp } from '../app.js';
import { createErrorHandler, notFound } from '../middleware/errorHandler.js';
import { HttpError } from '../middleware/httpError.js';
import { startHttpServer } from './helpers/testApp.js';

test('HTTP parsing failures and unknown routes return JSON while liveness keeps working', async t => {
  const http = await startHttpServer(createApp({checkDatabase: async () => {}}));
  t.after(http.close);
  for (const [body, expectedStatus] of [['{broken', 400], [JSON.stringify({text: 'x'.repeat(1024 * 1024)}), 413]] as const) {
    const response = await fetch(`${http.base}/api/unknown`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
    assert.equal(response.status, expectedStatus);
    assert.match(response.headers.get('content-type')!, /application\/json/);
    const payload = await response.json() as {error: {message: string}};
    assert.equal(typeof payload.error.message, 'string');
    assert.equal(JSON.stringify(payload).includes('stack'), false);
  }
  const missing = await fetch(`${http.base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {error: {message: 'Route not found'}});
  assert.equal((await fetch(`${http.base}/api/health`)).status, 200);
});

for (const production of [true, false]) {
  test(`error middleware preserves client errors and ${production ? 'hides' : 'shows'} internal diagnostics`, async t => {
    t.mock.method(console, 'error', () => {});
    const app = express();
    app.get('/failure', () => {throw new Error('private database diagnostic');});
    app.get('/validation', () => {throw new HttpError(400, 'Invalid input');});
    app.get('/conflict', () => {throw Object.assign(new Error('private SQL duplicate details'), {code: '23505'});});
    app.get('/invalid-status', () => {throw Object.assign(new Error('private diagnostic'), {status: 200});});
    app.use(notFound);
    app.use(createErrorHandler(production));
    const http = await startHttpServer(app);
    t.after(http.close);
    for (const path of ['/failure', '/invalid-status']) {
      const response = await fetch(`${http.base}${path}`);
      assert.equal(response.status, 500);
      const body = await response.json() as {error: {message: string}};
      assert.equal(body.error.message, production ? 'Internal server error' : path === '/failure' ? 'private database diagnostic' : 'private diagnostic');
      assert.equal(Object.hasOwn(body.error, 'stack'), false);
    }
    const validation = await fetch(`${http.base}/validation`);
    assert.equal(validation.status, 400);
    assert.deepEqual(await validation.json(), {error: {message: 'Invalid input'}});
    const conflict = await fetch(`${http.base}/conflict`);
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {error: {message: 'Username or email is already in use'}});
  });
}
