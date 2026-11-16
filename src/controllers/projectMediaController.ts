import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import multer from 'multer';
import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const uploadDirectory = resolve(
  process.cwd(),
  'uploads',
  'project-images'
);

export const uploadProjectImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      callback(
        new HttpError(
          400,
          'Only JPEG, PNG, WEBP, and GIF images are allowed'
        )
      );
      return;
    }

    callback(null, true);
  },
}).single('image');

function identifyImage(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return 'png';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpg';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  const signature = buffer.toString('ascii', 0, 6);

  if (signature === 'GIF87a' || signature === 'GIF89a') {
    return 'gif';
  }

  return null;
}

export function createProjectMediaController(db: Kysely<Database>) {
  const list: RequestHandler = async (req, res) => {
    const projectId = Number(req.params.id);

    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      throw new HttpError(400, 'Invalid project ID');
    }

    const project = await db
      .selectFrom('projects')
      .select('id')
      .where('id', '=', projectId)
      .executeTakeFirst();

    if (!project) {
      throw new HttpError(404, 'Project not found');
    }

    const media = await db
      .selectFrom('project_media')
      .select([
        'id',
        'project_id',
        'media_url',
        'media_type',
        'display_order',
        'created_at',
      ])
      .where('project_id', '=', projectId)
      .where('media_type', '=', 'image')
      .orderBy('display_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute();

    res.json({ media });
  };

  const upload: RequestHandler = async (req, res) => {
    const projectId = Number(req.params.id);
    const userId = res.locals.userId as number;

    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      throw new HttpError(400, 'Invalid project ID');
    }

    const project = await db
      .selectFrom('projects')
      .select(['id', 'user_id'])
      .where('id', '=', projectId)
      .executeTakeFirst();

    if (!project) {
      throw new HttpError(404, 'Project not found');
    }

    if (project.user_id !== userId) {
      throw new HttpError(
        403,
        'You can only upload images to your own projects'
      );
    }

    if (!req.file) {
      throw new HttpError(400, 'Please select an image to upload');
    }

    const extension = identifyImage(req.file.buffer);

    if (!extension) {
      throw new HttpError(
        400,
        'The uploaded file is not a valid supported image'
      );
    }

    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };

    const filename = `${randomUUID()}.${extension}`;
    const filePath = resolve(uploadDirectory, filename);
    const mediaUrl = `/uploads/project-images/${filename}`;

    await mkdir(uploadDirectory, { recursive: true });

    await writeFile(filePath, req.file.buffer, { flag: 'wx' });

    try {
      const existingMedia = await db
        .selectFrom('project_media')
        .select(db.fn.count<number>('id').as('count'))
        .where('project_id', '=', projectId)
        .where('media_type', '=', 'image')
        .executeTakeFirst();

      const displayOrder = Number(existingMedia?.count ?? 0);

      const media = await db
        .insertInto('project_media')
        .values({
          project_id: projectId,
          media_url: mediaUrl,
          media_type: 'image',
          display_order: displayOrder,
        })
        .returning([
          'id',
          'project_id',
          'media_url',
          'media_type',
          'display_order',
          'created_at',
        ])
        .executeTakeFirstOrThrow();

      res.status(201).json({
        message: 'Image uploaded successfully',
        media: {
          ...media,
          content_type: contentTypes[extension],
        },
      });
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
  };

  return { list, upload };
}