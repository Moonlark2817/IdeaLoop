import { afterEach, expect, test, vi } from 'vitest';
import { request, tokenKey, safeUrl } from './api';
afterEach(() => vi.restoreAllMocks());
test('sends session credentials and handles 204', async () => {
 sessionStorage.setItem(tokenKey, 'token'); const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {status: 204}));
 expect(await request('/projects/1', {method: 'DELETE'})).toBeUndefined();
 expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({Authorization: 'Bearer token'});
});
test('clears rejected sessions but preserves session on failed login', async () => {
 sessionStorage.setItem(tokenKey, 'token'); vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({error: {message: 'Invalid'}}), {status: 401}));
 await expect(request('/auth/login')).rejects.toThrow('Invalid'); expect(sessionStorage.getItem(tokenKey)).toBe('token');
 await expect(request('/users/me')).rejects.toMatchObject({status: 401}); expect(sessionStorage.getItem(tokenKey)).toBeNull();
});
test('handles network errors, cancellation, and non-JSON errors', async () => {
 const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
 await expect(request('/projects')).rejects.toThrow('Unable to reach');
 fetcher.mockRejectedValue(new DOMException('Cancelled', 'AbortError')); await expect(request('/projects')).rejects.toMatchObject({name: 'AbortError'});
 fetcher.mockResolvedValue(new Response('busy', {status: 429})); await expect(request('/projects')).rejects.toMatchObject({status: 429});
});
test('validates clickable external links', () => {
 expect(safeUrl('https://example.com')).toBe(true); for (const url of ['javascript:alert(1)', 'https://user:pass@example.com', 'invalid']) expect(safeUrl(url)).toBe(false);
});

test('encodes discovery filters without treating user input as query parameters', async () => {
 const {getProjects} = await import('./api');
 const controller = new AbortController();
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({projects: [], pagination: {limit: 20, offset: 40, has_more: false}})));
 const response = await getProjects({q: '  music & art_%\\  ', sort: 'newest', seekingCollaborators: false, offset: 40}, controller.signal);
 const url = new URL(fetcher.mock.calls[0][0] as string, 'http://localhost');
 expect(url.searchParams.get('q')).toBe('music & art_%\\');
 expect(url.searchParams.get('sort')).toBe('newest');
 expect(url.searchParams.get('seeking_collaborators')).toBe('false');
 expect(url.searchParams.get('offset')).toBe('40');
 expect(url.searchParams.get('limit')).toBe('20');
 expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
 expect(response.pagination.has_more).toBe(false);
});
