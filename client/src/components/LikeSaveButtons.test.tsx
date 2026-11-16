import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { tokenKey } from '../api';
import LikeSaveButtons from './LikeSaveButtons';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
afterEach(() => vi.restoreAllMocks());

function renderButtons() {
  render(<MemoryRouter initialEntries={['/projects/7']}><AuthProvider><Routes>
    <Route path="/projects/:id" element={<LikeSaveButtons projectId="7" />} />
    <Route path="/login" element={<p>Login page</p>} />
  </Routes></AuthProvider></MemoryRouter>);
}

test('guests see counts and are sent to login when they try to like', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({engagement: {likes: 3, saves: 1, liked: false, saved: false}}));
  renderButtons();
  expect(await screen.findByRole('button', {name: 'Like (3)'})).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', {name: 'Save (1)'})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', {name: 'Like (3)'}));
  expect(await screen.findByText('Login page')).toBeInTheDocument();
});

test('signed-in users can like and unsave, and errors are shown', async () => {
  sessionStorage.setItem(tokenKey, 'token');
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input); const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url.endsWith('/users/me')) return json({user: {id: 1, username: 'Alice'}});
    if (method === 'PUT' && url.endsWith('/like')) return json({engagement: {likes: 1, saves: 1, liked: true, saved: true}});
    if (method === 'DELETE' && url.endsWith('/save')) return json({error: {message: 'Try again later'}}, 429);
    return json({engagement: {likes: 0, saves: 1, liked: false, saved: true}});
  });
  renderButtons();

  await userEvent.click(await screen.findByRole('button', {name: 'Like (0)'}));
  expect(await screen.findByRole('button', {name: 'Liked (1)'})).toHaveAttribute('aria-pressed', 'true');
  expect(calls).toContain('PUT /api/projects/7/engagement/like');

  await userEvent.click(screen.getByRole('button', {name: 'Saved (1)'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again later');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Saved (1)'})).toBeEnabled());
});
