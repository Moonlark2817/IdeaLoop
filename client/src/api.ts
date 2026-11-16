import type {
  Project,
  ProjectInput,
  ProjectMedia,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export interface ProjectSearchFilters {
  search?: string;
  sort?: "newest" | "oldest";
  seekingCollaborators?: "true" | "false" | "";
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("idealoop_token");

  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(isFormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
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

export async function getProjects(
  filters: ProjectSearchFilters = {}
): Promise<Project[]> {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("q", filters.search.trim());
  }

  if (filters.sort) {
    params.set("sort", filters.sort);
  }

  if (filters.seekingCollaborators) {
    params.set(
      "seeking_collaborators",
      filters.seekingCollaborators
    );
  }

  const queryString = params.toString();

  const endpoint = queryString
    ? `/projects?${queryString}`
    : "/projects";

  const data = await request<any>(endpoint);

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
    body: JSON.stringify(project),
  });

  return extractProject(data);
}

export async function updateProject(
  id: string,
  project: ProjectInput
): Promise<Project> {
  const data = await request<any>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(project),
  });

  return extractProject(data);
}

export async function deleteProject(id: string): Promise<void> {
  await request<void>(`/projects/${id}`, {
    method: "DELETE",
  });
}

export async function getProjectMedia(
  projectId: string
): Promise<ProjectMedia[]> {
  const data = await request<{ media: ProjectMedia[] }>(
    `/projects/${projectId}/media`
  );

  return data.media;
}

export async function uploadProjectImage(
  projectId: string,
  image: File
): Promise<ProjectMedia> {
  const formData = new FormData();

  formData.append("image", image);

  const data = await request<{ media: ProjectMedia }>(
    `/projects/${projectId}/media`,
    {
      method: "POST",
      body: formData,
    }
  );

  return data.media;
}