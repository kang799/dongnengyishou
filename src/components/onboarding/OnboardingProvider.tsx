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
import { loadGuestSession, markGuestOnboarded } from "@/lib/guest-session";

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
  // 记录"已确认引导状态"的 user.id，避免旧账号的状态串到新账号
  const [confirmedUserId, setConfirmedUserId] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // 拉取 onboarded_at
  useEffect(() => {
    if (loading) return;
    // 用户切换时先重置已确认状态，避免沿用上一个账号
    setConfirmedUserId(null);
    setOnboardedAt(null);
    // 切账号时同时关闭残留的引导 UI
    setWelcomeOpen(false);
    setTourActive(false);
    setTourStep(0);
    if (!user) {
      return;
    }
    let cancelled = false;
    const currentUserId = user.id;
    void (async () => {
      // 先用游客缓存做乐观判定：若同一游客已完成，立刻视为已完成，避免闪烁
      const guestEarly = loadGuestSession();
      if (guestEarly && guestEarly.user_id === currentUserId && guestEarly.onboarded_at) {
        if (!cancelled) {
          setOnboardedAt(guestEarly.onboarded_at);
          setConfirmedUserId(currentUserId);
        }
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", currentUserId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // 读取失败时绝不弹引导：把账号视为已完成，等下次成功读取再纠正
        console.warn("load onboarded_at failed", error);
        setOnboardedAt((cur) => cur ?? new Date().toISOString());
        setConfirmedUserId(currentUserId);
        return;
      }
      let dbOnboarded: string | null = (data as any)?.onboarded_at ?? null;
      // 游客兜底：如果缓存里同一 user_id 已完成引导，则认为已完成
      if (!dbOnboarded) {
        const guest = loadGuestSession();
        if (guest && guest.user_id === currentUserId && guest.onboarded_at) {
          dbOnboarded = guest.onboarded_at;
          // 顺手补写一次数据库
          void supabase.from("profiles").update({ onboarded_at: dbOnboarded }).eq("id", currentUserId);
        }
      }
      setOnboardedAt(dbOnboarded);
      setConfirmedUserId(currentUserId);
    })();
    return () => { cancelled = true; };
  }, [user, loading]);

  // 只有"当前 user 的状态确认完毕且确为未引导"才弹开场
  useEffect(() => {
    if (!user) return;
    if (confirmedUserId !== user.id) return;
    if (onboardedAt) {
      // 已完成：彻底关闭欢迎与聚光灯，避免上一次未完成的状态残留
      setWelcomeOpen(false);
      setTourActive(false);
      setTourStep(0);
    } else {
      setWelcomeOpen(true);
    }
  }, [confirmedUserId, user, onboardedAt]);

  const markOnboarded = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setOnboardedAt(now);
    setWelcomeOpen(false);
    markGuestOnboarded(user.id);
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
    loading: loading || (!!user && confirmedUserId !== user.id),
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
  }), [loading, confirmedUserId, onboardedAt, user, welcomeOpen, markOnboarded, restart, tourActive, tourStep, startTour, nextTourStep, endTour]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used within OnboardingProvider");
  return v;
}
