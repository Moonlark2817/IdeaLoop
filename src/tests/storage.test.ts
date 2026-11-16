import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createObjectKey, createS3Storage, StorageError } from '../storage/s3Storage.js';

const config = {bucket: 'idealoop-test-bucket', region: 'us-east-1', readUrlExpiresIn: 900};
function client() {
  // Explicit test-only credentials ensure signing never consults a real account.
  return new S3Client({region: config.region, credentials: {
    accessKeyId: 'TESTACCESSKEY', secretAccessKey: 'test-only-secret', sessionToken: 'test-only-session',
  }});
}

test('new object keys are unique opaque IDs under the managed prefix', () => {
  const first = createObjectKey('png');
  const second = createObjectKey('png');
  assert.notEqual(first, second);
  assert.match(first, /^uploads\/[a-f0-9-]{36}\.png$/);
  assert.match(createObjectKey(), /^uploads\/[a-f0-9-]{36}$/);
  for (const extension of ['../png', '.jpg', 'SVG', 'a'.repeat(11), 'image/png']) {
    assert.throws(() => createObjectKey(extension), /extension/);
  }
});

test('storage uploads private objects, checks the bucket, deletes by key, and closes its client', async t => {
  const s3 = client();
  const commands: unknown[] = [];
  t.mock.method(s3, 'send', async (command: unknown) => {commands.push(command); return {};});
  const destroy = t.mock.method(s3, 'destroy', () => {});
  const storage = createS3Storage(config, {client: s3});
  const key = createObjectKey('png');
  const body = Buffer.from('test bytes');
  await storage.putObject({key, body, contentType: 'image/png'});
  await storage.checkConnection();
  await storage.deleteObject(key);
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.deepEqual(commands[0].input, {Bucket: config.bucket, Key: key, Body: body, ContentType: 'image/png'});
  assert.equal('ACL' in commands[0].input, false);
  assert.ok(commands[1] instanceof HeadBucketCommand);
  assert.deepEqual(commands[1].input, {Bucket: config.bucket});
  assert.ok(commands[2] instanceof DeleteObjectCommand);
  assert.deepEqual(commands[2].input, {Bucket: config.bucket, Key: key});
  storage.close();
  assert.equal(destroy.mock.callCount(), 1);
});

test('private read URLs are signed locally with the configured lifetime and no object download', async t => {
  const s3 = client();
  t.after(() => s3.destroy());
  const send = t.mock.method(s3, 'send', async () => {throw new Error('Network must not be used for signing');});
  const storage = createS3Storage({...config, readUrlExpiresIn: 120}, {client: s3});
  const key = createObjectKey('jpg');
  const url = new URL(await storage.getReadUrl(key));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, `${config.bucket}.s3.${config.region}.amazonaws.com`);
  assert.equal(url.pathname, `/${key}`);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
  assert.equal(url.searchParams.get('X-Amz-Security-Token'), 'test-only-session');
  assert.ok(url.searchParams.get('X-Amz-Signature'));
  assert.equal(send.mock.callCount(), 0);
});

test('storage rejects unsafe keys and invalid upload metadata before calling AWS', async t => {
  const s3 = client();
  t.after(() => s3.destroy());
  const send = t.mock.method(s3, 'send', async () => ({}));
  const storage = createS3Storage(config, {client: s3});
  for (const key of ['outside/file.png', 'uploads/', 'uploads/../file', 'uploads/./file', 'uploads/a//b', 'uploads/a/', 'uploads/%2e%2e/file', 'uploads/a\\b', 'uploads/a?x=y', 'uploads/' + 'a'.repeat(512)]) {
    await assert.rejects(storage.putObject({key, body: Buffer.from(''), contentType: 'image/png'}), /Object key/);
    await assert.rejects(storage.getReadUrl(key), /Object key/);
    await assert.rejects(storage.deleteObject(key), /Object key/);
  }
  for (const contentType of ['', 'image', 'image/png\r\nX-Header: injected', 'text/html; charset=utf-8']) {
    await assert.rejects(storage.putObject({key: createObjectKey(), body: Buffer.from(''), contentType}), /content type/);
  }
  await assert.rejects(storage.putObject({key: createObjectKey(), body: 'text' as unknown as Uint8Array, contentType: 'text/plain'}), /bytes/);
  assert.equal(send.mock.callCount(), 0);
});

test('provider failures have safe operation-specific messages and retain internal causes', async t => {
  const s3 = client();
  t.after(() => s3.destroy());
  const failure = new Error('sensitive provider diagnostic');
  t.mock.method(s3, 'send', async () => {throw failure;});
  const storage = createS3Storage(config, {client: s3, signUrl: async () => {throw failure;}});
  const key = createObjectKey();
  const operations = [
    [() => storage.putObject({key, body: Buffer.from(''), contentType: 'text/plain'}), 'Object storage upload failed'],
    [() => storage.getReadUrl(key), 'Object storage URL signing failed'],
    [() => storage.deleteObject(key), 'Object storage deletion failed'],
    [() => storage.checkConnection(), 'Object storage connection check failed'],
  ] as const;
  for (const [operation, message] of operations) {
    await assert.rejects(operation, error => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.message, message);
      assert.equal(error.cause, failure);
      assert.equal(error.message.includes('sensitive'), false);
      return true;
    });
  }
});
