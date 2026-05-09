import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BeastAvatar } from "@/components/beast-avatar";
import { ArrowLeft, Send, Swords } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/$userId")({
  head: () => ({ meta: [{ title: "传音 · 动能异兽" }] }),
  component: ChatPage,
});

type Msg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

function ChatPage() {
  const { userId: otherId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [other, setOther] = useState<{ name: string; species: string; display_name: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  // Load other user info
  useEffect(() => {
    void (async () => {
      const [{ data: prof }, { data: pet }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", otherId).maybeSingle(),
        supabase.from("pets").select("name, species").eq("user_id", otherId).maybeSingle(),
      ]);
      if (pet) setOther({ name: pet.name, species: pet.species, display_name: prof?.display_name ?? "无名氏" });
    })();
  }, [otherId]);

  // Load messages + mark as read
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMsgs((data ?? []) as Msg[]);
      // mark received as read
      void supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", otherId)
        .eq("receiver_id", user.id)
        .is("read_at", null);
    })();
  }, [user, otherId]);

  // Realtime subscribe
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`chat-${user.id}-${otherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Msg;
          const involved =
            (m.sender_id === user.id && m.receiver_id === otherId) ||
            (m.sender_id === otherId && m.receiver_id === user.id);
          if (!involved) return;
          setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.receiver_id === user.id) {
            void supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, otherId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function send() {
    if (!user) return;
    const content = text.trim();
    if (!content) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, receiver_id: otherId, content })
      .select()
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    if (data) setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Msg]));
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-foreground/10">
        <Link to="/friends">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        {other && <BeastAvatar species={other.species} size={44} />}
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl text-primary truncate">
            {other?.name ?? "…"}
            <span className="text-sm text-muted-foreground ml-2">{other?.display_name ?? ""}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="font-display tracking-widest gap-1"
          onClick={() => nav({ to: "/arena", search: { vs: otherId } })}
        >
          <Swords className="h-4 w-4" />切磋
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
        {msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 break-words whitespace-pre-wrap ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {msgs.length === 0 && (
          <div className="text-center text-muted-foreground text-sm tracking-widest mt-12">尚无传音 · 道一句问候</div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-foreground/10">
        <Input
          placeholder="以心传音……"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button onClick={send} disabled={sending || !text.trim()} className="font-display tracking-widest gap-1">
          <Send className="h-4 w-4" />传音
        </Button>
      </div>
    </div>
  );
}
