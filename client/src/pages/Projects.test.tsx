import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../auth';
import ProjectFeed from './ProjectFeed';
import ProjectDetails from './ProjectDetails';
import ProjectForm from './ProjectForm';
import { Routes, Route } from 'react-router-dom';
import { tokenKey } from '../api';
const project = {id: 1, user_id: 1, title: 'Test work', description: 'Description', project_url: 'javascript:alert(1)', is_seeking_collaborators: false, created_at: '2026-01-01'};
afterEach(() => vi.restoreAllMocks());
test('feed handles pagination and failed requests', async () => {
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({projects: Array.from({length:20}, (_, i) => ({...project, id:i+1})), pagination:{limit:20,offset:0}})));
 render(<MemoryRouter><ProjectFeed /></MemoryRouter>); await screen.findAllByText('Test work');
 fetcher.mockResolvedValue(new Response('{"error":{"message":"Unavailable"}}', {status:503})); await userEvent.click(screen.getByRole('button', {name:'Next'})); expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
});
test('guests cannot see ownership controls or unsafe links', async () => {
 vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/comments?limit=20&offset=0') ? {comments:[]} : {project})));
 render(<MemoryRouter initialEntries={['/projects/1']}><AuthProvider><Routes><Route path="/projects/:id" element={<ProjectDetails />} /></Routes></AuthProvider></MemoryRouter>);
 await screen.findByText('Test work'); expect(screen.queryByText('Edit Project')).not.toBeInTheDocument(); expect(screen.queryByText('Visit Project →')).not.toBeInTheDocument();
});
test('project form validates whitespace and preserves data after a failed save', async () => {
 sessionStorage.setItem(tokenKey,'token'); vi.spyOn(globalThis,'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/users/me') ? {user:{id:1,username:'Alice'}} : {error:{message:'Try later'}}), {status:String(input).endsWith('/users/me')?200:429}));
 render(<MemoryRouter><AuthProvider><ProjectForm /></AuthProvider></MemoryRouter>);
 await waitFor(() => expect(screen.getByLabelText('Project Title *')).toBeInTheDocument());
 await userEvent.type(screen.getByLabelText('Project Title *'),'   '); await userEvent.type(screen.getByLabelText('Description *'),'Details'); await userEvent.click(screen.getByRole('button',{name:'Create Project'})); expect(await screen.findByRole('alert')).toHaveTextContent('title and description');
 await userEvent.clear(screen.getByLabelText('Project Title *')); await userEvent.type(screen.getByLabelText('Project Title *'),'My work'); await userEvent.click(screen.getByRole('button',{name:'Create Project'})); expect(await screen.findByRole('alert')).toHaveTextContent('Try later'); expect(screen.getByLabelText('Project Title *')).toHaveValue('My work');
});
