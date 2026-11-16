import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import ProjectCard from "../components/ProjectCard";
import type { Project } from "../types";

const PAGE_SIZE = 20;

export default function SavedProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  async function load(offset: number) {
    const data = await request<{ projects: Project[]; pagination: { has_more: boolean } }>(
      `/saved-projects?limit=${PAGE_SIZE}&offset=${offset}`
    );
    setProjects((current) => (offset === 0 ? data.projects : [...current, ...data.projects]));
    setHasMore(data.pagination.has_more);
  }

  useEffect(() => {
    load(0)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load saved projects."))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await load(projects.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more projects.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="page-container">
      <h1>Saved projects</h1>

      {loading && <p role="status">Loading saved projects...</p>}
      {error && <p role="alert">{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <p>
          You haven't saved any projects yet. <Link to="/projects">Browse projects</Link>
        </p>
      )}

      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}

      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </main>
  );
}
