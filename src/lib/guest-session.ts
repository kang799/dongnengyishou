const KEY = "yishou.guestSession";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type GuestSessionCache = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  created_at: number;
};

export function saveGuestSession(s: Omit<GuestSessionCache, "created_at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, created_at: Date.now() }));
  } catch {}
}

export function loadGuestSession(): GuestSessionCache | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as GuestSessionCache;
    if (!v?.refresh_token || !v?.access_token) return null;
    if (Date.now() - (v.created_at ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function clearGuestSession() {
  try { localStorage.removeItem(KEY); } catch {}
}