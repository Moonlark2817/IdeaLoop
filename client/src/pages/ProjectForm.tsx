import { useEffect, useState } from "react";
import { type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createProject, getProject, updateProject, safeUrl } from "../api";
import { useAuth } from '../auth';
import type { ProjectInput } from "../types";

export default function ProjectForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const editing = Boolean(id);
  const { user } = useAuth();
  const [canEdit, setCanEdit] = useState(!id);

  const [form, setForm] = useState<ProjectInput>({
    title: "",
    description: "",
    project_url: "",
    is_seeking_collaborators: false
  });

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setCanEdit(false);
    getProject(id, controller.signal).then(project => {
      if (project.user_id !== user?.id) throw new Error('You can only edit your own projects.');
      setCanEdit(true);
      setForm({title: project.title, description: project.description, project_url: project.project_url || '', is_seeking_collaborators: project.is_seeking_collaborators});
    }).catch(err => {if (err.name !== 'AbortError') setError(err.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [id, user?.id]);

  function handleChange(
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement
    >
  ) {
    const { name, value, type } = event.target;

    if (type === "checkbox") {
      const checkbox = event.target as HTMLInputElement;

      setForm((previous) => ({
        ...previous,
        [name]: checkbox.checked
      }));

      return;
    }

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canEdit) return;
    setError("");

    const title = form.title.trim();
    const description = form.description.trim();
    const projectUrl = (form.project_url ?? "").trim();

    if (!title || !description) {
        setError("Please enter a project title and description.");
        return;
    }

    if (title.length > 150) {
        setError("Project titles cannot exceed 150 characters.");
        return;
    }

    if (projectUrl && !safeUrl(projectUrl)) {
      setError('Use an HTTP(S) URL without credentials, at most 512 characters.'); return;
    }

  try {
    setSaving(true);

    const projectData: ProjectInput = {
      title,
      description,
      project_url: projectUrl || null,
      is_seeking_collaborators: form.is_seeking_collaborators
    };

    if (editing && id) {
      const updated = await updateProject(id, projectData);
      navigate(`/projects/${updated.id}`);
    } else {
      const created = await createProject(projectData);
      navigate(`/projects/${created.id}`);
    }
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Unable to save project."
    );
    setSaving(false);
  }
}

  if (loading) {
    return <main className="page-container">Loading project...</main>;
  }

  if (!canEdit) return <main className="page-container"><p role="alert" className="error-message">{error || 'Project unavailable.'}</p><Link to="/projects">Back to projects</Link></main>;
  return (
    <main className="page-container form-page">
      <Link to="/projects" className="back-link">
        ← Back to Projects
      </Link>

      <section className="form-card">
        <p className="eyebrow">
          {editing ? "UPDATE YOUR WORK" : "SHARE YOUR WORK"}
        </p>

        <h1>{editing ? "Edit Project" : "Create a Project"}</h1>

        <p className="subtitle">
          {editing
            ? "Update your project information."
            : "Tell the community what you are working on."}
        </p>

        {error && <p role="alert" className="error-message">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Project Title *</label>

            <input
              id="title"
              name="title"
              type="text"
              placeholder="Enter your project title"
              value={form.title}
              onChange={handleChange}
              maxLength={150}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description *</label>

            <textarea
              id="description"
              name="description"
              placeholder="Describe your project, what you're building, and what makes it interesting..."
              value={form.description}
              onChange={handleChange}
              rows={7}
              required
            />

            <span className="character-count">
              {form.description.length} characters
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="project_url">Project URL</label>

            <input
              id="project_url"
              name="project_url"
              type="url"
              maxLength={512}
              placeholder="https://example.com"
              value={form.project_url || ""}
              onChange={handleChange}
            />
          </div>

          <label className="checkbox-group">
            <input
              type="checkbox"
              name="is_seeking_collaborators"
              checked={form.is_seeking_collaborators}
              onChange={handleChange}
            />

            <span>
              I am looking for collaborators to help with this project.
            </span>
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Create Project"}
            </button>

            <Link to="/projects" className="secondary-button">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}