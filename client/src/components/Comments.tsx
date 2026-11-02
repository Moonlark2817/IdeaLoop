import { useCallback, useEffect, useState, useId, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { deleteComment, getComment, getComments, saveComment } from '../api';
import { useAuth } from '../auth';
import type { Comment } from '../types';
function Editor({label, initial = '', onSave, onCancel}: {label: string; initial?: string; onSave: (content: string) => Promise<void>; onCancel?: () => void}) {
 const inputId = useId();
 const [text, setText] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 async function submit(e: FormEvent) {e.preventDefault(); if (busy) return; if (!text.trim()) {setError('Enter a comment.'); return;} setBusy(true); setError(''); try {await onSave(text.trim()); setText('');} catch(err) {setError((err as Error).message);} finally {setBusy(false);}}
 return <form onSubmit={submit} className="comment-editor"><label htmlFor={inputId}>{label}</label><textarea id={inputId} required value={text} onChange={e => setText(e.target.value)} />{error && <p role="alert" className="error-message">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save comment'}</button>{onCancel && <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>}</form>;
}
function CommentItem({comment, project, children, missingParent, refresh}: {comment: Comment; project: string; children?: React.ReactNode; missingParent: boolean; refresh: () => Promise<void>}) {
 const {user} = useAuth(); const [mode, setMode] = useState<'view'|'edit'|'reply'>('view'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [context, setContext] = useState<Comment | null>(null);
 async function remove() {if (busy || !window.confirm('Delete this comment and all descendant replies, including replies by other users? This cannot be undone.')) return; setBusy(true); setError(''); try {await deleteComment(project, comment.id); await refresh();} catch(err) {setError((err as Error).message);} finally {setBusy(false);}}
 async function showParent() {setError(''); try {setContext((await getComment(project, comment.parent_comment_id!)).comment);} catch(err) {setError((err as Error).message);}}
 return <li className="comment" id={`comment-${comment.id}`}><article><p className="project-meta">User #{comment.user_id}{comment.created_at ? ` · ${new Date(comment.created_at).toLocaleDateString()}` : ''}</p>
 {missingParent && <><button className="text-link" onClick={showParent}>View parent comment #{comment.parent_comment_id}</button>{context && <blockquote>{context.content}</blockquote>}</>}
 <p className="comment-content">{comment.content}</p>{error && <p role="alert">{error}</p>}
 <div className="comment-actions">{user && <button onClick={() => setMode('reply')}>Reply</button>}{user?.id === comment.user_id && <><button onClick={() => setMode('edit')}>Edit comment</button><button disabled={busy} onClick={remove}>Delete comment</button></>}</div>
 {mode !== 'view' && user && <Editor key={mode} label={mode === 'edit' ? 'Edit comment' : 'Your reply'} initial={mode === 'edit' ? comment.content : ''} onCancel={() => setMode('view')} onSave={async content => {await saveComment(project, content, mode === 'edit' ? comment.id : undefined, mode === 'reply' ? comment.id : undefined); setMode('view'); await refresh();}} />}
 </article>{children}</li>;
}
export default function Comments({project}: {project: string}) {
 const {user} = useAuth(); const location = useLocation(); const [comments, setComments] = useState<Comment[]>([]); const [pages, setPages] = useState(1); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0); const [notice, setNotice] = useState('');
 const reload = useCallback(async (signal?: AbortSignal) => {
   setLoading(true); setError(''); try {const loaded: Comment[] = []; let more = false; for (let page = 0; page < pages; page++) {const data = await getComments(project, page * 20, signal); loaded.push(...data.comments); more = data.comments.length === 20; if (!more) break;} if (!signal?.aborted) {setComments(loaded); setHasMore(more);}}
   catch(err) {if ((err as Error).name !== 'AbortError') {setError((err as Error).message); throw err;}} finally {if (!signal?.aborted) setLoading(false);}
 }, [project, pages]);
 useEffect(() => {const controller = new AbortController(); void reload(controller.signal).catch(() => {}); return () => controller.abort();}, [reload, attempt]);
 const ids = new Set(comments.map(c => c.id));
 function thread(parent: number | null, depth = 0): React.ReactNode {
   const items = comments.filter(c => parent === null ? c.parent_comment_id === null || !ids.has(c.parent_comment_id) : c.parent_comment_id === parent);
   if (!items.length) return null;
   return <ul className={depth > 3 ? 'comment-list deep-replies' : 'comment-list'}>{items.map(comment => <CommentItem key={comment.id} comment={comment} project={project} refresh={() => reload()} missingParent={comment.parent_comment_id !== null && !ids.has(comment.parent_comment_id)}>{thread(comment.id, depth + 1)}</CommentItem>)}</ul>;
 }
 return <section className="details-section" aria-label="Comments"><h2>Comments</h2>{notice && <p role="status">{notice}</p>}{error && <div role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry comments</button></div>}{loading && <p role="status">Loading comments…</p>}{!loading && !error && !comments.length && <p>No comments yet. Start the conversation.</p>}{thread(null)}{hasMore && <button disabled={loading} onClick={() => setPages(n => n + 1)}>Load more comments</button>}
 {user ? <Editor label="Your comment" onSave={async content => {await saveComment(project, content); setNotice('Comment posted. Use Load more comments if it is beyond the loaded range.'); await reload().catch(() => {});}} /> : <p><Link to="/login" state={{from: location.pathname}}>Sign in to comment</Link></p>}</section>;
}
