import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('the storage check CLI fails clearly when disabled without requiring a database or AWS account', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/storage/check.ts'], {
    env: {...process.env, S3_ENABLED: 'false', DATABASE_URL: '', JWT_SECRET: ''},
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /S3 check failed/);
  assert.match(result.stderr, /docs\/object-storage.md/);
  assert.equal(result.stdout, '');
});
