import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_TITLES, totalAttr } from "@/lib/beasts";
import { useAuth } from "@/hooks/use-auth";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ title: "封神榜 · 动能异兽" }] }),
  component: Boards,
});

type Row = { user_id: string; name: string; species: string; strength: number; speed: number; vitality: number; battle_power: number; evolution_stage: number; display_name?: string; streak_days?: number };

function Boards() {
  const { user } = useAuth();
  const { onboarded, loading: onbLoading } = useOnboarding();
  const nav = useNavigate();
  const [tab, setTab] = useState<"attr" | "power" | "streak">("attr");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!onbLoading && user && !onboarded) {
      toast.message("请先完成新手修行");
      nav({ to: "/pet" });
    }
  }, [onbLoading, user, onboarded, nav]);

  useEffect(() => {
    (async () => {
      const { data: pets } = await supabase.from("pets").select("*").limit(100);
      const { data: profs } = await supabase.from("profiles").select("*");
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      let merged: Row[] = (pets ?? []).map((p: any) => ({
        ...p,
        display_name: profMap.get(p.user_id)?.display_name ?? "无名氏",
        streak_days: profMap.get(p.user_id)?.streak_days ?? 0,
      }));
      if (tab === "attr") merged.sort((a, b) => totalAttr(b) - totalAttr(a));
      else if (tab === "power") merged.sort((a, b) => b.battle_power - a.battle_power);
      else merged.sort((a, b) => (b.streak_days ?? 0) - (a.streak_days ?? 0));
      setRows(merged.slice(0, 50));
    })();
  }, [tab]);

  const TABS = [
    { id: "attr", label: "属性榜" },
    { id: "power", label: "战力榜" },
    { id: "streak", label: "打卡榜" },
  ] as const;

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="font-display text-4xl tracking-[0.5em] text-center mb-2">封 神 榜</h1>
      <p className="text-center text-muted-foreground tracking-widest mb-8">三榜并立 · 群雄逐鹿</p>
      <div className="flex justify-center gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-2 font-display tracking-widest border-b-2 transition-colors ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >{t.label}</button>
        ))}
      </div>
      <div className="ink-card rounded-2xl divide-y divide-foreground/10">
        {rows.map((r, i) => (
          <div key={r.user_id} className="flex items-center gap-4 p-4">
            <div className={`w-10 text-center font-display text-2xl ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="font-display text-xl text-primary">{r.name} <span className="text-sm text-muted-foreground ml-2">道友 · {r.display_name}</span></div>
              <div className="text-xs text-muted-foreground tracking-widest mt-1">{STAGE_TITLES[r.evolution_stage]}</div>
            </div>
            <div className="font-display text-2xl text-primary">
              {tab === "attr" && totalAttr(r)}
              {tab === "power" && r.battle_power}
              {tab === "streak" && `${r.streak_days ?? 0} 日`}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="p-12 text-center text-muted-foreground">榜单虚位以待</div>}
      </div>
    </div>
  );
}
