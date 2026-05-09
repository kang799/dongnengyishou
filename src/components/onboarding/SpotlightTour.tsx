import { useEffect, useRef, useState } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useOnboarding } from "./OnboardingProvider";
import { TOUR_STEPS } from "./tour-steps";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export function SpotlightTour() {
  const { tourActive, tourStep, nextTourStep, endTour } = useOnboarding();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const step = tourActive ? TOUR_STEPS[tourStep] : null;
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const rafPending = useRef(false);

  // 步骤变更时，若在错误路由先跳转
  useEffect(() => {
    if (!step) return;
    if (pathname !== step.route) {
      nav({ to: step.route as any });
    }
  }, [step, pathname, nav]);

  // 找元素：路由匹配后用 idle/setTimeout 重试 3 次
  useEffect(() => {
    if (!step || pathname !== step.route) {
      setRect(null); setMissing(false); targetRef.current = null;
      return;
    }
    let cancelled = false;
    let tries = 0;
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        targetRef.current = el;
        setMissing(false);
        recompute();
        return;
      }
      tries += 1;
      if (tries < 30) {
        // 路由懒加载 + 数据请求可能让目标元素较晚出现，重试约 6 秒
        setTimeout(find, 200);
      } else {
        targetRef.current = null;
        setRect(null);
        setMissing(true);
      }
    };
    find();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.selector, step?.route, pathname]);

  function recompute() {
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }

  // 事件驱动重算
  useEffect(() => {
    if (!step || !targetRef.current) return;
    const el = targetRef.current;

    const schedule = () => {
      if (rafPending.current) return;
      rafPending.current = true;
      requestAnimationFrame(() => {
        rafPending.current = false;
        recompute();
      });
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true } as any);
      window.removeEventListener("resize", schedule);
    };
  }, [step?.selector, step?.route, pathname]);

  // waitForClick：监听目标元素自身点击事件 → 进入下一步
  useEffect(() => {
    if (!step?.waitForClick || !targetRef.current) return;
    const el = targetRef.current;
    const handler = () => {
      // 让原本的导航/点击先执行；下一帧推进
      setTimeout(() => {
        if (step.last) endTour();
        else nextTourStep();
      }, 50);
    };
    el.addEventListener("click", handler, { once: true });
    return () => { el.removeEventListener("click", handler); };
  }, [step, rect, nextTourStep, endTour]);

  if (!tourActive || !step) return null;

  // 卡片定位（在高亮区域下方，超出视口则放上方）
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const cardWidth = Math.min(360, vw - 32);
  let cardTop = 0; let cardLeft = 0;
  if (rect) {
    const below = rect.top + rect.height + PAD + 12;
    if (below + 200 < vh) cardTop = below;
    else cardTop = Math.max(16, rect.top - 200 - PAD);
    cardLeft = Math.max(16, Math.min(vw - cardWidth - 16, rect.left + rect.width / 2 - cardWidth / 2));
  } else {
    cardTop = vh / 2 - 100;
    cardLeft = vw / 2 - cardWidth / 2;
  }

  const showNext = !step.waitForClick;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* 4 块遮罩边框 */}
      {rect ? (
        <>
          {/* 遮罩拦截点击事件，但点击不会关闭引导，强制用户按步骤推进 */}
          <div className="absolute bg-black/60 pointer-events-auto cursor-not-allowed" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
          <div className="absolute bg-black/60 pointer-events-auto cursor-not-allowed" style={{ top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
          <div className="absolute bg-black/60 pointer-events-auto cursor-not-allowed" style={{ top: rect.top - PAD, left: rect.left + rect.width + PAD, right: 0, height: rect.height + PAD * 2 }} />
          <div className="absolute bg-black/60 pointer-events-auto cursor-not-allowed" style={{ top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 }} />
          {/* 高亮虚线框 */}
          <div
            className="absolute rounded-xl border-2 border-primary shadow-[0_0_0_4px_rgba(176,47,32,0.25)] animate-pulse"
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto cursor-not-allowed" />
      )}

      {/* 卡片 */}
      <div
        className="absolute pointer-events-auto bg-background border border-foreground/20 rounded-2xl shadow-xl p-5 space-y-3"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <div className="flex items-center justify-between">
          <span className="seal text-xs">引</span>
          <span className="text-[11px] text-muted-foreground tracking-widest">
            {tourStep + 1} / {TOUR_STEPS.length}
          </span>
        </div>
        <h3 className="font-display text-xl tracking-widest text-primary">{step.title}</h3>
        <p className="text-sm text-foreground/80 leading-relaxed">{step.body}</p>
        {missing && (
          <p className="text-[11px] text-muted-foreground">（未找到目标元素，可点「下一步」继续）</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground tracking-widest">
            新手引导 · 跟随指引完成
          </span>
          {(showNext || missing) && (
            <button
              onClick={() => { if (step.last) endTour(); else nextTourStep(); }}
              className="text-sm font-display tracking-widest px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              {step.last ? "完 成" : "下 一 步 ›"}
            </button>
          )}
          {step.waitForClick && !missing && (
            <span className="text-xs font-display tracking-widest text-primary">↑ 点亮处继续</span>
          )}
        </div>
      </div>
    </div>
  );
}