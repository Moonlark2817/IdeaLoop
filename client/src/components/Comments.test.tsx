import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import Comments from './Comments';
import { AuthProvider } from '../auth';
import { tokenKey } from '../api';
afterEach(() => vi.restoreAllMocks());
const comment = {id:1, user_id:1, project_id:1, parent_comment_id:null, content:'Original', created_at:null, updated_at:null};
test('renders missing-parent context and guest login prompt', async () => {
 vi.spyOn(globalThis,'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/comments/99') ? {comment:{...comment, content:'Parent context'}} : {comments:[{...comment, parent_comment_id:99}]})));
 render(<MemoryRouter><AuthProvider><Comments project="1" /></AuthProvider></MemoryRouter>);
 await userEvent.click(await screen.findByText('View parent comment #99')); expect(await screen.findByText('Parent context')).toBeInTheDocument(); expect(screen.getByText('Sign in to comment')).toBeInTheDocument(); expect(screen.queryByText('Edit comment')).not.toBeInTheDocument();
});
test('preserves failed comment drafts and cancels destructive actions', async () => {
 sessionStorage.setItem(tokenKey,'token'); const confirm = vi.spyOn(window,'confirm').mockReturnValue(false);
 const fetcher = vi.spyOn(globalThis,'fetch').mockImplementation(async (input, init) => {
  if (String(input).endsWith('/users/me')) return new Response(JSON.stringify({user:{id:1,username:'Alice'}}));
  if (init?.method === 'POST') return new Response('{"error":{"message":"Slow down"}}',{status:429});
  return new Response(JSON.stringify({comments:[comment]}));
 });
 render(<MemoryRouter><AuthProvider><Comments project="1" /></AuthProvider></MemoryRouter>);
 await userEvent.click(await screen.findByText('Delete comment')); expect(confirm).toHaveBeenCalled(); expect(fetcher.mock.calls.some(([,init]) => init?.method === 'DELETE')).toBe(false);
 await userEvent.type(screen.getByLabelText('Your comment'),'Keep my draft'); await userEvent.click(screen.getByText('Save comment')); expect(await screen.findByRole('alert')).toHaveTextContent('Slow down'); expect(screen.getByLabelText('Your comment')).toHaveValue('Keep my draft');
});
test('loads later comment pages without discarding earlier comments', async () => {
 const fetcher = vi.spyOn(globalThis,'fetch').mockImplementation(async input => new Response(JSON.stringify({comments: String(input).includes('offset=20') ? [{...comment,id:21,content:'Last comment'}] : Array.from({length:20},(_,i) => ({...comment,id:i+1,content:`Comment ${i+1}`}))})));
 render(<MemoryRouter><AuthProvider><Comments project="1" /></AuthProvider></MemoryRouter>);
 await userEvent.click(await screen.findByText('Load more comments')); expect(await screen.findByText('Last comment')).toBeInTheDocument(); expect(screen.getByText('Comment 1')).toBeInTheDocument(); expect(screen.queryByText('Load more comments')).not.toBeInTheDocument(); expect(fetcher.mock.calls.some(([url]) => String(url).includes('offset=20'))).toBe(true);
});
