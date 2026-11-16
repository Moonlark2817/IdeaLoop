export interface StorageConfiguration {
  bucket: string;
  region: string;
  readUrlExpiresIn: number;
}

/** Opt-in configuration keeps database-only development and tests AWS-independent. */
export function parseStorageEnvironment(source: NodeJS.ProcessEnv): StorageConfiguration | undefined {
  if (source.S3_ENABLED !== undefined && source.S3_ENABLED !== 'true' && source.S3_ENABLED !== 'false') {
    throw new Error('S3_ENABLED must be true or false');
  }
  if (source.S3_ENABLED !== 'true') return undefined;

  const bucket = source.S3_BUCKET_NAME?.trim() ?? '';
  const reservedPrefix = /^(xn--|sthree-|amzn-s3-demo-)/;
  const reservedSuffix = /(-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/;
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(bucket) || reservedPrefix.test(bucket) || reservedSuffix.test(bucket)) {
    throw new Error('S3_BUCKET_NAME must be a valid AWS general-purpose bucket name');
  }
  const region = source.AWS_REGION?.trim() ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+-\d+$/.test(region)) {
    throw new Error('AWS_REGION is required and must be an AWS region identifier');
  }
  const rawExpires = source.S3_READ_URL_TTL_SECONDS ?? '900';
  const readUrlExpiresIn = Number(rawExpires);
  if (!/^\d+$/.test(rawExpires) || !Number.isInteger(readUrlExpiresIn) || readUrlExpiresIn < 1 || readUrlExpiresIn > 3600) {
    throw new Error('S3_READ_URL_TTL_SECONDS must be an integer from 1 to 3600');
  }

  // Do not require static keys: production IAM roles and local AWS profiles use
  // the SDK's default credential chain. Reject incomplete environment overrides.
  const accessKey = source.AWS_ACCESS_KEY_ID;
  const secretKey = source.AWS_SECRET_ACCESS_KEY;
  if (Boolean(accessKey) !== Boolean(secretKey) || (source.AWS_SESSION_TOKEN && !accessKey)) {
    throw new Error('AWS environment credentials must include both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  }
  if (accessKey === 'your_access_key' || secretKey === 'your_secret_key') {
    throw new Error('Replace placeholder AWS credentials or remove them to use an AWS profile or IAM role');
  }
  return {bucket, region, readUrlExpiresIn};
}
