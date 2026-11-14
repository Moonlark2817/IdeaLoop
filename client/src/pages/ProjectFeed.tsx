import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getProjects } from '../api';
import ProjectCard from '../components/ProjectCard';
import type { Project } from '../types';
export default function ProjectFeed() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState(''); const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    getProjects({q, offset, sort}, controller.signal).then(data => setProjects(data.projects))
      .catch(err => {if (err.name !== 'AbortError') setError(err.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [q, offset, sort, attempt]);
  function search(event: FormEvent) {event.preventDefault(); setQ(draft.trim()); setOffset(0);}
  return <main className="page-container"><header className="feed-header"><div><p className="eyebrow">CREATE · SHARE · CONNECT</p><h1>Community projects</h1><p className="subtitle">Discover what the IdeaLoop community is building.</p></div><Link className="primary-button" to="/projects/new">Create project</Link></header>
    <section className="discovery-controls" aria-label="Discover projects"><form onSubmit={search} className="discovery-search" role="search"><label htmlFor="project-search">Search projects</label><div className="search-actions"><input id="project-search" type="search" maxLength={200} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Search titles and descriptions" /><button className="primary-button">Search</button></div></form><div className="discovery-filters"><div><label htmlFor="project-sort">Sort projects</label><select id="project-sort" value={sort} onChange={e => {setSort(e.target.value as 'newest' | 'oldest'); setOffset(0);}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div></div></section>
    {loading ? <p role="status">Loading projects…</p> : error ? <div role="alert"><p className="error-message">{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></div> : <><div className="project-grid">{projects.map(project => <ProjectCard key={project.id} project={project} />)}</div>{!projects.length && <p className="empty-state">No projects on this page yet.</p>}<div className="form-actions"><button className="secondary-button" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 20))}>Previous</button><span>Page {offset / 20 + 1}</span><button className="secondary-button" disabled={projects.length < 20} onClick={() => setOffset(n => n + 20)}>Next</button></div></>}
  </main>;
}
