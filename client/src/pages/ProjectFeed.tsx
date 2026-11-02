import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProjects } from '../api';
import ProjectCard from '../components/ProjectCard';
import type { Project } from '../types';
export default function ProjectFeed() {
 const [projects, setProjects] = useState<Project[]>([]); const [offset, setOffset] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
 useEffect(() => { const controller = new AbortController(); setLoading(true); setError('');
 getProjects(offset, controller.signal).then(data => setProjects(data.projects)).catch(err => {if (err.name !== 'AbortError') setError(err.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
 return () => controller.abort(); }, [offset, attempt]);
 return <main className="page-container"><header className="feed-header"><div><p className="eyebrow">CREATE · SHARE · CONNECT</p><h1>Community projects</h1><p className="subtitle">Discover what the IdeaLoop community is building.</p></div><Link className="primary-button" to="/projects/new">Create project</Link></header>
 {loading ? <p role="status">Loading projects…</p> : error ? <div role="alert"><p className="error-message">{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></div> : <><div className="project-grid">{projects.map(project => <ProjectCard key={project.id} project={project} />)}</div>{!projects.length && <p className="empty-state">No projects on this page yet.</p>}<div className="form-actions"><button className="secondary-button" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 20))}>Previous</button><span>Page {offset / 20 + 1}</span><button className="secondary-button" disabled={projects.length < 20} onClick={() => setOffset(n => n + 20)}>Next</button></div></>}
 </main>;
}
