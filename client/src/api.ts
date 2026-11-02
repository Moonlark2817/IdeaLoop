import type { Project, ProjectInput, User } from './types';
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
export const getProjects = async () => (await request<{projects: Project[]}>('/projects')).projects;
export const getProject = async (id: string, signal?: AbortSignal) => (await request<{project: Project}>(`/projects/${id}`, { signal })).project;
export const createProject = async (data: ProjectInput) => (await request<{project: Project}>('/projects', { method: 'POST', body: JSON.stringify(data) })).project;
export const updateProject = async (id: string, data: ProjectInput) => (await request<{project: Project}>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) })).project;
export const deleteProject = (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' });
export function safeUrl(value: string | null): boolean {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value!.length <= 512; } catch { return false; }
}
