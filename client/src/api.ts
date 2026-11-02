import type { Project, ProjectInput, User, Comment } from './types';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const tokenKey = 'idealoop_token';
export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(tokenKey);
  let response: Response;
  try {
    response = await fetch(`/api${endpoint}`, { ...options, headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
    } });
  } catch (error) {
    if ((error as {name?: string})?.name === 'AbortError') throw error;
    throw new Error('Unable to reach IdeaLoop. Please try again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && token && !endpoint.startsWith('/auth/')) {
      sessionStorage.removeItem(tokenKey);
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(response.status, data?.error?.message || `Request failed (${response.status}). Please try again.`);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const login = (email: string, password: string) => request<{user: User; token: string}>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const register = (username: string, email: string, password: string) => request<{user: User; token: string}>('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
export const me = (signal?: AbortSignal) => request<{user: User}>('/users/me', { signal });
export const getProjects = (offset = 0, signal?: AbortSignal) => request<{projects: Project[]; pagination: {limit: number; offset: number}}>(`/projects?limit=20&offset=${offset}`, { signal });
export const getProject = async (id: string, signal?: AbortSignal) => (await request<{project: Project}>(`/projects/${id}`, { signal })).project;
export const createProject = async (data: ProjectInput) => (await request<{project: Project}>('/projects', { method: 'POST', body: JSON.stringify(data) })).project;
export const updateProject = async (id: string, data: ProjectInput) => (await request<{project: Project}>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) })).project;
export const deleteProject = (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' });
export const getComments = (id: string, offset = 0, signal?: AbortSignal) => request<{comments: Comment[]; pagination: {limit: number; offset: number}}>(`/projects/${id}/comments?limit=20&offset=${offset}`, { signal });
export const getComment = (project: string, id: number) => request<{comment: Comment}>(`/projects/${project}/comments/${id}`);
export const saveComment = (project: string, content: string, id?: number, parent_comment_id?: number) => request<{comment: Comment}>(`/projects/${project}/comments${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(id ? {content} : {content, parent_comment_id}) });
export const deleteComment = (project: string, id: number) => request<void>(`/projects/${project}/comments/${id}`, {method: 'DELETE'});
export function safeUrl(value: string | null): boolean {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value!.length <= 512; } catch { return false; }
}
