import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { STAGE_TITLES } from "@/lib/beasts";
import { BeastAvatar } from "@/components/beast-avatar";
import { toast } from "sonner";
import { MessageCircle, Swords, UserPlus, Check, X, UserMinus } from "lucide-react";

export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "道友 · 动能异兽" }] }),
  component: FriendsPage,
});

type Row = {
  user_id: string;
  name: string;
  species: string;
  battle_power: number;
  evolution_stage: number;
  display_name: string;
  streak_days: number;
  avatar_url: string | null;
};

async function loadProfilesAndPets(ids: string[]): Promise<Map<string, Row>> {
  if (ids.length === 0) return new Map();
  const [{ data: profs }, { data: pets }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, streak_days, avatar_url").in("id", ids),
    supabase.from("pets").select("*").in("user_id", ids),
  ]);
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const out = new Map<string, Row>();
  for (const pet of pets ?? []) {
    const prof = profMap.get(pet.user_id);
    if (!prof) continue;
    out.set(pet.user_id, {
      ...pet,
      display_name: prof.display_name ?? "无名氏",
      streak_days: prof.streak_days ?? 0,
      avatar_url: prof.avatar_url ?? null,
    } as Row);
  }
  return out;
}

function FriendsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  const [friends, setFriends] = useState<Row[]>([]);
  const [incoming, setIncoming] = useState<{ from: string; row: Row | null }[]>([]);
  const [outgoing, setOutgoing] = useState<{ to: string; row: Row | null }[]>([]);
  const [searchRows, setSearchRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [statusMap, setStatusMap] = useState<Record<string, "friend" | "sent" | "received" | "none">>({});

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [{ data: fs }, { data: frs }] = await Promise.all([
      supabase.from("friendships").select("*"),
      supabase.from("friend_requests").select("*").eq("status", "pending"),
    ]);
    const friendIds = (fs ?? []).map((f: any) => (f.user_a === user.id ? f.user_b : f.user_a));
    const inc = (frs ?? []).filter((r: any) => r.to_user === user.id);
    const out = (frs ?? []).filter((r: any) => r.from_user === user.id);
    const incIds = inc.map((r: any) => r.from_user);
    const outIds = out.map((r: any) => r.to_user);
    const allIds = Array.from(new Set([...friendIds, ...incIds, ...outIds]));
    const map = await loadProfilesAndPets(allIds);

    const fRows = friendIds.map((id) => map.get(id)).filter(Boolean) as Row[];
    fRows.sort((a, b) => b.battle_power - a.battle_power);
    setFriends(fRows);
    setIncoming(inc.map((r: any) => ({ from: r.from_user, row: map.get(r.from_user) ?? null })));
    setOutgoing(out.map((r: any) => ({ to: r.to_user, row: map.get(r.to_user) ?? null })));

    const sm: Record<string, "friend" | "sent" | "received" | "none"> = {};
    friendIds.forEach((id) => (sm[id] = "friend"));
    inc.forEach((r: any) => (sm[r.from_user] = "received"));
    out.forEach((r: any) => (sm[r.to_user] = "sent"));
    setStatusMap(sm);
  }, [user]);

  useEffect(() => {
    if (user) void loadAll();
  }, [user, loadAll]);

  // Realtime: refresh on friend_requests / friendships changes
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("friends-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadAll())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, loadAll]);

  async function search() {
    if (!user) return;
    let query = supabase.from("profiles").select("id").neq("id", user.id).limit(50);
    if (q.trim()) query = query.ilike("display_name", `%${q.trim()}%`);
    const { data } = await query;
    const ids = (data ?? []).map((p: any) => p.id);
    const map = await loadProfilesAndPets(ids);
    const rows = ids.map((id) => map.get(id)).filter(Boolean) as Row[];
    rows.sort((a, b) => b.battle_power - a.battle_power);
    setSearchRows(rows);
  }

  async function sendRequest(toId: string) {
    const { data, error } = await supabase.rpc("send_friend_request", { p_to: toId });
    if (error) return toast.error(error.message);
    if (data === "accepted") toast.success("已成为道友");
    else if (data === "already_friends") toast("已是道友");
    else toast.success("申请已发出");
    void loadAll();
  }
  async function acceptRequest(fromId: string) {
    const { error } = await supabase.rpc("accept_friend_request", { p_from: fromId });
    if (error) return toast.error(error.message);
    toast.success("已结为道友");
    void loadAll();
  }
  async function declineRequest(fromId: string) {
    const { error } = await supabase.rpc("decline_friend_request", { p_from: fromId });
    if (error) return toast.error(error.message);
    void loadAll();
  }
  async function removeFriend(otherId: string) {
    const { error } = await supabase.rpc("remove_friend", { p_other: otherId });
    if (error) return toast.error(error.message);
    toast("已断交");
    void loadAll();
  }

  function statusButton(otherId: string) {
    const s = statusMap[otherId] ?? "none";
    if (s === "friend") return <span className="text-xs text-muted-foreground tracking-widest">已是道友</span>;
    if (s === "sent") return <span className="text-xs text-muted-foreground tracking-widest">已发申请</span>;
    if (s === "received") return (
      <Button size="sm" onClick={() => acceptRequest(otherId)} className="font-display tracking-widest gap-1">
        <Check className="h-4 w-4" />接纳
      </Button>
    );
    return (
      <Button size="sm" variant="outline" onClick={() => sendRequest(otherId)} className="font-display tracking-widest gap-1">
        <UserPlus className="h-4 w-4" />结交
      </Button>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="font-display text-4xl tracking-[0.5em] text-center mb-2">道 友 录</h1>
      <p className="text-center text-muted-foreground tracking-widest mb-8">广结道友 · 切磋异兽</p>

      <Tabs defaultValue="friends" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="friends" className="font-display tracking-widest">
            道友 {friends.length > 0 && <span className="ml-1 text-xs">({friends.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="requests" className="font-display tracking-widest">
            申请 {incoming.length > 0 && <span className="ml-1 text-xs text-primary">({incoming.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="search" className="font-display tracking-widest">寻访</TabsTrigger>
        </TabsList>

        {/* Friends tab */}
        <TabsContent value="friends">
          <div className="ink-card rounded-2xl divide-y divide-foreground/10">
            {friends.map((r) => (
              <div key={r.user_id} className="flex items-center gap-4 p-4">
                <BeastAvatar species={r.species} size={48} avatarUrl={r.avatar_url} name={r.display_name} />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-xl text-primary truncate">
                    {r.display_name}
                    <span className="text-sm text-muted-foreground ml-2">· {r.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tracking-widest mt-1">
                    {STAGE_TITLES[r.evolution_stage]} · 战力 {r.battle_power}
                  </div>
                </div>
                <Link to="/chat/$userId" params={{ userId: r.user_id }}>
                  <Button size="sm" variant="outline" className="font-display tracking-widest gap-1">
                    <MessageCircle className="h-4 w-4" />传音
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="font-display tracking-widest gap-1"
                  onClick={() => nav({ to: "/arena", search: { vs: r.user_id } })}
                >
                  <Swords className="h-4 w-4" />切磋
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeFriend(r.user_id)}
                  title="断交"
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {friends.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">尚无道友 · 前往「寻访」结识</div>
            )}
          </div>
        </TabsContent>

        {/* Requests tab */}
        <TabsContent value="requests">
          <div className="space-y-6">
            <div>
              <h3 className="font-display tracking-widest text-sm text-muted-foreground mb-2">收到的申请</h3>
              <div className="ink-card rounded-2xl divide-y divide-foreground/10">
                {incoming.map(({ from, row }) => (
                  <div key={from} className="flex items-center gap-4 p-4">
                    {row && <BeastAvatar species={row.species} size={48} avatarUrl={row.avatar_url} name={row.display_name} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-lg text-primary truncate">
                        {row?.display_name ?? "未知"}
                        <span className="text-sm text-muted-foreground ml-2">· {row?.name ?? "—"}</span>
                      </div>
                      {row && <div className="text-xs text-muted-foreground tracking-widest mt-1">战力 {row.battle_power}</div>}
                    </div>
                    <Button size="sm" onClick={() => acceptRequest(from)} className="font-display tracking-widest gap-1">
                      <Check className="h-4 w-4" />接纳
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => declineRequest(from)} className="font-display tracking-widest gap-1">
                      <X className="h-4 w-4" />婉拒
                    </Button>
                  </div>
                ))}
                {incoming.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">无新申请</div>}
              </div>
            </div>
            <div>
              <h3 className="font-display tracking-widest text-sm text-muted-foreground mb-2">已发出的申请</h3>
              <div className="ink-card rounded-2xl divide-y divide-foreground/10">
                {outgoing.map(({ to, row }) => (
                  <div key={to} className="flex items-center gap-4 p-4">
                    {row && <BeastAvatar species={row.species} size={40} avatarUrl={row.avatar_url} name={row.display_name} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base text-foreground truncate">
                        {row?.display_name ?? "未知"}
                        <span className="text-sm text-muted-foreground ml-2">· {row?.name ?? ""}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tracking-widest">等候回应…</span>
                    <Button size="sm" variant="ghost" onClick={() => removeFriend(to)} className="text-muted-foreground">撤回</Button>
                  </div>
                ))}
                {outgoing.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">未发出申请</div>}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Search tab */}
        <TabsContent value="search">
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="以道号搜寻……（留空可看全员）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button onClick={search} className="font-display tracking-widest">寻访</Button>
          </div>
          <div className="ink-card rounded-2xl divide-y divide-foreground/10">
            {searchRows.map((r) => (
              <div key={r.user_id} className="flex items-center gap-4 p-4">
                <BeastAvatar species={r.species} size={44} avatarUrl={r.avatar_url} name={r.display_name} />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-lg text-primary truncate">
                    {r.display_name}
                    <span className="text-sm text-muted-foreground ml-2">· {r.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tracking-widest mt-1">
                    {STAGE_TITLES[r.evolution_stage]} · 战力 {r.battle_power}
                  </div>
                </div>
                {statusButton(r.user_id)}
              </div>
            ))}
            {searchRows.length === 0 && <div className="p-12 text-center text-muted-foreground">点「寻访」开始搜寻</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
