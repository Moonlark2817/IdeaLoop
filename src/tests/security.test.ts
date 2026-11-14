import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { credentialVersion, hashPassword, verifyPassword } from '../security/password.js';
import { issueToken, verifyToken } from '../security/token.js';

const secret = 'security-test-only-secret-with-at-least-32-characters';

test('password hashes use different salts and verify only the matching password', async () => {
  const password = 'same password, independent salts';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + '!', first), false);
  assert.match(credentialVersion(first), /^[a-f0-9]{64}$/);
  assert.notEqual(credentialVersion(first), credentialVersion(second));
});

test('malformed or unsupported password hashes fail verification without throwing', async () => {
  const salt = 'a'.repeat(32);
  const digest = 'b'.repeat(128);
  for (const hash of ['', 'plaintext', 'scrypt', `scrypt$65536$8$1$${salt}`, `scrypt$1$8$1$${salt}$${digest}`,
    `scrypt$65536$8$1$short$${digest}`, `scrypt$65536$8$1$${salt}$short`, `scrypt$65536$8$1$${'z'.repeat(32)}$${digest}`,
    `scrypt$65536$8$1$${salt}$${'z'.repeat(128)}`, `scrypt$65536$8$1$${salt}$${digest}$extra`]) {
    assert.equal(await verifyPassword('test password', hash), false, hash);
  }
});

test('issued tokens identify their user and credential version', () => {
  const token = issueToken(42, 'password-hash', secret);
  assert.deepEqual(verifyToken(token, secret), {id: 42, version: credentialVersion('password-hash')});
  const payload = jwt.decode(token) as jwt.JwtPayload;
  assert.equal(payload.iss, 'idealoop');
  assert.equal(payload.aud, 'idealoop-api');
  assert.equal(payload.exp! - payload.iat!, 3600);
});

test('JWT verification rejects missing and malformed claims', () => {
  const defaults = {sub: '42', version: 'credential-version', exp: Math.floor(Date.now() / 1000) + 3600, iss: 'idealoop', aud: 'idealoop-api'};
  const invalid: Array<Record<string, unknown>> = [];
  for (const field of ['sub', 'version', 'exp']) {
    const claims: Record<string, unknown> = {...defaults}; delete claims[field]; invalid.push(claims);
  }
  for (const sub of ['0', '-1', '1.5', '2147483648', '9007199254740992', 'abc', 42]) invalid.push({...defaults, sub});
  for (const version of [null, 1, {}]) invalid.push({...defaults, version});
  for (const claims of invalid) {
    // jsonwebtoken itself refuses nonstring sub claims when signing; use a valid
    // JSON payload signed as bytes to exercise the verifier on that malformed JWT.
    const token = jwt.sign(Buffer.from(JSON.stringify(claims)), secret, {algorithm: 'HS256'});
    assert.throws(() => verifyToken(token, secret));
  }
});

test('JWT verification rejects wrong trust settings and invalid validity windows', () => {
  const claims = {sub: '1', version: 'v', iss: 'idealoop', aud: 'idealoop-api'};
  const tokens = [
    jwt.sign({...claims, iss: 'someone-else'}, secret, {expiresIn: 3600}),
    jwt.sign({...claims, aud: 'other-api'}, secret, {expiresIn: 3600}),
    jwt.sign(claims, secret, {expiresIn: -1}),
    jwt.sign(claims, secret, {expiresIn: 3600, notBefore: 3600}),
    jwt.sign(claims, 'wrong-signing-secret', {expiresIn: 3600}),
    jwt.sign(claims, secret, {algorithm: 'HS384', expiresIn: 3600}),
    jwt.sign(claims, '', {algorithm: 'none', expiresIn: 3600}),
    'not.a.jwt',
  ];
  for (const token of tokens) assert.throws(() => verifyToken(token, secret));
});
