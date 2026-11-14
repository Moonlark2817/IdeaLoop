import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProjects } from '../api';
import { feedSearchParams, readFeedFilters, type FeedFilters } from '../projectDiscovery';
import ProjectCard from '../components/ProjectCard';
import type { Project } from '../types';

interface FeedResult {
  key: string;
  status: 'loading' | 'ready' | 'error';
  projects: Project[];
  hasMore: boolean;
  error: string;
}

export default function ProjectFeed() {
  const [params, setParams] = useSearchParams();
  const filters = readFeedFilters(params);
  const {q, sort, seekingCollaborators, offset} = filters;
  const canonical = feedSearchParams(filters).toString();
  const [draft, setDraft] = useState(q);
  const [seekingChecked, setSeekingChecked] = useState(seekingCollaborators);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<FeedResult>({key: canonical, status: 'loading', projects: [], hasMore: false, error: ''});

  useEffect(() => {setDraft(q);}, [q]);
  useEffect(() => {setSeekingChecked(seekingCollaborators);}, [seekingCollaborators]);
  useEffect(() => {
    if (params.toString() !== canonical) setParams(canonical, {replace: true});
  }, [params, canonical, setParams]);

  useEffect(() => {
    const controller = new AbortController();
    setResult({key: canonical, status: 'loading', projects: [], hasMore: false, error: ''});
    getProjects({q, sort, seekingCollaborators: seekingCollaborators ? true : undefined, offset}, controller.signal)
      .then(data => {
        setResult({key: canonical, status: 'ready', projects: data.projects, hasMore: data.projects.length === 20, error: ''});
      })
      .catch(error => {
        if (error.name !== 'AbortError') setResult({key: canonical, status: 'error', projects: [], hasMore: false, error: error.message});
      });
    return () => controller.abort();
  }, [canonical, q, sort, seekingCollaborators, offset, attempt]);

  function apply(changes: Partial<FeedFilters>) {
    setParams(feedSearchParams({...filters, ...changes, offset: 0}));
  }
  function search(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length <= 200 && !value.includes('\0')) apply({q: value});
  }
  function clear() {
    setDraft('');
    setSeekingChecked(false);
    setParams({});
  }
  const loading = result.key !== canonical || result.status === 'loading';

  return <main className="page-container">
    <header className="feed-header">
      <div><p className="eyebrow">CREATE · SHARE · CONNECT</p><h1>Community projects</h1><p className="subtitle">Discover what the IdeaLoop community is building.</p></div>
      <Link className="primary-button" to="/projects/new">Create project</Link>
    </header>
    <section className="discovery-controls" aria-label="Discover projects">
      <form onSubmit={search} className="discovery-search" role="search">
        <label htmlFor="project-search">Search projects</label>
        <div className="search-actions"><input id="project-search" type="search" maxLength={200} placeholder="Search titles and descriptions" value={draft} onChange={event => setDraft(event.target.value)} /><button className="primary-button" type="submit">Search</button></div>
      </form>
      <div className="discovery-filters">
        <div><label htmlFor="project-sort">Sort projects</label><select id="project-sort" value={sort} onChange={event => apply({sort: event.target.value as FeedFilters['sort']})}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
        <label className="checkbox-group"><input type="checkbox" checked={seekingChecked} onChange={event => {
          // Update the native control immediately while URL navigation is scheduled.
          const checked = event.target.checked;
          setSeekingChecked(checked);
          apply({seekingCollaborators: checked});
        }} />Seeking collaborators only</label>
        <button type="button" className="secondary-button" onClick={clear}>Clear filters</button>
      </div>
    </section>
    {loading ? <p role="status">Loading projects…</p> : result.status === 'error' ? <div role="alert"><p className="error-message">{result.error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></div> : <>
      <p role="status">{result.projects.length ? `Showing ${result.projects.length} projects · Page ${Math.floor(offset / 20) + 1}` : 'No projects on this page yet.'}</p>
      <div className="project-grid">{result.projects.map(project => <ProjectCard key={project.id} project={project} />)}</div>
      <div className="form-actions" aria-label="Project pagination">
        <button className="secondary-button" disabled={!offset} onClick={() => setParams(feedSearchParams({...filters, offset: Math.max(0, offset - 20)}))}>Previous</button>
        <span>Page {Math.floor(offset / 20) + 1}</span>
        <button className="secondary-button" disabled={!result.hasMore || offset > 2147483647 - 20} onClick={() => setParams(feedSearchParams({...filters, offset: offset + 20}))}>Next</button>
      </div>
    </>}
  </main>;
}
