import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
export default function Navbar() {
 const auth = useAuth();
 return <><a className="skip-link" href="#content">Skip to content</a><nav className="navbar" aria-label="Main navigation"><Link className="logo" to="/projects">IdeaLoop</Link><div className="nav-links"><Link to="/projects">Projects</Link><Link to="/projects/new">Create project</Link>{auth.user ? <><span>{auth.user.username}</span><button className="secondary-button" onClick={auth.logout}>Sign out</button></> : <Link to="/login">Sign in</Link>}</div></nav>{auth.message && <div role="status" className="page-container">{auth.message} <button onClick={auth.retry}>Retry session</button></div>}</>;
}
