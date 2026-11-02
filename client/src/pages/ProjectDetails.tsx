import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteProject, getProject } from "../api";
import type { Project } from "../types";

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadProject() {
      try {
        if (!id) throw new Error("Project ID is missing.");

        const data = await getProject(id);
        setProject(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load project."
        );
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [id]);

  async function handleDelete() {
    if (!id || !project) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this project? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteProject(id);
      navigate("/projects");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete project."
      );
      setDeleting(false);
    }
  }

  if (loading) {
    return <main className="page-container">Loading project...</main>;
  }

  if (error || !project) {
    return (
      <main className="page-container">
        <p className="error-message">{error || "Project not found."}</p>
        <Link to="/projects" className="text-link">
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container">
      <Link to="/projects" className="back-link">
        ← Back to Projects
      </Link>

      <article className="details-card">
        <div className="details-top">
          <span className="project-category">Community Project</span>

          {project.is_seeking_collaborators && (
            <span className="collaborator-badge">
              Seeking Collaborators
            </span>
          )}
        </div>

        <h1>{project.title}</h1>

        <p className="project-meta">
          Project #{project.id} · Created{" "}
          {new Date(project.created_at).toLocaleDateString()}
        </p>

        <div className="details-section">
          <h2>About This Project</h2>
          <p className="details-description">{project.description}</p>
        </div>

        {project.project_url && (
          <div className="details-section">
            <h2>Project Link</h2>

            <a
              href={project.project_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Visit Project →
            </a>
          </div>
        )}

        <div className="details-actions">
          <Link
            to={`/projects/${project.id}/edit`}
            className="primary-button"
          >
            Edit Project
          </Link>

          <button
            className="danger-button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Project"}
          </button>
        </div>
      </article>
    </main>
  );
}