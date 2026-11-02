import type { Project, ProjectInput } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("idealoop_token");

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      data?.error?.message ||
      data?.message ||
      `Request failed with status ${response.status}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function extractProject(data: any): Project {
  return data.project ?? data;
}

export async function getProjects(): Promise<Project[]> {
  const data = await request<any>("/projects");

  return Array.isArray(data) ? data : data.projects ?? [];
}

export async function getProject(id: string): Promise<Project> {
  const data = await request<any>(`/projects/${id}`);

  return extractProject(data);
}

export async function createProject(
  project: ProjectInput
): Promise<Project> {
  const data = await request<any>("/projects", {
    method: "POST",
    body: JSON.stringify(project)
  });

  return extractProject(data);
}

export async function updateProject(
  id: string,
  project: ProjectInput
): Promise<Project> {
  const data = await request<any>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(project)
  });

  return extractProject(data);
}

export async function deleteProject(id: string): Promise<void> {
  await request<void>(`/projects/${id}`, {
    method: "DELETE"
  });
}