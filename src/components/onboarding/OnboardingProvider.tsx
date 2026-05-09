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
  tourStep: number; // -1 表示未启动
  startTour: () => void;
  setTourStep: (n: number) => void;
  nextStep: () => void;
  closeWelcome: () => void;
  openWelcome: () => void;
  skipAll: () => void;
  markOnboarded: () => Promise<void>;
  restart: () => Promise<void>;
};

const Ctx = createContext<OnboardingCtx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [onboardedAt, setOnboardedAt] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourStep, setTourStep] = useState(-1);

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
    setTourStep(-1);
    setWelcomeOpen(false);
    await supabase.from("profiles").update({ onboarded_at: now }).eq("id", user.id);
  }, [user]);

  const restart = useCallback(async () => {
    if (!user) return;
    setOnboardedAt(null);
    setWelcomeOpen(true);
    setTourStep(-1);
    await supabase.from("profiles").update({ onboarded_at: null }).eq("id", user.id);
  }, [user]);

  const value = useMemo<OnboardingCtx>(() => ({
    loading: loading || !fetched,
    onboarded: !!onboardedAt,
    hasUser: !!user,
    welcomeOpen,
    tourStep,
    startTour: () => { setWelcomeOpen(false); setTourStep(0); },
    setTourStep,
    nextStep: () => setTourStep((s) => s + 1),
    closeWelcome: () => setWelcomeOpen(false),
    openWelcome: () => setWelcomeOpen(true),
    skipAll: () => { void markOnboarded(); },
    markOnboarded,
    restart,
  }), [loading, fetched, onboardedAt, user, welcomeOpen, tourStep, markOnboarded, restart]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used within OnboardingProvider");
  return v;
}
