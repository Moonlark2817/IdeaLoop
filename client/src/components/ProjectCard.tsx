import { Link } from "react-router-dom";
import type { Project } from "../types";

interface Props {
  project: Project;
}

export default function ProjectCard({ project }: Props) {
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className="project-category">Community Project</span>

        {project.is_seeking_collaborators && (
          <span className="collaborator-badge">
            Seeking Collaborators
          </span>
        )}
      </div>

      <h2>{project.title}</h2>

      <p className="project-description">
        {project.description.length > 160
          ? `${project.description.slice(0, 160)}...`
          : project.description}
      </p>

      <div className="project-card-footer">
        <span>Project #{project.id}</span>

        <Link to={`/projects/${project.id}`} className="text-link">
          View Project →
        </Link>
      </div>
    </article>
  );
}