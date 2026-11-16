import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import Comments from './Comments';
import { AuthProvider } from '../auth';
import { tokenKey } from '../api';

afterEach(() => vi.restoreAllMocks());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
const base = {project_id: 1, parent_comment_id: null, created_at: '2026-11-01T15:00:00Z', updated_at: '2026-11-01T15:00:00Z'};

test('shows author usernames linked to profiles and marks edited comments', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/users/41')) return json({user: {id: 41, username: 'maya_creates'}});
    if (url.endsWith('/users/42')) return json({error: {message: 'User not found'}}, 404);
    return json({comments: [
      {...base, id: 1, user_id: 41, content: 'First'},
      {...base, id: 2, user_id: 41, content: 'Second', updated_at: '2026-11-02T09:00:00Z'},
      {...base, id: 3, user_id: 42, content: 'Third'},
    ]});
  });
  render(<MemoryRouter><AuthProvider><Comments project="1" /></AuthProvider></MemoryRouter>);

  const links = await screen.findAllByRole('link', {name: 'maya_creates'});
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute('href', '/users/41');
  // An author that can't be loaded falls back to their ID.
  expect(screen.getByRole('link', {name: 'User #42'})).toHaveAttribute('href', '/users/42');
  expect(screen.getAllByText(/\(edited\)/)).toHaveLength(1);
  // Each author is fetched once, even with several comments.
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/users/41'))).toHaveLength(1);
});

test('the reply box names the person being replied to', async () => {
  sessionStorage.setItem(tokenKey, 'token');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/users/me')) return json({user: {id: 7, username: 'raki'}});
    if (url.endsWith('/users/51')) return json({user: {id: 51, username: 'charlie_builds'}});
    return json({comments: [{...base, id: 9, user_id: 51, content: 'Nice work'}]});
  });
  render(<MemoryRouter><AuthProvider><Comments project="1" /></AuthProvider></MemoryRouter>);

  await screen.findByRole('link', {name: 'charlie_builds'});
  await userEvent.click(screen.getByRole('button', {name: 'Reply'}));
  expect(screen.getByLabelText('Your reply')).toBeInTheDocument();
  expect(screen.getByText('Replying to charlie_builds')).toBeInTheDocument();
});
