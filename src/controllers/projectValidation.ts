import { HttpError } from '../middleware/httpError.js';
import { objectBody } from './userValidation.js';

export function projectId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
    throw new HttpError(400, 'Project ID must be a positive integer');
  }
  return Number(value);
}

export function projectInput(body: unknown, partial = false) {
  const value = objectBody(body, ['title', 'description', 'project_url', 'is_seeking_collaborators']);
  const input: {
    title?: string; description?: string; project_url?: string | null;
    is_seeking_collaborators?: boolean;
  } = {};
  for (const field of ['title', 'description'] as const) {
    if (!partial || value[field] !== undefined) {
      const text = value[field];
      if (typeof text !== 'string' || !text.trim() || (field === 'title' && text.trim().length > 150)) {
        throw new HttpError(400, `${field} must be nonempty text${field === 'title' ? ' of at most 150 characters' : ''}`);
      }
      input[field] = text.trim();
    }
  }
  if (value.project_url !== undefined) {
    const url = value.project_url;
    if (url !== null) {
      try {
        if (typeof url !== 'string' || url.length > 512) throw new Error();
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
      } catch {
        throw new HttpError(400, 'project_url must be an HTTP(S) URL without credentials, at most 512 characters, or null');
      }
    }
    input.project_url = url as string | null;
  }
  if (value.is_seeking_collaborators !== undefined) {
    if (typeof value.is_seeking_collaborators !== 'boolean') {
      throw new HttpError(400, 'is_seeking_collaborators must be true or false');
    }
    input.is_seeking_collaborators = value.is_seeking_collaborators;
  }
  if (partial && Object.keys(input).length === 0) throw new HttpError(400, 'Provide at least one field to update');
  return input;
}
