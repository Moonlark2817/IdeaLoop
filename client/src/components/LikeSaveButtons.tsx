import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { request } from "../api";
import { useAuth } from "../auth";

interface Engagement {
  likes: number;
  saves: number;
  liked: boolean;
  saved: boolean;
}

export default function LikeSaveButtons({ projectId }: { projectId: string }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    setError("");
    request<{ engagement: Engagement }>(`/projects/${projectId}/engagement`, { signal: controller.signal })
      .then((data) => setEngagement(data.engagement))
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err instanceof Error ? err.message : "Unable to load likes.");
      });
    return () => controller.abort();
  }, [projectId, user?.id, authLoading]);

  async function toggle(action: "like" | "save") {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (!engagement || busy) return;

    const active = action === "like" ? engagement.liked : engagement.saved;
    setBusy(true);
    setError("");
    try {
      const data = await request<{ engagement: Engagement }>(`/projects/${projectId}/engagement/${action}`, {
        method: active ? "DELETE" : "PUT"
      });
      setEngagement(data.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!engagement) return error ? <p role="alert">{error}</p> : null;

  return (
    <div className="engagement-actions">
      <button type="button" aria-pressed={engagement.liked} onClick={() => toggle("like")} disabled={busy}>
        {engagement.liked ? "Liked" : "Like"} ({engagement.likes})
      </button>{" "}
      <button type="button" aria-pressed={engagement.saved} onClick={() => toggle("save")} disabled={busy}>
        {engagement.saved ? "Saved" : "Save"} ({engagement.saves})
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
