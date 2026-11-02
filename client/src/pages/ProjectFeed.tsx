import { useEffect, useState } from "react";
import ProjectCard from "../components/ProjectCard";
import { getProjects } from "../api";
import type { Project } from "../types";

export default function ProjectFeed() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await getProjects();
        setProjects(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load projects."
        );
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, []);

  const filteredProjects = projects.filter((project) => {
    const searchText = search.toLowerCase();

    return (
      project.title.toLowerCase().includes(searchText) ||
      project.description.toLowerCase().includes(searchText)
    );
  });

  return (
    <main className="page-container">
      <section className="feed-header">
        <div>
          <p className="eyebrow">DISCOVER AND CREATE</p>
          <h1>Explore Projects</h1>
          <p className="subtitle">
            Discover what people are creating and find your next collaboration.
          </p>
        </div>
      </section>

      <div className="feed-toolbar">
        <input
          type="search"
          placeholder="Search projects..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search projects"
        />
      </div>

      {loading && <p className="status-message">Loading projects...</p>}

      {error && <p className="error-message">{error}</p>}

      {!loading && !error && filteredProjects.length === 0 && (
        <div className="empty-state">
          <h2>No projects found</h2>
          <p>
            {search
              ? "Try a different search term."
              : "Be the first to share a project with the community."}
          </p>
        </div>
      )}

      {!loading && !error && filteredProjects.length > 0 && (
        <section className="project-grid">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </section>
      )}
    </main>
  );
}