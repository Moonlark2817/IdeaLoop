import 'dotenv/config';
import { parseStorageEnvironment } from '../config/storage.js';
import { createS3Storage } from './s3Storage.js';

async function check(): Promise<void> {
  const config = parseStorageEnvironment(process.env);
  if (!config) throw new Error('Set S3_ENABLED=true and configure AWS_REGION and S3_BUCKET_NAME before checking storage');
  const storage = createS3Storage(config);
  try {
    await storage.checkConnection();
    console.log('S3 bucket connection verified. No objects were written or deleted.');
  } finally {
    storage.close();
  }
}

void check().catch(() => {
  console.error('S3 check failed. Verify S3_ENABLED, bucket/region settings, AWS authentication, and s3:ListBucket permission. See docs/object-storage.md.');
  process.exitCode = 1;
});
