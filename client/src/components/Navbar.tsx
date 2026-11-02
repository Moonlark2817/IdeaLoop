import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="navbar">
      <Link to="/projects" className="logo">
        IdeaLoop
      </Link>

      <div className="nav-links">
        <Link to="/projects">Explore Projects</Link>

        <Link to="/projects/new" className="nav-button">
          + Create Project
        </Link>
      </div>
    </nav>
  );
}