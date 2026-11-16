import { HttpError } from '../middleware/httpError.js';
import { objectBody } from './userValidation.js';

export function commentId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
    throw new HttpError(400, 'Comment ID must be a positive integer');
  }
  return Number(value);
}

export function commentInput(body: unknown, partial = false) {
  const value = objectBody(body, partial ? ['content'] : ['content', 'parent_comment_id']);
  if (typeof value.content !== 'string' || !value.content.trim()) {
    throw new HttpError(400, 'content must be nonempty text');
  }
  const parent = value.parent_comment_id ?? null;
  if (parent !== null && (typeof parent !== 'number' || !Number.isInteger(parent) || parent <= 0 || parent > 2147483647)) {
    throw new HttpError(400, 'parent_comment_id must be a positive integer or null');
  }
  return { content: value.content.trim(), parent_comment_id: parent as number | null };
}
