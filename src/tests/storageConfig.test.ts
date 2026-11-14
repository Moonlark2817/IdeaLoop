import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStorageEnvironment } from '../config/storage.js';
import { parseEnvironment } from '../config/env.js';

const source = {S3_ENABLED: 'true', S3_BUCKET_NAME: 'idealoop-test-bucket', AWS_REGION: 'us-east-1'};
const config = {bucket: 'idealoop-test-bucket', region: 'us-east-1', readUrlExpiresIn: 900};

test('storage is opt-in and does not require AWS credentials for ordinary development', () => {
  assert.equal(parseStorageEnvironment({}), undefined);
  assert.equal(parseStorageEnvironment({S3_ENABLED: 'false', S3_BUCKET_NAME: 'ignored invalid config'}), undefined);
  assert.deepEqual(parseStorageEnvironment(source), config);
  assert.deepEqual(parseStorageEnvironment({...source, AWS_PROFILE: 'local-profile'}), config);
  assert.deepEqual(parseStorageEnvironment({...source, AWS_ACCESS_KEY_ID: 'key', AWS_SECRET_ACCESS_KEY: 'secret', AWS_SESSION_TOKEN: 'session'}), config);
  const environment = parseEnvironment({DATABASE_URL: 'postgresql://localhost/test', ...source});
  assert.deepEqual(environment.storage, config);
  assert.equal(Object.hasOwn(environment, 'AWS_SECRET_ACCESS_KEY'), false);
});

test('storage configuration rejects invalid toggles, buckets, regions, TTLs, and partial credentials', () => {
  for (const enabled of ['1', 'TRUE', '']) assert.throws(() => parseStorageEnvironment({S3_ENABLED: enabled}), /S3_ENABLED/);
  for (const bucket of ['', 'ab', 'A-Bucket', 'a'.repeat(64), 'https://example.com', '192.168.1.1', 'a..b', 'xn--reserved', 'test--x-s3', 'amzn-s3-demo-example']) {
    assert.throws(() => parseStorageEnvironment({...source, S3_BUCKET_NAME: bucket}), /S3_BUCKET_NAME/, bucket);
  }
  for (const region of ['', 'us east', 'https://aws.example', 'your_region']) {
    assert.throws(() => parseStorageEnvironment({...source, AWS_REGION: region}), /AWS_REGION/);
  }
  for (const ttl of ['0', '3601', '-1', '1.5', '', 'forever']) {
    assert.throws(() => parseStorageEnvironment({...source, S3_READ_URL_TTL_SECONDS: ttl}), /S3_READ_URL_TTL_SECONDS/);
  }
  for (const ttl of ['1', '3600']) assert.equal(parseStorageEnvironment({...source, S3_READ_URL_TTL_SECONDS: ttl})!.readUrlExpiresIn, Number(ttl));
  for (const credentials of [{AWS_ACCESS_KEY_ID: 'key'}, {AWS_SECRET_ACCESS_KEY: 'secret'}, {AWS_SESSION_TOKEN: 'session'}]) {
    assert.throws(() => parseStorageEnvironment({...source, ...credentials}), /credentials/);
  }
  assert.throws(() => parseStorageEnvironment({...source, AWS_ACCESS_KEY_ID: 'your_access_key', AWS_SECRET_ACCESS_KEY: 'your_secret_key'}), /placeholder/);
  assert.throws(() => parseEnvironment({DATABASE_URL: 'postgresql://localhost/test', S3_ENABLED: 'true'}), /S3_BUCKET_NAME/);
});
