import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useOnboarding } from "./OnboardingProvider";

type Step = {
  /** 期望停留的路由 */
  route: string;
  /** 目标 data-tour 标记 */
  target: string;
  title: string;
  body: string;
  /** 高亮区域是否可点击（true 表示穿透遮罩） */
  clickThrough?: boolean;
  /** 提示用户应该执行的动作 */
  hint?: string;
};

export const TOUR_STEPS: Step[] = [
  {
    route: "/pet",
    target: "pet-portrait",
    title: "这是你的异兽",
    body: "三脉真气满盈，它便能破壳进化，登顶封神榜。",
  },
  {
    route: "/pet",
    target: "pet-stats",
    title: "三脉真气",
    body: "力 · 速 · 体 三条进度，每完成一次动作 +1。",
  },
  {
    route: "/pet",
    target: "pet-go-train",
    title: "前往修行",
    body: "点此进入修行殿，开启第一次喂养。",
    clickThrough: true,
    hint: "👆 请点击高亮按钮",
  },
  {
    route: "/train",
    target: "train-squat-card",
    title: "先选「深蹲」",
    body: "炼速度，AI 自动识别。",
    clickThrough: true,
    hint: "👆 请点击「深蹲」",
  },
  {
    route: "/train",
    target: "train-start-btn",
    title: "启动摄像头",
    body: "做 1 个深蹲即解锁全部殿堂。完成后会自动结束引导。",
    clickThrough: true,
    hint: "👆 点击「启动修行」",
  },
];

export function SpotlightTour() {
  const { tourStep, setTourStep, skipAll, hasUser, onboarded } = useOnboarding();
  const loc = useLocation();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const active = hasUser && !onboarded && tourStep >= 0 && tourStep < TOUR_STEPS.length;
  const step = active ? TOUR_STEPS[tourStep] : null;
  const onRightRoute = step ? loc.pathname === step.route : false;

  // 监测目标元素位置
  useEffect(() => {
    if (!step || !onRightRoute) {
      setRect(null);
      return;
    }
    let raf = 0;
    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [step, onRightRoute, loc.pathname]);

  // 点击穿透步骤：监听目标点击 → 自动 next
  useEffect(() => {
    if (!step || !step.clickThrough || !onRightRoute) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) return;
    const onClick = () => setTourStep(tourStep + 1);
    el.addEventListener("click", onClick, { once: true });
    return () => el.removeEventListener("click", onClick);
  }, [step, onRightRoute, tourStep, setTourStep, rect]);

  if (!active) return null;

  // 走错路由：显示一条全屏提示卡
  if (!onRightRoute) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center pointer-events-auto">
        <div className="ink-card rounded-2xl p-6 max-w-sm text-center space-y-3">
          <div className="font-display text-lg tracking-widest">前往 {step!.route}</div>
          <p className="text-sm text-foreground/70">引导继续中…</p>
          <button
            onClick={skipAll}
            className="text-xs text-muted-foreground tracking-widest hover:text-foreground"
          >
            跳过引导
          </button>
        </div>
      </div>
    );
  }

  if (!rect) return null;

  const pad = 8;
  const hx = rect.left - pad;
  const hy = rect.top - pad;
  const hw = rect.width + pad * 2;
  const hh = rect.height + pad * 2;

  // 气泡定位：默认下方，超出则上方
  const tipBelow = hy + hh + 200 < window.innerHeight;
  const tipTop = tipBelow ? hy + hh + 12 : hy - 12;
  const tipStyle: React.CSSProperties = {
    top: tipTop,
    left: Math.max(12, Math.min(window.innerWidth - 320 - 12, hx + hw / 2 - 160)),
    transform: tipBelow ? undefined : "translateY(-100%)",
  };

  const isLast = tourStep === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* 四段遮罩，镂空目标 */}
      <div
        className="absolute bg-black/70 transition-all"
        style={{ left: 0, top: 0, right: 0, height: hy }}
      />
      <div
        className="absolute bg-black/70 transition-all"
        style={{ left: 0, top: hy + hh, right: 0, bottom: 0 }}
      />
      <div
        className="absolute bg-black/70 transition-all"
        style={{ left: 0, top: hy, width: hx, height: hh }}
      />
      <div
        className="absolute bg-black/70 transition-all"
        style={{ left: hx + hw, top: hy, right: 0, height: hh }}
      />
      {/* 镂空高亮描边 */}
      <div
        className="absolute rounded-2xl ring-2 ring-primary shadow-[0_0_40px_-4px_var(--cinnabar)] transition-all pointer-events-none"
        style={{ left: hx, top: hy, width: hw, height: hh }}
      />

      {/* 气泡 */}
      <div
        className="absolute w-[320px] pointer-events-auto"
        style={tipStyle}
      >
        <div className="ink-card rounded-2xl p-5 bg-background/95 space-y-3">
          <div className="flex items-center justify-between">
            <span className="seal text-xs">第 {tourStep + 1} / {TOUR_STEPS.length} 步</span>
            <button
              onClick={skipAll}
              className="text-[11px] text-muted-foreground tracking-widest hover:text-foreground"
            >
              跳过引导
            </button>
          </div>
          <h3 className="font-display text-xl tracking-widest text-primary">{step!.title}</h3>
          <p className="text-sm text-foreground/80 leading-relaxed">{step!.body}</p>
          {step!.clickThrough ? (
            <div className="text-xs font-display tracking-widest text-primary/90 pt-1">
              {step!.hint}
            </div>
          ) : (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setTourStep(tourStep + 1)}
                className="font-display tracking-widest text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                {isLast ? "完 成" : "知道了 ›"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
