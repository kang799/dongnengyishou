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

/**
 * 清除当前 supabase 在 localStorage 中的会话缓存（sb-* 键），
 * 但保留我们自己的游客缓存键，使游客可以稍后通过 refresh_token 恢复。
 */
export function clearSupabaseLocalAuth() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === KEY) continue;
      if (k.startsWith("sb-") && k.includes("-auth-token")) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

const ONBOARDED_KEY = "yishou.onboarded";

export function markOnboardedLocal() {
  try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch {}
}

export function hasOnboardedLocal(): boolean {
  try { return localStorage.getItem(ONBOARDED_KEY) === "1"; } catch { return false; }
}

export function clearOnboardedLocal() {
  try { localStorage.removeItem(ONBOARDED_KEY); } catch {}
}