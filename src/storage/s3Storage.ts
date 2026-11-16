import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfiguration } from '../config/storage.js';

export const OBJECT_PREFIX = 'uploads/';

export class StorageError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, {cause});
    this.name = 'StorageError';
  }
}

/** Use opaque IDs, not user-provided filenames, for new objects. */
export function createObjectKey(extension = ''): string {
  if (extension && !/^[a-z0-9]{1,10}$/.test(extension)) {
    throw new Error('Object extension must contain 1–10 lowercase letters or digits');
  }
  return `${OBJECT_PREFIX}${randomUUID()}${extension ? `.${extension}` : ''}`;
}

function validateKey(key: string): void {
  if (typeof key !== 'string' || !key.startsWith(OBJECT_PREFIX) || key.length > 512 ||
      !/^uploads\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) ||
      key.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Object key must be a safe relative path inside uploads/');
  }
}

export interface ObjectStorage {
  putObject(input: {key: string; body: Uint8Array; contentType: string}): Promise<void>;
  getReadUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  checkConnection(): Promise<void>;
  close(): void;
}

/** Internal backend service: callers must enforce authorization and file policies. */
export function createS3Storage(
  config: StorageConfiguration,
  dependencies: {client?: S3Client; signUrl?: typeof getSignedUrl} = {},
): ObjectStorage {
  const client = dependencies.client ?? new S3Client({
    region: config.region,
    maxAttempts: 3,
    requestHandler: {connectionTimeout: 5000, requestTimeout: 10000},
  });
  const signUrl = dependencies.signUrl ?? getSignedUrl;

  return {
    async putObject({key, body, contentType}) {
      validateKey(key);
      if (!(body instanceof Uint8Array)) throw new Error('Object body must be bytes');
      if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(contentType)) {
        throw new Error('Object content type must be a valid MIME type without parameters');
      }
      try {
        await client.send(new PutObjectCommand({
          Bucket: config.bucket, Key: key, Body: body, ContentType: contentType,
        }));
      } catch (cause) {
        throw new StorageError('Object storage upload failed', cause);
      }
    },
    async getReadUrl(key) {
      validateKey(key);
      try {
        return await signUrl(client, new GetObjectCommand({Bucket: config.bucket, Key: key}), {
          expiresIn: config.readUrlExpiresIn,
        });
      } catch (cause) {
        throw new StorageError('Object storage URL signing failed', cause);
      }
    },
    async deleteObject(key) {
      validateKey(key);
      try {
        await client.send(new DeleteObjectCommand({Bucket: config.bucket, Key: key}));
      } catch (cause) {
        throw new StorageError('Object storage deletion failed', cause);
      }
    },
    async checkConnection() {
      try {
        await client.send(new HeadBucketCommand({Bucket: config.bucket}));
      } catch (cause) {
        throw new StorageError('Object storage connection check failed', cause);
      }
    },
    close() {client.destroy();},
  };
}
