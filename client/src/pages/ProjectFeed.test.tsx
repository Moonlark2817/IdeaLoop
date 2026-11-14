import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import ProjectFeed from './ProjectFeed';

const project = {id: 1, user_id: 1, title: 'A project', description: 'Description', project_url: null, is_seeking_collaborators: false, created_at: '2026-01-01', updated_at: '2026-01-01'};
function response(title = 'A project', hasMore = false, count = 1) {
  return new Response(JSON.stringify({projects: Array.from({length: count}, (_, index) => ({...project, id: index + 1, title})), pagination: {limit: 20, offset: 0, has_more: hasMore}}));
}
function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><span aria-label="Current query">{location.search}</span><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}
function show(initial = '/projects') {
  return render(<MemoryRouter initialEntries={[initial]}><LocationControls /><ProjectFeed /></MemoryRouter>);
}
const currentParams = () => new URLSearchParams(screen.getByLabelText('Current query').textContent!);
const lastRequest = (fetcher: ReturnType<typeof vi.spyOn>) => new URL(String(fetcher.mock.calls[fetcher.mock.calls.length - 1][0]), 'http://localhost').searchParams;
afterEach(() => vi.restoreAllMocks());

test('submits search explicitly and resets pagination while retaining other filters', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
  show('/projects?sort=oldest&seeking_collaborators=true&offset=40');
  await screen.findByText('A project');
  const calls = fetcher.mock.calls.length;
  await userEvent.type(screen.getByLabelText('Search projects'), ' music & art ');
  expect(fetcher.mock.calls.length).toBe(calls);
  await userEvent.click(screen.getByRole('button', {name: 'Search'}));
  await waitFor(() => expect(lastRequest(fetcher).get('q')).toBe('music & art'));
  expect(lastRequest(fetcher).get('offset')).toBe('0');
  expect(lastRequest(fetcher).get('sort')).toBe('oldest');
  expect(lastRequest(fetcher).get('seeking_collaborators')).toBe('true');
  expect(currentParams().get('offset')).toBeNull();
  expect(currentParams().get('q')).toBe('music & art');
});

test('restores filters from URLs and browser history, and clear resets all applied state', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
  show('/projects?q=original&sort=oldest&seeking_collaborators=true&offset=20');
  await screen.findByText('A project');
  expect(screen.getByLabelText('Search projects')).toHaveValue('original');
  expect(screen.getByLabelText('Sort projects')).toHaveValue('oldest');
  expect(screen.getByLabelText('Seeking collaborators only')).toBeChecked();
  await userEvent.selectOptions(screen.getByLabelText('Sort projects'), 'newest');
  expect(currentParams().get('offset')).toBeNull();
  await userEvent.click(screen.getByText('History back'));
  await waitFor(() => expect(currentParams().get('offset')).toBe('20'));
  expect(screen.getByLabelText('Sort projects')).toHaveValue('oldest');
  await userEvent.click(screen.getByText('History forward'));
  await waitFor(() => expect(screen.getByLabelText('Sort projects')).toHaveValue('newest'));
  await userEvent.click(screen.getByLabelText('Seeking collaborators only'));
  expect(currentParams().get('seeking_collaborators')).toBeNull();
  await userEvent.click(screen.getByText('Clear filters'));
  await waitFor(() => expect(screen.getByLabelText('Search projects')).toHaveValue(''));
  expect(currentParams().toString()).toBe('');
  expect(screen.getByLabelText('Seeking collaborators only')).not.toBeChecked();
});

test('normalizes malformed URL parameters to safe defaults', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
  show('/projects?q=a&q=b&sort=popular&offset=999999999999&seeking_collaborators=maybe');
  await screen.findByText('A project');
  expect(currentParams().toString()).toBe('');
  expect(lastRequest(fetcher).get('sort')).toBe('newest');
  expect(lastRequest(fetcher).get('q')).toBeNull();
  expect(lastRequest(fetcher).get('offset')).toBe('0');
});

test('uses has_more instead of page length and preserves filters during pagination', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const offset = new URL(String(input), 'http://localhost').searchParams.get('offset');
    return response(offset === '0' ? 'First page' : 'Last page', offset === '0', 20);
  });
  show('/projects?q=art&sort=oldest&seeking_collaborators=true');
  await screen.findAllByText('First page');
  expect(screen.getByText('Previous')).toBeDisabled();
  await userEvent.click(screen.getByText('Next'));
  await screen.findAllByText('Last page');
  expect(screen.getByText('Next')).toBeDisabled();
  expect(lastRequest(fetcher).get('q')).toBe('art');
  expect(lastRequest(fetcher).get('offset')).toBe('20');
  expect(lastRequest(fetcher).get('seeking_collaborators')).toBe('true');
  await userEvent.click(screen.getByText('Previous'));
  await screen.findAllByText('First page');
  expect(currentParams().get('offset')).toBeNull();
});

test('distinguishes filtered empty results and retries failures without losing filters', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"error":{"message":"Unavailable"}}', {status: 503}));
  show('/projects?q=art&sort=oldest&seeking_collaborators=true&offset=20');
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  fetcher.mockImplementation(async () => response('', false, 0));
  await userEvent.click(screen.getByText('Retry'));
  expect(await screen.findByRole('status')).toHaveTextContent('No projects match your filters.');
  expect(lastRequest(fetcher).get('offset')).toBe('20');
  expect(lastRequest(fetcher).get('q')).toBe('art');
  await userEvent.click(screen.getByText('Clear filters'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No projects yet.'));
});

test('aborts obsolete requests and ignores responses that arrive out of order', async () => {
  const pending: Array<{resolve: (response: Response) => void; signal: AbortSignal}> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise(resolve => pending.push({resolve, signal: init!.signal as AbortSignal})));
  show();
  await waitFor(() => expect(pending).toHaveLength(1));
  await userEvent.selectOptions(screen.getByLabelText('Sort projects'), 'oldest');
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[0].signal.aborted).toBe(true);
  await act(async () => pending[1].resolve(response('Current results')));
  expect(await screen.findByText('Current results')).toBeInTheDocument();
  await act(async () => pending[0].resolve(response('Stale results')));
  expect(screen.queryByText('Stale results')).not.toBeInTheDocument();
  expect(screen.getByText('Current results')).toBeInTheDocument();
});
