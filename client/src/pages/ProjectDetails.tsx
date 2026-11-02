import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteProject, getProject, safeUrl } from "../api";
import Comments from '../components/Comments';
import { useAuth } from '../auth';
import type { Project } from "../types";

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setProject(null);
    getProject(id!, controller.signal).then(setProject).catch(err => {if (err.name !== 'AbortError') setError(err.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    if (!id || !project || deleting || project.user_id !== user?.id) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this project? All media, comments and replies, likes, saves, and project-linked collaboration requests will also be deleted. This cannot be undone."
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

  if (!project) {
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
          {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Unknown date'}
        </p>

        <div className="details-section">
          <h2>About This Project</h2>
          <p className="details-description">{project.description}</p>
        </div>

        {safeUrl(project.project_url) && (
          <div className="details-section">
            <h2>Project Link</h2>

            <a
              href={project.project_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Visit Project →
            </a>
          </div>
        )}

        {error && <p role="alert" className="error-message">{error}</p>}
        {user?.id === project.user_id && <div className="details-actions">
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
        </div>}
      </article>
      <Comments key={id} project={id!} />
    </main>
  );
}