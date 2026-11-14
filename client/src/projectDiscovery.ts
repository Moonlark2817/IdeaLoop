export interface FeedFilters {
  q: string;
  sort: 'newest' | 'oldest';
  seekingCollaborators: boolean;
  offset: number;
}

/** URL values are untrusted; invalid or repeated values fall back to defaults. */
export function readFeedFilters(params: URLSearchParams): FeedFilters {
  const single = (key: string) => params.getAll(key).length === 1 ? params.get(key)! : '';
  const text = single('q').trim();
  const rawOffset = single('offset');
  return {
    q: text.length <= 200 && !text.includes('\0') ? text : '',
    sort: single('sort') === 'oldest' ? 'oldest' : 'newest',
    seekingCollaborators: single('seeking_collaborators') === 'true',
    offset: /^\d+$/.test(rawOffset) && Number(rawOffset) <= 2147483647 ? Number(rawOffset) : 0,
  };
}

export function feedSearchParams(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  // Newest-first is the UI default; the API helper still sends it explicitly.
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.seekingCollaborators) params.set('seeking_collaborators', 'true');
  if (filters.offset) params.set('offset', String(filters.offset));
  return params;
}
