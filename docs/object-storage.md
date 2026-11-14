# AWS S3 object storage — issue #47

This is the backend storage foundation. It adds configuration, an internal S3
service, offline tests, and a read-only connectivity command. Project image upload
endpoints, media records, file validation, authorization, and React upload controls
belong to issue #46. No bucket has been created or live AWS access verified by this
change. No database migration is needed.

## 1. Create a private bucket

In the AWS console, select **S3 → Create bucket**:

1. Choose a general-purpose bucket and a globally unique name, such as
   `idealoop-dev-<your-unique-suffix>`. Use separate development and production buckets.
2. Select the region you will configure as `AWS_REGION` (for example, `us-east-1`).
3. Keep **Object Ownership → Bucket owner enforced**, with ACLs disabled.
4. Keep all four **Block Public Access** settings enabled.
5. Keep default server-side encryption enabled; SSE-S3 is sufficient for this setup.
6. Create the bucket. Do not enable public website hosting or public-read ACLs.

Bucket creation and IAM administration are one-time setup operations performed by
an account administrator, not by the application's runtime identity. Existing
buckets may be used if these settings and permissions are already suitable.

Alternatively, an administrator with the AWS CLI installed can create a new bucket
in `us-east-1` and set its security defaults explicitly:

```sh
export IDEALOOP_BUCKET='replace-with-a-globally-unique-bucket-name'
aws s3api create-bucket --bucket "$IDEALOOP_BUCKET" --region us-east-1 --object-ownership BucketOwnerEnforced
aws s3api put-public-access-block --bucket "$IDEALOOP_BUCKET" --region us-east-1 --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$IDEALOOP_BUCKET" --region us-east-1 --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

For a region other than `us-east-1`, use that region on every command and add
`--create-bucket-configuration LocationConstraint=<region>` to `create-bucket`.
Do not run creation commands against an existing bucket. If you select SSE-KMS
instead of SSE-S3, separately configure the required KMS key permissions.

## 2. Give the backend access

Use an AWS profile/IAM Identity Center session locally, or an IAM role on the
production backend. The service uses the AWS SDK's default credential provider
chain, including environment credentials, profiles, and workload roles.

Attach the example [runtime IAM policy](s3-runtime-policy.json) to that identity
after replacing both `REPLACE_WITH_BUCKET_NAME` placeholders with your bucket name.
For nonstandard AWS partitions, adjust the ARN partition as well.

The policy permits bucket-level `s3:ListBucket` for the `HeadBucket` connection
check and object-level put/get/delete only under `uploads/`. It does not grant
bucket creation, public access, ACL changes, or IAM administration. Listing object
names in this bucket is also allowed by `s3:ListBucket`; use a dedicated bucket.

For local SSO, configure a profile through your team's AWS login process and run:

```sh
aws sso login --profile idealoop-dev
```

The AWS CLI is required only for CLI setup/login instructions, not for the Node.js
storage service. Never put AWS credentials in `client/`, browser storage, Git, PR
comments, or screenshots.

## 3. Configure the ignored backend `.env`

```dotenv
S3_ENABLED=true
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-actual-bucket-name
S3_READ_URL_TTL_SECONDS=900
AWS_PROFILE=idealoop-dev
```

Omit `AWS_PROFILE` when using a production IAM role. If your deployment supplies
environment credentials, use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
together, plus `AWS_SESSION_TOKEN` for temporary credentials. Remove unused or
placeholder environment keys: they take precedence over profiles and roles.

`S3_ENABLED` defaults to disabled; only `true` and `false` are accepted when set.
With storage disabled, no AWS settings or credentials are required. With it
enabled, bucket, region, and URL lifetime are validated during normal backend
startup. Read URL lifetime defaults to 900 seconds and must be 1–3600 seconds.
Temporary AWS credentials can expire before the requested URL lifetime.

Enabling storage validates configuration but does not add routes or automatically
upload anything. Existing database and health endpoints remain independent of S3.

## 4. Verify connectivity

From the repository root:

```sh
npm ci
npm run storage:check
```

This command loads `.env`, validates storage settings, and performs `HeadBucket`.
It needs AWS credentials but no database connection or JWT secret. It makes no
object writes/deletes and exits nonzero on configuration/authentication/provider
failure. A successful check proves bucket access; it does not prove object
put/get/delete permissions. It is not a storage write/read smoke test.

If it fails, check the active profile/session, actual bucket name, region, and
`s3:ListBucket` permission. `HeadBucket` may return generic errors for a nonexistent
or inaccessible bucket. No credential values or provider diagnostics are printed.

## 5. Use the internal service in the later upload feature

```typescript
import { parseStorageEnvironment } from '../config/storage.js';
import { createObjectKey, createS3Storage } from '../storage/s3Storage.js';

const config = parseStorageEnvironment(process.env);
if (!config) throw new Error('Object storage is disabled');
const storage = createS3Storage(config);
try {
  // After authorizing the user and validating the actual file bytes:
  const key = createObjectKey('png');
  await storage.putObject({key, body: validatedFileBytes, contentType: 'image/png'});
  const temporaryReadUrl = await storage.getReadUrl(key);
  // Persist the object key; generate fresh read URLs when returning media.
  // Later, after checking ownership:
  await storage.deleteObject(key);
} finally {
  storage.close();
}
```

The snippet assumes a future controller supplies `validatedFileBytes`; it is not a
standalone upload script. In the real server, create one service instance, inject
it into media handlers, and close it during graceful shutdown, rather than creating
one per request. Use the existing application's missing-storage behavior when
wiring the upload routes (for example, a clear 503).

Objects use opaque UUID keys under `uploads/`, avoiding user-supplied filenames.
The service rejects unsafe/out-of-prefix paths. Extensions contain up to ten
lowercase letters/digits; MIME values are syntactically validated. These checks do
not verify file content, enforce size limits, scan files, or authorize a user.
Those checks must be implemented before exposing upload/sign/delete endpoints.
Treat stored content types as trusted only after file validation.

`getReadUrl` signs a private GET locally; it does not check object existence or make
the bucket public. Signed URLs are temporary bearer access and should not be logged
or saved as permanent media URLs. The current `project_media.media_url` schema is
not modified; issue #46 must decide how to persist keys/metadata and generate URLs.

Database cascades do not delete objects in S3. Issue #46 must also handle cleanup
when media/projects are deleted and when a database write fails after an upload.
If bucket versioning is enabled, normal deletion creates a delete marker; configure
lifecycle rules for old versions as appropriate. This service does not manage
versions or multipart uploads. Browser-to-S3 CORS is unnecessary for this
backend-only foundation; configure it for your actual frontend origin only if the
later upload design needs direct browser transfers or fetches.

## Tests

```sh
npm test
npm run typecheck
npm run build
```

Storage tests use SDK calls with mocked transport behavior and explicit test-only
credentials. Presigned URL tests use the real signer locally. No AWS account,
network access, real secrets, or provisioned bucket is needed for automated tests.

Official references:

- [S3 bucket naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
- [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [Node.js credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [AWS SDK v3 S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [HeadBucket permissions and error behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html)
