import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { preloadPoseModel, usePoseCounter, type ExerciseType } from "@/hooks/use-pose-counter";
import { Button } from "@/components/ui/button";
import { computeBattlePower } from "@/lib/beasts";
import { toast } from "sonner";

export const Route = createFileRoute("/train")({
  head: () => ({ meta: [{ title: "修行 · 异兽录" }] }),
  component: TrainPage,
});

const EXERCISES: { id: ExerciseType; kanji: string; title: string; stat: string; desc: string }[] = [
  { id: "squat", kanji: "速", title: "深蹲", stat: "speed", desc: "+1 速度 / 次（提升闪避）" },
  { id: "pushup", kanji: "力", title: "俯卧撑", stat: "strength", desc: "+1 力量 / 次（提升攻击）" },
  { id: "situp", kanji: "体", title: "仰卧起坐", stat: "vitality", desc: "+1 体质 / 次（提升血量）" },
];

function TrainPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [active, setActive] = useState(false);
  const [exercise, setExercise] = useState<ExerciseType>("squat");
  const { videoRef, canvasRef, count, ready, error, reset, startCamera } = usePoseCounter(exercise, active);
  const lastSyncedRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);

  // 进入页面就预热模型 + WASM，启动时延迟更短
  useEffect(() => {
    preloadPoseModel();
  }, []);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  // 节流：累计 reps，每 2 秒批量写一次，避免每个动作都打数据库
  useEffect(() => {
    if (count <= lastSyncedRef.current || !user) return;
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => {
      const delta = count - lastSyncedRef.current;
      lastSyncedRef.current = count;
      flushTimerRef.current = null;
      if (delta > 0) void persistRep(exercise, delta);
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // 离开页面时确保未提交的 reps 落盘
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  async function persistRep(ex: ExerciseType, delta: number) {
    if (!user) return;
    const col = ex === "squat" ? "speed" : ex === "pushup" ? "strength" : "vitality";
    // 1) load pet
    const { data: pet } = await supabase.from("pets").select("*").eq("user_id", user.id).maybeSingle();
    if (!pet) return;
    const next: any = { ...pet, [col]: (pet as any)[col] + delta };
    const bp = computeBattlePower(next);
    const update: any = { battle_power: bp };
    update[col] = next[col];
    await supabase.from("pets").update(update).eq("id", pet.id);
    await supabase.from("exercise_logs").insert({ user_id: user.id, exercise_type: ex, reps: delta });
    // 打卡天数
    const today = new Date().toISOString().slice(0, 10);
    const { data: pr } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (pr && pr.last_checkin_date !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const newStreak = pr.last_checkin_date === yesterday ? pr.streak_days + 1 : 1;
      await supabase.from("profiles").update({ last_checkin_date: today, streak_days: newStreak }).eq("id", user.id);
    }
  }

  function start() {
    lastSyncedRef.current = 0;
    reset();
    void startCamera();
    setActive(true);
  }
  function stop() {
    setActive(false);
    // 收功时立即把剩余 reps 写入
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const delta = count - lastSyncedRef.current;
    if (delta > 0) {
      lastSyncedRef.current = count;
      void persistRep(exercise, delta);
    }
    toast.success(`本次修行 ${count} 次，真气已注入异兽`);
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl space-y-6">
      <div className="text-center">
        <h1 className="font-display text-4xl tracking-widest">修行 · 三式</h1>
        <p className="text-muted-foreground mt-2 text-sm tracking-widest">
          站于摄像头前，全身入镜，AI 自动计数
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {EXERCISES.map((e) => (
          <button
            key={e.id}
            onClick={() => { if (!active) setExercise(e.id); }}
            className={`ink-card rounded-2xl p-6 text-left transition-all ${
              exercise === e.id ? "ring-2 ring-primary -translate-y-1" : "hover:-translate-y-1"
            } ${active && exercise !== e.id ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span className="font-display text-5xl text-primary">{e.kanji}</span>
              <div>
                <div className="font-display text-xl tracking-widest">{e.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{e.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="ink-card rounded-3xl p-6">
        <div className="relative aspect-video bg-secondary/20 rounded-xl overflow-hidden flex items-center justify-center">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none" />
          {!active && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center space-y-4">
                <div className="font-display text-2xl tracking-widest text-muted-foreground">
                  点击 [启动] 开启摄像头修行
                </div>
              </div>
            </div>
          )}
          {active && !ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <div className="font-display text-xl">加载姿态识别模型…</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6">
              <div className="text-center text-destructive font-display">{error}</div>
            </div>
          )}
          <div className="absolute top-4 left-4 seal text-2xl px-4">{count}</div>
        </div>

        <div className="flex gap-3 mt-4 justify-center">
          {!active ? (
            <Button size="lg" onPointerDown={() => void startCamera()} onClick={start} className="font-display tracking-widest text-lg px-10">
              启动修行
            </Button>
          ) : (
            <Button size="lg" variant="secondary" onClick={stop} className="font-display tracking-widest text-lg px-10">
              收功 · {count} 次
            </Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3 tracking-widest">
          每完成一个标准动作，对应属性 +1，并自动累计连续打卡天数
        </p>
      </div>
    </div>
  );
}
