import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { BattleEvent } from "@/lib/battle";
import { STAGE_TITLES } from "@/lib/beasts";
import { toast } from "sonner";

export const Route = createFileRoute("/arena")({
  head: () => ({ meta: [{ title: "斗兽台 · 动能异兽" }] }),
  component: Arena,
});

type Pet = {
  id: string; user_id: string; name: string; species: string;
  strength: number; speed: number; vitality: number;
  evolution_stage: number; battle_power: number; wins: number; losses: number;
};

function Arena() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [me, setMe] = useState<Pet | null>(null);
  const [opponents, setOpponents] = useState<Pet[]>([]);
  const [battleEvents, setBattleEvents] = useState<BattleEvent[]>([]);
  const [battling, setBattling] = useState(false);
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [opponent, setOpponent] = useState<Pet | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function load() {
    if (!user) return;
    const { data: my } = await supabase.from("pets").select("*").eq("user_id", user.id).maybeSingle();
    const { data: opps } = await supabase
      .from("pets")
      .select("*")
      .neq("user_id", user.id)
      .order("battle_power", { ascending: true })
      .limit(20);
    if (my) setMe(my as Pet);
    setOpponents((opps as Pet[]) ?? []);
  }
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  async function challenge(opp: Pet) {
    if (!me || !user) return;
    setOpponent(opp);
    setBattleEvents([]);
    setResult(null);
    setBattling(true);
    // Battle is simulated and persisted server-side; client only animates.
    const { data, error } = await supabase.rpc("run_battle", {
      p_defender: opp.user_id,
    });
    if (error || !data) {
      console.error("run_battle failed", error);
      toast.error("战斗失败，请稍后再试");
      setBattling(false);
      return;
    }
    const result = data as unknown as { winner: "challenger" | "defender"; events: BattleEvent[] };
    for (let i = 0; i < result.events.length; i++) {
      await new Promise((r) => setTimeout(r, 600));
      setBattleEvents((prev) => [...prev, result.events[i]]);
    }
    const won = result.winner === "challenger";
    setResult(won ? "win" : "lose");
    toast[won ? "success" : "error"](won ? "胜！战力提升" : "败！再去修行");
    setBattling(false);
    load();
  }

  if (!me) return <div className="container mx-auto py-20 text-center text-muted-foreground">召唤中…</div>;

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl space-y-6">
      <h1 className="font-display text-4xl tracking-widest text-center">斗 兽 台</h1>
      <p className="text-center text-muted-foreground tracking-widest">挑战其他道友，胜则取代其战力榜排名</p>

      {opponent && (
        <div className="ink-card rounded-3xl p-6">
          <div className="grid grid-cols-3 items-center gap-4 mb-4">
            <PetHead p={me} side="left" />
            <div className="text-center font-display text-3xl tracking-[0.5em] text-primary">VS</div>
            <PetHead p={opponent} side="right" />
          </div>
          <div className="bg-secondary/10 rounded-xl p-4 max-h-64 overflow-y-auto space-y-1 font-display tracking-wider">
            {battleEvents.map((e, i) => (
              <div key={i} className="text-sm">
                <span className="text-muted-foreground mr-2">[第{e.turn}回合]</span>
                <span className={e.dodged ? "text-accent" : ""}>{e.text}</span>
              </div>
            ))}
            {battling && battleEvents.length === 0 && <div className="text-sm">交手中…</div>}
          </div>
          {result && (
            <div className={`mt-4 text-center font-display text-3xl tracking-[0.5em] ${result === "win" ? "text-primary" : "text-secondary"}`}>
              {result === "win" ? "胜！" : "败！"}
            </div>
          )}
        </div>
      )}

      <div className="ink-card rounded-2xl p-6">
        <h2 className="font-display text-2xl tracking-widest mb-4 border-b border-foreground/15 pb-2">候选对手</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {opponents.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-xl border border-foreground/10 p-4 bg-background/50">
              <div>
                <div className="font-display text-xl text-primary">{o.name}</div>
                <div className="text-xs text-muted-foreground tracking-widest">
                  {STAGE_TITLES[o.evolution_stage]} · 战力 {o.battle_power}
                </div>
              </div>
              <Button
                disabled={battling}
                onClick={() => challenge(o)}
                size="sm"
                className="font-display tracking-widest"
              >挑战</Button>
            </div>
          ))}
          {opponents.length === 0 && (
            <div className="col-span-2 text-center py-8 text-muted-foreground">暂无对手，邀请好友共修</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PetHead({ p, side }: { p: Pet; side: "left" | "right" }) {
  return (
    <div className={`text-center ${side === "right" ? "scale-x-[-1]" : ""}`}>
      <div className={`mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center ${side === "right" ? "scale-x-[-1]" : ""}`}>
        <span className="font-display text-4xl text-primary">兽</span>
      </div>
      <div className={`mt-2 font-display text-xl text-primary ${side === "right" ? "scale-x-[-1]" : ""}`}>{p.name}</div>
      <div className={`text-xs text-muted-foreground tracking-widest ${side === "right" ? "scale-x-[-1]" : ""}`}>战力 {p.battle_power}</div>
    </div>
  );
}
