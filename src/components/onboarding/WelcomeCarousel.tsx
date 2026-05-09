import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./OnboardingProvider";
import heroBeast from "@/assets/hero-kinetic-beast.png";

const SLIDES = [
  {
    seal: "壹",
    title: "以汗水 · 唤醒异兽",
    body: "你结契一只山海经异兽。每一次心跳，都是它的心跳。",
    art: <img src={heroBeast} alt="" className="w-full h-full object-cover" />,
  },
  {
    seal: "贰",
    title: "三式修行 · 喂养真气",
    body: "深蹲炼速、俯卧撑炼力、仰卧起坐炼体。摄像头自动计数，每动一次 +1。",
    art: (
      <div className="grid grid-cols-3 gap-4 p-10 h-full place-items-center">
        {[
          { k: "速", t: "深蹲" },
          { k: "力", t: "俯卧撑" },
          { k: "体", t: "仰卧起坐" },
        ].map((x) => (
          <div key={x.k} className="text-center">
            <div className="font-display text-7xl text-primary leading-none">{x.k}</div>
            <div className="font-display text-sm tracking-widest text-foreground/70 mt-3">{x.t}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    seal: "叁",
    title: "破壳进化 · 阶位飞升",
    body: "三脉真气各满 10 → 100 → 1000，异兽即破壳进化为更高神格。",
    art: (
      <div className="flex flex-col gap-2 p-8 h-full justify-center font-display tracking-widest">
        {["初生灵兽 · 起", "化形异兽 · 各满 10", "通灵神兽 · 各满 100", "上古凶兽 · 各满 1000", "天地圣兽 · 各满 10000", "鸿蒙创世 · 各满 100000"].map(
          (s, i) => (
            <div key={s} className={`flex items-center gap-3 ${i === 0 ? "text-primary" : "text-foreground/60"}`}>
              <span className="seal text-xs w-7 text-center">{["初", "壹", "贰", "叁", "肆", "伍"][i]}</span>
              <span>{s}</span>
            </div>
          )
        )}
      </div>
    ),
  },
  {
    seal: "肆",
    title: "封神榜 · 道友切磋",
    body: "登斗兽台与天下道友捉对厮杀，问鼎属性、战力、打卡三大封神榜。",
    art: (
      <div className="p-10 h-full flex flex-col items-center justify-center text-center gap-4">
        <div className="font-display text-6xl text-primary">榜</div>
        <div className="font-display text-lg tracking-[0.4em] text-foreground/80">封 · 神 · 榜</div>
        <div className="text-xs text-muted-foreground tracking-widest">属性榜 · 战力榜 · 打卡榜</div>
      </div>
    ),
  },
] as const;

export function WelcomeCarousel() {
  const { welcomeOpen, closeWelcome, startTour, hasUser } = useOnboarding();
  const nav = useNavigate();
  const [idx, setIdx] = useState(0);

  if (!hasUser) return null;

  const last = idx === SLIDES.length - 1;
  const slide = SLIDES[idx];

  function handleStart() {
    closeWelcome();
    startTour();
    // 引导从 /pet 开始
    nav({ to: "/pet" });
  }

  return (
    <Dialog open={welcomeOpen} onOpenChange={(o) => !o && closeWelcome()}>
      <DialogContent
        className="max-w-3xl p-0 overflow-hidden border-foreground/15 bg-background [&>button]:hidden"
      >
        <div className="relative">
          {/* 跳过 */}
          <button
            onClick={closeWelcome}
            className="absolute top-3 right-4 z-10 text-xs font-display tracking-widest text-foreground/50 hover:text-foreground"
          >
            跳过 ›
          </button>

          {/* 视觉区 */}
          <div className="relative h-[280px] md:h-[340px] overflow-hidden bg-gradient-to-b from-secondary/30 to-background">
            {slide.art}
            <div className="absolute top-4 left-4 seal text-xs">{slide.seal}</div>
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          </div>

          {/* 文案 */}
          <div className="px-8 py-6 text-center space-y-3">
            <h2 className="font-display text-3xl tracking-widest">{slide.title}</h2>
            <p className="text-sm md:text-base text-foreground/75 leading-loose max-w-xl mx-auto">
              {slide.body}
            </p>
          </div>

          {/* 圆点 */}
          <div className="flex justify-center gap-2 pb-3">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-6 bg-primary" : "w-1.5 bg-foreground/25"
                }`}
              />
            ))}
          </div>

          {/* 操作 */}
          <div className="flex items-center justify-between gap-3 px-8 pb-6 pt-1">
            <Button
              variant="ghost"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="font-display tracking-widest"
            >
              ‹ 上 一 卷
            </Button>
            {last ? (
              <Button
                size="lg"
                onClick={handleStart}
                className="font-display tracking-[0.3em] px-8"
              >
                开 始 第 一 课
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => setIdx((i) => Math.min(SLIDES.length - 1, i + 1))}
                className="font-display tracking-widest px-6"
              >
                下 一 卷 ›
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
