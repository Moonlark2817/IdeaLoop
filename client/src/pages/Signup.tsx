import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { request } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";
import { safeRedirect } from "./Login";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,50}$/;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const BIO_MAX = 2000;

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    bio: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function validate(): string {
    if (!USERNAME_PATTERN.test(form.username)) {
      return "Username must be 3-50 letters, numbers, or underscores.";
    }
    if (form.password.length < PASSWORD_MIN || form.password.length > PASSWORD_MAX) {
      return `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`;
    }
    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
    }
    if (form.bio.length > BIO_MAX) {
      return `Bio must be ${BIO_MAX} characters or fewer.`;
    }
    return "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const result = await request<{ user: User; token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: form.username,
          email: form.email.trim(),
          password: form.password,
          ...(form.bio.trim() ? { bio: form.bio.trim() } : {})
        })
      });
      auth.accept(result.user, result.token);
      navigate(safeRedirect(location.state?.from), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign up.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Sign up</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="username">Username</label>
          <br />
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={handleChange}
            required
          />
          <br />
          <small>3-50 letters, numbers, or underscores.</small>
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={handleChange}
            required
          />
          <br />
          <small>At least {PASSWORD_MIN} characters.</small>
        </div>

        <div>
          <label htmlFor="confirmPassword">Confirm password</label>
          <br />
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="bio">Bio (optional)</label>
          <br />
          <textarea
            id="bio"
            name="bio"
            rows={4}
            value={form.bio}
            onChange={handleChange}
          />
        </div>

        {error && <p role="alert">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login" state={location.state}>Log in</Link>
      </p>
    </main>
  );
}
