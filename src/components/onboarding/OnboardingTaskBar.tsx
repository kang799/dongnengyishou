import { Link } from "@tanstack/react-router";
import { useOnboarding } from "./OnboardingProvider";

/**
 * 顶部新手任务条：未完成首训前固定显示，提示「完成 1 次深蹲」
 */
export function OnboardingTaskBar() {
  const { hasUser, onboarded, loading, openWelcome } = useOnboarding();
  if (loading || !hasUser || onboarded) return null;

  return (
    <div className="sticky top-16 z-20 border-b border-primary/30 bg-primary/10 backdrop-blur">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="seal text-[11px] shrink-0">新 手</span>
          <span className="text-sm font-display tracking-widest text-foreground/90 truncate">
            完成 1 次深蹲，解锁全部殿堂
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={openWelcome}
            className="text-[11px] tracking-widest text-foreground/60 hover:text-foreground"
          >
            重看开场
          </button>
          <Link
            to="/train"
            className="text-xs font-display tracking-widest px-3 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            前往修行 ›
          </Link>
        </div>
      </div>
    </div>
  );
}
