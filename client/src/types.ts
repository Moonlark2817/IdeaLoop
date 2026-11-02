export interface Project {
  id: number;
  user_id: number;
  title: string;
  description: string;
  project_url: string | null;
  is_seeking_collaborators: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  title: string;
  description: string;
  project_url: string | null;
  is_seeking_collaborators: boolean;
}
export interface User { id: number; username: string; email: string; bio: string | null; avatar_url: string | null }
