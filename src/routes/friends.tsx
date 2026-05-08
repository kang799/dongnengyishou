import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGE_TITLES, totalAttr } from "@/lib/beasts";

export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "道友 · 异兽录" }] }),
  component: FriendsPage,
});

type Row = {
  user_id: string;
  name: string;
  species: string;
  strength: number;
  speed: number;
  vitality: number;
  battle_power: number;
  evolution_stage: number;
  display_name: string;
  streak_days: number;
};

function FriendsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function load() {
    if (!user) return;
    let prof = supabase.from("profiles").select("*").neq("id", user.id).limit(50);
    if (q.trim()) prof = prof.ilike("display_name", `%${q.trim()}%`);
    const { data: profs } = await prof;
    const ids = (profs ?? []).map((p: any) => p.id);
    if (ids.length === 0) return setRows([]);
    const { data: pets } = await supabase.from("pets").select("*").in("user_id", ids);
    const petMap = new Map((pets ?? []).map((p: any) => [p.user_id, p]));
    const merged: Row[] = (profs ?? [])
      .map((p: any) => {
        const pet = petMap.get(p.id);
        if (!pet) return null;
        return {
          ...pet,
          display_name: p.display_name ?? "无名氏",
          streak_days: p.streak_days ?? 0,
        } as Row;
      })
      .filter(Boolean) as Row[];
    merged.sort((a, b) => b.battle_power - a.battle_power);
    setRows(merged);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="font-display text-4xl tracking-[0.5em] text-center mb-2">道 友 录</h1>
      <p className="text-center text-muted-foreground tracking-widest mb-8">广结道友 · 切磋异兽</p>

      <div className="flex gap-2 mb-6">
        <Input
          placeholder="以道号搜寻……"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <Button onClick={load} className="font-display tracking-widest">寻访</Button>
      </div>

      <div className="ink-card rounded-2xl divide-y divide-foreground/10">
        {rows.map((r) => (
          <div key={r.user_id} className="flex items-center gap-4 p-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center">
              <span className="font-display text-2xl text-primary/90">兽</span>
            </div>
            <div className="flex-1">
              <div className="font-display text-xl text-primary">
                {r.name}
                <span className="text-sm text-muted-foreground ml-2">道友 · {r.display_name}</span>
              </div>
              <div className="text-xs text-muted-foreground tracking-widest mt-1">
                {STAGE_TITLES[r.evolution_stage]} · 属性 {totalAttr(r)} · 连打卡 {r.streak_days} 日
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl text-primary">{r.battle_power}</div>
              <div className="text-xs text-muted-foreground tracking-widest">战力</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="font-display tracking-widest"
              onClick={() => nav({ to: "/arena" })}
            >
              切磋
            </Button>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">山高水远 · 暂无道友</div>
        )}
      </div>
    </div>
  );
}
