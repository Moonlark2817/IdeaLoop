import { useEffect, useState } from "react";
import ProjectCard from "../components/ProjectCard";
import { getProjects } from "../api";
import type { Project } from "../types";

export default function ProjectFeed() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [seekingCollaborators, setSeekingCollaborators] = useState<
    "true" | "false" | ""
  >("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      setLoading(true);
      setError("");

      try {
        const data = await getProjects({
          search,
          sort,
          seekingCollaborators
        });

        if (active) {
          setProjects(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load projects."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProjects();

    return () => {
      active = false;
    };
  }, [search, sort, seekingCollaborators]);

  function clearFilters() {
    setSearch("");
    setSort("newest");
    setSeekingCollaborators("");
  }

  const hasFilters =
    search.trim() !== "" ||
    sort !== "newest" ||
    seekingCollaborators !== "";

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

      <section className="feed-toolbar">
        <div className="discovery-search">
          <label htmlFor="project-search">Search projects</label>

          <input
            id="project-search"
            type="search"
            placeholder="Search by project title or description..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="discovery-filters">
          <div>
            <label htmlFor="project-sort">Sort by</label>

            <select
              id="project-sort"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as "newest" | "oldest")
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <div>
            <label htmlFor="collaborator-filter">
              Collaboration status
            </label>

            <select
              id="collaborator-filter"
              value={seekingCollaborators}
              onChange={(event) =>
                setSeekingCollaborators(
                  event.target.value as "true" | "false" | ""
                )
              }
            >
              <option value="">All projects</option>
              <option value="true">Seeking collaborators</option>
              <option value="false">Not seeking collaborators</option>
            </select>
          </div>

          <button
            type="button"
            className="clear-filters-button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear filters
          </button>
        </div>
      </section>

      {loading && (
        <p className="status-message">Loading projects...</p>
      )}

      {error && (
        <p className="error-message">{error}</p>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="empty-state">
          <h2>No projects found</h2>

          <p>
            {hasFilters
              ? "Try changing your search or filters."
              : "Be the first to share a project with the community."}
          </p>

          {hasFilters && (
            <button
              type="button"
              className="secondary-button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <>
          <p className="project-results-count">
            {projects.length} {projects.length === 1 ? "project" : "projects"} found
          </p>

          <section className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}