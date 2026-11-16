import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../api";
import { useAuth } from "../auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await login(email.trim(), password);
      auth.accept(result.user, result.token);
      navigate(safeRedirect(location.state?.from), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-container form-page">
      <section className="form-card">
      <h1>Log in</h1>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {auth.message && <p role="status">{auth.message}</p>}

      {error && <p role="alert">{error}</p>}

        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>

      <p>
        Don't have an account? <Link to="/signup" state={location.state}>Sign up</Link>
      </p>
      </section>
    </main>
  );
}

export function safeRedirect(from: unknown): string {
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//")
    ? from
    : "/projects";
}
