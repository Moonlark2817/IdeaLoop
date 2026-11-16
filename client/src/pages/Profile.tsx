import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { request, tokenKey } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;

interface Skill {
  id: number;
  name: string;
  category: string | null;
  proficiency_level: string | null;
  is_open_to_teach: boolean;
}

type PublicUser = Omit<User, "email"> & { email?: string };

export function MyProfile() {
  const { user, loading } = useAuth();
  if (loading) return <main role="status">Loading...</main>;
  return user ? <Navigate to={`/users/${user.id}`} replace /> : <Navigate to="/login" state={{ from: "/profile" }} replace />;
}

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const isOwner = auth.user !== null && String(auth.user.id) === id;

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [skillDraft, setSkillDraft] = useState<Skill[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setEditing(false);

    Promise.all([
      request<{ user: PublicUser }>(`/users/${id}`),
      request<{ skills: Skill[] }>(`/users/${id}/skills`)
    ])
      .then(([userData, skillData]) => {
        if (cancelled) return;
        setProfile(userData.user);
        setSkills(skillData.skills);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  function startEditing() {
    if (!profile) return;
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setSkillDraft(skills.map((skill) => ({ ...skill })));
    setSaveError("");
    setSaved(false);
    setEditing(true);
  }

  function updateSkill(skillId: number, changes: Partial<Skill>) {
    setSkillDraft((draft) => draft.map((skill) => (skill.id === skillId ? { ...skill, ...changes } : skill)));
  }

  function removeSkill(skillId: number) {
    setSkillDraft((draft) => draft.filter((skill) => skill.id !== skillId));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaveError("");
    setSaving(true);

    try {
      // Empty fields clear the value on the backend.
      const userData = await request<{ user: User }>(`/users/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null
        })
      });

      const skillData = await request<{ skills: Skill[] }>(`/users/${profile.id}/skills`, {
        method: "PUT",
        body: JSON.stringify({
          skills: skillDraft.map((skill) => ({
            skill_id: skill.id,
            proficiency_level: skill.proficiency_level,
            is_open_to_teach: skill.is_open_to_teach
          }))
        })
      });

      setProfile(userData.user);
      setSkills(skillData.skills);

      // Keep the logged-in user (shown in the navbar) in sync.
      const token = sessionStorage.getItem(tokenKey);
      if (token) auth.accept(userData.user, token);

      setEditing(false);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main role="status">Loading profile...</main>;

  if (error || !profile) {
    return (
      <main>
        <h1>Profile not found</h1>
        <p role="alert">{error || "This user does not exist."}</p>
        <Link to="/projects">Back to projects</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>{profile.username}</h1>

      {profile.avatar_url && (
        <img src={profile.avatar_url} alt={`${profile.username}'s avatar`} width={120} height={120} />
      )}

      {saved && <p role="status">Profile saved.</p>}

      {!editing ? (
        <>
          <h2>Bio</h2>
          <p>{profile.bio || "No bio yet."}</p>

          <h2>Skills</h2>
          {skills.length === 0 ? (
            <p>No skills listed yet.</p>
          ) : (
            <ul>
              {skills.map((skill) => (
                <li key={skill.id}>
                  {skill.name}
                  {skill.category && ` (${skill.category})`}
                  {skill.proficiency_level && ` - ${skill.proficiency_level}`}
                  {skill.is_open_to_teach && " - Open to teach"}
                </li>
              ))}
            </ul>
          )}

          {isOwner && (
            <button type="button" onClick={startEditing}>
              Edit profile
            </button>
          )}
        </>
      ) : (
        <form onSubmit={handleSave}>
          <div>
            <label htmlFor="bio">Bio</label>
            <br />
            <textarea id="bio" rows={4} maxLength={2000} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>

          <div>
            <label htmlFor="avatarUrl">Avatar URL</label>
            <br />
            <input
              id="avatarUrl"
              type="url"
              maxLength={512}
              placeholder="https://..."
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </div>

          <h2>Skills</h2>
          {skillDraft.length === 0 ? (
            <p>No skills listed.</p>
          ) : (
            <ul>
              {skillDraft.map((skill) => (
                <li key={skill.id}>
                  {skill.name}{" "}
                  <label>
                    Level{" "}
                    <select
                      value={skill.proficiency_level ?? ""}
                      onChange={(e) => updateSkill(skill.id, { proficiency_level: e.target.value || null })}
                    >
                      <option value="">Not set</option>
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>{" "}
                  <label>
                    <input
                      type="checkbox"
                      checked={skill.is_open_to_teach}
                      onChange={(e) => updateSkill(skill.id, { is_open_to_teach: e.target.checked })}
                    />{" "}
                    Open to teach
                  </label>{" "}
                  <button type="button" onClick={() => removeSkill(skill.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {saveError && <p role="alert">{saveError}</p>}

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>{" "}
          <button type="button" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </main>
  );
}
