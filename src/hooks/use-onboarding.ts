import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * 全局新手引导状态：
 *  - onboarded: 是否已完成首训
 *  - tourActive: 分步遮罩是否在跑
 *  - welcomeOpen: 全屏开场轮播是否打开
 * 写入由 /train 在首次成功 rep 后触发。
 */
export function useOnboarding() {
  const { user, loading } = useAuth();
  const [onboardedAt, setOnboardedAt] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setOnboardedAt(null);
      setFetched(true);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();
    setOnboardedAt((data as any)?.onboarded_at ?? null);
    setFetched(true);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    void refresh();
  }, [loading, refresh]);

  // 初次加载完毕，未完成就自动弹开场
  useEffect(() => {
    if (!fetched || !user) return;
    if (!onboardedAt) {
      setWelcomeOpen(true);
    }
  }, [fetched, user, onboardedAt]);

  const markOnboarded = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setOnboardedAt(now);
    setTourActive(false);
    await supabase.from("profiles").update({ onboarded_at: now }).eq("id", user.id);
  }, [user]);

  const restart = useCallback(async () => {
    if (!user) return;
    setOnboardedAt(null);
    await supabase.from("profiles").update({ onboarded_at: null }).eq("id", user.id);
    setWelcomeOpen(true);
  }, [user]);

  const startTour = useCallback(() => {
    setWelcomeOpen(false);
    setTourActive(true);
  }, []);

  const skipAll = useCallback(() => {
    setWelcomeOpen(false);
    setTourActive(false);
    void markOnboarded();
  }, [markOnboarded]);

  return {
    user,
    loading: loading || !fetched,
    onboarded: !!onboardedAt,
    welcomeOpen,
    tourActive,
    setWelcomeOpen,
    setTourActive,
    startTour,
    skipAll,
    markOnboarded,
    restart,
    refresh,
  };
}
