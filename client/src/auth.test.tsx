import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthProvider, Protected, useAuth } from './auth';
import { tokenKey } from './api';
afterEach(() => vi.restoreAllMocks());
function Identity() {const {user, loading} = useAuth(); return <p>{loading ? 'Loading' : user?.username || 'Guest'}</p>;}
test('restores session from the server', async () => {
 sessionStorage.setItem(tokenKey, 'token'); vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({user: {id: 1, username: 'Alice'}})));
 render(<AuthProvider><Identity /></AuthProvider>); expect(await screen.findByText('Alice')).toBeInTheDocument();
});
test('rejects an expired session', async () => {
 sessionStorage.setItem(tokenKey, 'old'); vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', {status: 401}));
 render(<AuthProvider><Identity /></AuthProvider>); await waitFor(() => expect(screen.getByText('Guest')).toBeInTheDocument()); expect(sessionStorage.getItem(tokenKey)).toBeNull();
});
test('protected content is unavailable to guests', () => {
 render(<MemoryRouter initialEntries={["/private"]}><AuthProvider><Routes><Route path="/private" element={<Protected><p>Private form</p></Protected>} /><Route path="/login" element={<p>Login page</p>} /></Routes></AuthProvider></MemoryRouter>); expect(screen.queryByText('Private form')).not.toBeInTheDocument();
});
