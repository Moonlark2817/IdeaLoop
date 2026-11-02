const API_URL = import.meta.env.VITE_API_URL || "/api";

const TOKEN_KEY = "idealoop_token";
const USER_KEY = "idealoop_user";

export interface User {
  id: number;
  username: string;
  email?: string;
  bio: string | null;
  avatar_url: string | null;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  bio?: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

async function post(endpoint: string, body: unknown): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Request failed with status ${response.status}`
    );
  }

  return data as AuthResponse;
}

function saveSession({ user, token }: AuthResponse): User {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function login(email: string, password: string): Promise<User> {
  return saveSession(await post("/auth/login", { email, password }));
}

export async function register(input: RegisterInput): Promise<User> {
  return saveSession(await post("/auth/register", input));
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !localStorage.getItem(TOKEN_KEY)) return null;

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}
