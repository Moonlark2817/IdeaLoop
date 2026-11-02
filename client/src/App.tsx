import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProjectFeed from './pages/ProjectFeed';
import ProjectDetails from './pages/ProjectDetails';
import ProjectForm from './pages/ProjectForm';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile, { MyProfile } from './pages/Profile';
import { AuthProvider, Protected } from './auth';
export function AppRoutes() {
 return <AuthProvider><Navbar /><div id="content" tabIndex={-1}><Routes>
 <Route path="/" element={<Navigate to="/projects" replace />} />
 <Route path="/login" element={<Login />} /><Route path="/signup" element={<Signup />} />
 <Route path="/register" element={<Navigate to="/signup" replace />} />
 <Route path="/profile" element={<MyProfile />} /><Route path="/users/:id" element={<Profile />} />
 <Route path="/projects" element={<ProjectFeed />} /><Route path="/projects/new" element={<Protected><ProjectForm key="new" /></Protected>} />
 <Route path="/projects/:id" element={<ProjectDetails />} /><Route path="/projects/:id/edit" element={<Protected><ProjectForm key="edit" /></Protected>} />
 <Route path="*" element={<main className="page-container"><h1>Page not found</h1><Link to="/projects">Back to projects</Link></main>} />
 </Routes></div></AuthProvider>;
}
export default function App() {return <BrowserRouter><AppRoutes /></BrowserRouter>;}
