import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import ProjectFeed from './ProjectFeed';
afterEach(() => vi.restoreAllMocks());
test('submits title and description search explicitly and returns to the first page', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({projects: Array.from({length:20},(_,i) => ({id:i+1,title:'A project',description:'Details',is_seeking_collaborators:false})),pagination:{limit:20,offset:0}})));
  render(<MemoryRouter><ProjectFeed /></MemoryRouter>);
  await screen.findAllByText('A project'); await userEvent.click(screen.getByText('Next'));
  await waitFor(() => expect(String(fetcher.mock.calls[fetcher.mock.calls.length - 1][0])).toContain('offset=20'));
  const calls = fetcher.mock.calls.length;
  await userEvent.type(screen.getByLabelText('Search projects'),' music & art ');
  expect(fetcher.mock.calls.length).toBe(calls);
  await userEvent.click(screen.getByRole('button',{name:'Search'}));
  await waitFor(() => expect(new URL(String(fetcher.mock.calls[fetcher.mock.calls.length - 1][0]),'http://localhost').searchParams.get('q')).toBe('music & art'));
  expect(new URL(String(fetcher.mock.calls[fetcher.mock.calls.length - 1][0]),'http://localhost').searchParams.get('offset')).toBe('0');
});
