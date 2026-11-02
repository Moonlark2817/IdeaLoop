import { HttpError } from '../middleware/httpError.js';

export function objectBody(body: unknown, allowed: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'A JSON object body is required');
  }

  const value = body as Record<string, unknown>;

  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new HttpError(400, 'Request contains unsupported fields');
  }

  return value;
}

export function projectId(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > 2147483647
  ) {
    throw new HttpError(400, 'Project ID must be a positive integer');
  }

  return Number(value);
}

export function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 150) {
    throw new HttpError(400, 'Project title must contain 1–150 characters');
  }

  return value.trim();
}

export function description(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 10000
  ) {
    throw new HttpError(400, 'Project description must contain 1–10,000 characters');
  }

  return value.trim();
}

export function projectUrl(value: unknown): string | null {
  if (value === null || value === '') return null;

  if (typeof value !== 'string' || value.length > 512) {
    throw new HttpError(400, 'Project URL must be at most 512 characters or null');
  }

  try {
    const url = new URL(value);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error();
    }
  } catch {
    throw new HttpError(400, 'Project URL must be a valid HTTP(S) URL');
  }

  return value;
}

export function seekingCollaborators(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'is_seeking_collaborators must be true or false');
  }

  return value;
}