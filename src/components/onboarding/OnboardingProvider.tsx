import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type OnboardingCtx = {
  loading: boolean;
  onboarded: boolean;
  hasUser: boolean;
  welcomeOpen: boolean;
  closeWelcome: () => void;
  openWelcome: () => void;
  markOnboarded: () => Promise<void>;
  restart: () => Promise<void>;
};

const Ctx = createContext<OnboardingCtx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [onboardedAt, setOnboardedAt] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // 拉取 onboarded_at
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setOnboardedAt(null);
      setFetched(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setOnboardedAt((data as any)?.onboarded_at ?? null);
      setFetched(true);
    })();
    return () => { cancelled = true; };
  }, [user, loading]);

  // 首次确认未完成 → 自动弹开场
  useEffect(() => {
    if (!fetched || !user) return;
    if (!onboardedAt) setWelcomeOpen(true);
  }, [fetched, user, onboardedAt]);

  const markOnboarded = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setOnboardedAt(now);
    setWelcomeOpen(false);
    const { error } = await supabase.from("profiles").update({ onboarded_at: now }).eq("id", user.id);
    if (error) console.warn("markOnboarded failed", error);
  }, [user]);

  const restart = useCallback(async () => {
    if (!user) return;
    setOnboardedAt(null);
    setWelcomeOpen(true);
    await supabase.from("profiles").update({ onboarded_at: null }).eq("id", user.id);
  }, [user]);

  const value = useMemo<OnboardingCtx>(() => ({
    loading: loading || !fetched,
    onboarded: !!onboardedAt,
    hasUser: !!user,
    welcomeOpen,
    closeWelcome: () => { setWelcomeOpen(false); void markOnboarded(); },
    openWelcome: () => setWelcomeOpen(true),
    markOnboarded,
    restart,
  }), [loading, fetched, onboardedAt, user, welcomeOpen, markOnboarded, restart]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used within OnboardingProvider");
  return v;
}
