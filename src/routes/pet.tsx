import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canEvolve, evolutionPointsGranted, evolutionThreshold, STAGE_TITLES, totalAttr } from "@/lib/beasts";
import { getBeastIcon } from "@/lib/beast-icons";
import { toast } from "sonner";

export const Route = createFileRoute("/pet")({
  head: () => ({ meta: [{ title: "我的异兽 · 动能异兽" }] }),
  component: PetPage,
});

type Pet = {
  id: string; user_id: string; name: string; species: string;
  strength: number; speed: number; vitality: number;
  evolution_stage: number; wins: number; losses: number; battle_power: number;
  free_points: number;
};
type Profile = { id: string; display_name: string; streak_days: number; last_checkin_date: string | null };

function PetPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [pet, setPet] = useState<Pet | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [allocStr, setAllocStr] = useState(0);
  const [allocSpd, setAllocSpd] = useState(0);
  const [allocVit, setAllocVit] = useState(0);
  const [allocBusy, setAllocBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function load() {
    if (!user) return;
    setFetching(true);
    setFetchErr(null);
    try {
      // 触发器在 signup 时创建 profile/pet，可能会有微小延迟，最多重试 5 次
      let p: any = null;
      let pr: any = null;
      for (let i = 0; i < 5; i++) {
        const [petRes, profRes] = await Promise.all([
          supabase.from("pets").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        ]);
        if (petRes.error) throw petRes.error;
        if (profRes.error) throw profRes.error;
        p = petRes.data;
        pr = profRes.data;
        if (p && pr) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!pr) {
        const { data } = await supabase
          .from("profiles")
          .insert({ id: user.id, display_name: user.email?.split("@")[0] ?? "无名氏" })
          .select()
          .maybeSingle();
        pr = data;
      }
      if (!p) {
        const { randomBeast } = await import("@/lib/beasts");
        const name = randomBeast();
        const { data } = await supabase
          .from("pets")
          .insert({ user_id: user.id, name, species: name })
          .select()
          .maybeSingle();
        p = data;
      }
      setPet(p as Pet);
      setProfile(pr as Profile);
    } catch (e: any) {
      console.error("load pet/profile failed", e);
      setFetchErr(e?.message ?? "加载失败");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function evolve() {
    if (!pet) return;
    if (!canEvolve(pet.evolution_stage, pet.strength, pet.speed, pet.vitality)) {
      toast.error("尚未达到进化条件");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("evolve_pet");
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      const stage = (data as any)?.stage ?? pet.evolution_stage + 1;
      const granted = (data as any)?.granted ?? evolutionPointsGranted(stage);
      toast.success(`${pet.name} 蜕变 · ${STAGE_TITLES[stage]}　获自由属性点 ${granted}`);
      load();
    }
  }

  function resetAlloc() {
    setAllocStr(0); setAllocSpd(0); setAllocVit(0);
  }

  async function commitAlloc() {
    if (!pet) return;
    const total = allocStr + allocSpd + allocVit;
    if (total <= 0) { toast.error("请先分配点数"); return; }
    if (total > pet.free_points) { toast.error("超出可用自由点"); return; }
    setAllocBusy(true);
    const { error } = await supabase.rpc("allocate_points", {
      p_str: allocStr, p_spd: allocSpd, p_vit: allocVit,
    });
    setAllocBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`已注入 ${total} 点真气`);
    resetAlloc();
    load();
  }

  if (loading || fetching) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">召唤中…</div>;
  }
  if (fetchErr || !pet || !profile) {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-secondary">召唤受阻：{fetchErr ?? "未找到异兽"}</div>
        <Button onClick={load}>重试</Button>
      </div>
    );
  }

  const threshold = evolutionThreshold(pet.evolution_stage);
  const stageName = STAGE_TITLES[pet.evolution_stage] ?? "鸿蒙创世";
  const evolvable = canEvolve(pet.evolution_stage, pet.strength, pet.speed, pet.vitality);
  const beastIcon = getBeastIcon(pet.species);
  const allocTotal = allocStr + allocSpd + allocVit;
  const allocRemaining = pet.free_points - allocTotal;
  const nextEvoGrant = evolutionPointsGranted(pet.evolution_stage + 1);

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl space-y-8">
      <div className="grid md:grid-cols-[1.1fr_1fr] gap-6">
        {/* Pet portrait */}
        <div data-tour="pet-portrait" className="ink-card rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-6 right-6 seal text-sm">{stageName}</div>
          <div className="text-center">
            <div className="text-xs tracking-[0.5em] text-muted-foreground mb-3">道号 · {profile.display_name}</div>
            <div className="font-display text-6xl text-primary mb-2">{pet.name}</div>
            <div className="text-sm text-muted-foreground tracking-widest">出自《山海经》· {pet.species}</div>
            <div className="my-8 flex items-center justify-center">
              <div className="w-44 h-44 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center shadow-[0_0_60px_-10px_var(--cinnabar)]">
                {beastIcon ? (
                  <img
                    src={beastIcon}
                    alt={pet.species}
                    className="w-36 h-36 object-contain select-none"
                  />
                ) : (
                  <span className="font-display text-8xl text-primary/90 select-none">兽</span>
                )}
              </div>
            </div>
            <div className="flex justify-center gap-6 text-sm font-display tracking-widest">
              <span>战力 <b className="text-primary text-xl">{pet.battle_power}</b></span>
              <span>胜 <b className="text-primary text-xl">{pet.wins}</b></span>
              <span>负 <b className="text-secondary text-xl">{pet.losses}</b></span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div data-tour="pet-stats" className="ink-card rounded-3xl p-8 space-y-6">
          <h2 className="font-display text-2xl tracking-widest border-b border-foreground/15 pb-3">三脉真气</h2>
          <StatBar label="力量 · 攻" value={pet.strength} threshold={threshold} />
          <StatBar label="速度 · 闪" value={pet.speed} threshold={threshold} />
          <StatBar label="体质 · 命" value={pet.vitality} threshold={threshold} />
          <div className="pt-3">
            <div className="text-xs text-muted-foreground tracking-widest mb-3">
              进化条件：三属性各满 <b>{threshold}</b> 点 · 可得自由点 <b className="text-primary">{nextEvoGrant}</b>
            </div>
            <Button
              disabled={!evolvable || busy}
              onClick={evolve}
              className="w-full font-display tracking-widest text-lg"
            >
              {evolvable ? "破壳进化" : "修行未满"}
            </Button>
          </div>
          <div className="pt-3 grid grid-cols-2 gap-3">
            <Link to="/train" className="block" data-tour="pet-go-train">
              <Button variant="outline" className="w-full font-display tracking-widest">前往修行</Button>
            </Link>
            <Link to="/arena" className="block">
              <Button variant="outline" className="w-full font-display tracking-widest">登斗兽台</Button>
            </Link>
          </div>
        </div>
      </div>

      {pet.free_points > 0 && (
        <div className="ink-card rounded-3xl p-8 space-y-5">
          <div className="flex items-baseline justify-between border-b border-foreground/15 pb-3">
            <h2 className="font-display text-2xl tracking-widest">自由真气</h2>
            <div className="text-sm tracking-widest text-muted-foreground">
              可分配 <b className="text-primary text-xl">{allocRemaining}</b>
              <span className="mx-2">/</span>
              共 <b>{pet.free_points}</b> 点
            </div>
          </div>
          <p className="text-xs text-muted-foreground tracking-widest">
            进化所赐之力，可任分于力速命三脉。一次注入，战力立增。
          </p>
          <AllocRow label="力量" value={allocStr} setValue={setAllocStr} max={pet.free_points} otherSum={allocSpd + allocVit} />
          <AllocRow label="速度" value={allocSpd} setValue={setAllocSpd} max={pet.free_points} otherSum={allocStr + allocVit} />
          <AllocRow label="体质" value={allocVit} setValue={setAllocVit} max={pet.free_points} otherSum={allocStr + allocSpd} />
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" className="font-display tracking-widest"
              onClick={() => { setAllocStr(pet.free_points); setAllocSpd(0); setAllocVit(0); }}>
              全注力量
            </Button>
            <Button variant="outline" className="font-display tracking-widest"
              onClick={() => { setAllocStr(0); setAllocSpd(pet.free_points); setAllocVit(0); }}>
              全注速度
            </Button>
            <Button variant="outline" className="font-display tracking-widest"
              onClick={() => { setAllocStr(0); setAllocSpd(0); setAllocVit(pet.free_points); }}>
              全注体质
            </Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1 font-display tracking-widest" onClick={resetAlloc} disabled={allocBusy}>
              重置
            </Button>
            <Button className="flex-1 font-display tracking-widest text-lg" onClick={commitAlloc} disabled={allocBusy || allocTotal === 0}>
              确认分配 {allocTotal > 0 ? `（${allocTotal}）` : ""}
            </Button>
          </div>
        </div>
      )}

      <div className="ink-card rounded-2xl p-6 grid grid-cols-3 text-center divide-x divide-foreground/10">
        <Block label="属性总和" value={totalAttr(pet)} />
        <Block label="连续打卡" value={`${profile.streak_days} 日`} />
        <Block label="阶位" value={stageName} />
      </div>
    </div>
  );
}

function StatBar({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  const pct = Math.min(100, (value / threshold) * 100);
  return (
    <div>
      <div className="flex justify-between mb-2 font-display tracking-widest">
        <span>{label}</span>
        <span className="text-primary">{value} <span className="text-muted-foreground text-xs">/ {threshold}</span></span>
      </div>
      <div className="ink-progress">
        <div className="ink-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Block({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4">
      <div className="text-xs tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className="font-display text-2xl text-primary">{value}</div>
    </div>
  );
}

function AllocRow({
  label, value, setValue, max, otherSum,
}: {
  label: string; value: number; setValue: (n: number) => void; max: number; otherSum: number;
}) {
  const cap = Math.max(0, max - otherSum);
  const clamp = (n: number) => Math.max(0, Math.min(cap, Math.floor(n || 0)));
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 font-display tracking-widest">{label}</div>
      <Button size="sm" variant="outline" onClick={() => setValue(clamp(value - 1))} disabled={value <= 0}>－</Button>
      <Input
        type="number"
        min={0}
        max={cap}
        value={value}
        onChange={(e) => setValue(clamp(parseInt(e.target.value, 10)))}
        className="w-24 text-center font-display"
      />
      <Button size="sm" variant="outline" onClick={() => setValue(clamp(value + 1))} disabled={value >= cap}>＋</Button>
      <Button size="sm" variant="ghost" className="text-xs tracking-widest text-muted-foreground"
        onClick={() => setValue(cap)} disabled={cap === 0}>
        余 {cap} 全注
      </Button>
    </div>
  );
}
