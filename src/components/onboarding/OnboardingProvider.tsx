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
  tourActive: boolean;
  tourStep: number;
  startTour: () => void;
  nextTourStep: () => void;
  endTour: () => void;
};

const Ctx = createContext<OnboardingCtx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [onboardedAt, setOnboardedAt] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // 拉取 onboarded_at
  useEffect(() => {
    if (loading) return;
    // 用户切换时先重置，避免沿用上一个账号的状态把旧账号误判成新账号
    setFetched(false);
    setOnboardedAt(null);
    if (!user) {
      setFetched(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // 读取失败时不要把账号当成"未引导"导致误弹引导
        console.warn("load onboarded_at failed", error);
        setOnboardedAt(new Date().toISOString());
        setFetched(true);
        return;
      }
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
    setTourActive(false);
    setTourStep(0);
    await supabase.from("profiles").update({ onboarded_at: null }).eq("id", user.id);
  }, [user]);

  const startTour = useCallback(() => {
    setTourStep(0);
    setTourActive(true);
  }, []);
  const nextTourStep = useCallback(() => {
    setTourStep((i) => {
      const next = i + 1;
      // 上层组件保证最后一步用 endTour；这里做兜底
      return next;
    });
  }, []);
  const endTour = useCallback(() => {
    setTourActive(false);
    setTourStep(0);
  }, []);

  const value = useMemo<OnboardingCtx>(() => ({
    loading: loading || !fetched,
    onboarded: !!onboardedAt,
    hasUser: !!user,
    welcomeOpen,
    closeWelcome: () => {
      setWelcomeOpen(false);
      void markOnboarded();
      // 关闭欢迎卷轴 → 启动聚光灯引导
      setTourStep(0);
      setTourActive(true);
    },
    openWelcome: () => setWelcomeOpen(true),
    markOnboarded,
    restart,
    tourActive,
    tourStep,
    startTour,
    nextTourStep,
    endTour,
  }), [loading, fetched, onboardedAt, user, welcomeOpen, markOnboarded, restart, tourActive, tourStep, startTour, nextTourStep, endTour]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used within OnboardingProvider");
  return v;
}
