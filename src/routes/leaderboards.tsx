import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_TITLES, totalAttr } from "@/lib/beasts";
import { getBeastIcon } from "@/lib/beast-icons";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ title: "封神榜 · 动能异兽" }] }),
  component: Boards,
});

type Row = { user_id: string; name: string; species: string; strength: number; speed: number; vitality: number; battle_power: number; evolution_stage: number; display_name?: string; streak_days?: number };

function Boards() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"attr" | "power" | "streak">("attr");
  const [rows, setRows] = useState<Row[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);

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

  const myIndex = user ? rows.findIndex((r) => r.user_id === user.id) : -1;
  const myRow = myIndex >= 0 ? rows[myIndex] : null;

  function locateMe() {
    if (!user) return;
    const el = document.getElementById(`row-${user.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(user.id);
    window.setTimeout(() => setFlashId(null), 1200);
  }

  function renderMetric(r: Row) {
    if (tab === "attr") return totalAttr(r);
    if (tab === "power") return r.battle_power;
    return `${r.streak_days ?? 0} 日`;
  }

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
      {myRow && (
        <div className="ink-card rounded-2xl mb-4 border border-primary/40 bg-primary/5">
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 text-center font-display text-2xl text-primary">
              {myIndex + 1}
            </div>
            <BeastAvatar species={myRow.species} />
            <div className="flex-1">
              <div className="font-display text-xl text-primary">
                {myRow.name}
                <span className="text-sm text-muted-foreground ml-2">道友 · {myRow.display_name}（我）</span>
              </div>
              <div className="text-xs text-muted-foreground tracking-widest mt-1">{STAGE_TITLES[myRow.evolution_stage]}</div>
            </div>
            <div className="font-display text-2xl text-primary">{renderMetric(myRow)}</div>
            <Button
              size="sm"
              variant="outline"
              onClick={locateMe}
              className="font-display tracking-widest gap-1"
            >
              <Crosshair className="h-4 w-4" /> 定位
            </Button>
          </div>
        </div>
      )}
      <div className="ink-card rounded-2xl divide-y divide-foreground/10">
        {rows.map((r, i) => (
          <div
            key={r.user_id}
            id={`row-${r.user_id}`}
            className={`flex items-center gap-4 p-4 transition-all ${
              flashId === r.user_id ? "ring-2 ring-primary bg-primary/10" : ""
            }`}
          >
            <div className={`w-10 text-center font-display text-2xl ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
              {i + 1}
            </div>
            <BeastAvatar species={r.species} />
            <div className="flex-1">
              <div className="font-display text-xl text-primary">{r.name} <span className="text-sm text-muted-foreground ml-2">道友 · {r.display_name}</span></div>
              <div className="text-xs text-muted-foreground tracking-widest mt-1">{STAGE_TITLES[r.evolution_stage]}</div>
            </div>
            <div className="font-display text-2xl text-primary">
              {tab === "attr" && totalAttr(r)}
              {tab === "power" && r.battle_power}
              {tab === "streak" && `${r.streak_days ?? 0} 日`}
            </div>
            {user && r.user_id !== user.id && (
              <Button
                size="sm"
                onClick={() => nav({ to: "/arena", search: { vs: r.user_id } })}
                className="font-display tracking-widest"
              >
                切磋
              </Button>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="p-12 text-center text-muted-foreground">榜单虚位以待</div>}
      </div>
    </div>
  );
}

function BeastAvatar({ species }: { species: string }) {
  const icon = getBeastIcon(species);
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center shrink-0 overflow-hidden">
      {icon ? (
        <img src={icon} alt={species} className="w-9 h-9 object-contain" />
      ) : (
        <span className="font-display text-lg text-primary/80">兽</span>
      )}
    </div>
  );
}
