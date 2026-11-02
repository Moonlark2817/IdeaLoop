import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../auth';
import AuthForm from './AuthForm';
import { tokenKey } from '../api';
afterEach(() => vi.restoreAllMocks());
test('invalid credentials preserve login input and successful login returns to intended page', async () => {
 const fetcher = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{"error":{"message":"Invalid email or password"}}',{status:401}));
 render(<MemoryRouter initialEntries={[{pathname:'/login',state:{from:'/projects/new'}}]}><AuthProvider><Routes><Route path="/login" element={<AuthForm />} /><Route path="/projects/new" element={<h1>New project form</h1>} /></Routes></AuthProvider></MemoryRouter>);
 await userEvent.type(screen.getByLabelText('Email'),'alice@example.com'); await userEvent.type(screen.getByLabelText('Password'),'correct-password'); await userEvent.click(screen.getByRole('button',{name:'Sign in'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password'); expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com'); expect(sessionStorage.getItem(tokenKey)).toBeNull();
 fetcher.mockResolvedValue(new Response(JSON.stringify({user:{id:1,username:'Alice'},token:'new-token'}))); await userEvent.click(screen.getByRole('button',{name:'Sign in'})); expect(await screen.findByText('New project form')).toBeInTheDocument(); expect(sessionStorage.getItem(tokenKey)).toBe('new-token');
});
