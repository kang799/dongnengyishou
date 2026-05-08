import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { randomBeast } from "@/lib/beasts";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "招神入册 · 异兽录" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [petName, setPetName] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const finalPetName = petName.trim() || randomBeast();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        // 若用户自定义宠物名，覆盖 trigger 默认值
        if (data.user && petName.trim()) {
          await supabase.from("pets").update({ name: finalPetName }).eq("user_id", data.user.id);
        }
        toast.success(`异兽 ${finalPetName} 已与你结契`);
        nav({ to: "/pet" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/pet" });
      }
    } catch (err: any) {
      toast.error(err.message || "出错了");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    try {
      const { lovable } = await import("@/integrations/lovable");
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/pet" });
      if (r.error) toast.error("Google 登录失败");
    } catch {
      toast.error("Google 登录暂未启用");
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <div className="ink-card rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="seal inline-block text-2xl mb-3">{mode === "signup" ? "招" : "归"}</div>
          <h1 className="font-display text-3xl tracking-widest">
            {mode === "signup" ? "招神入册" : "复归山门"}
          </h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <Label className="font-display tracking-widest">道号</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：青衫客" />
              </div>
              <div>
                <Label className="font-display tracking-widest">异兽名（留空则随机）</Label>
                <Input value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="例：饕餮" />
              </div>
            </>
          )}
          <div>
            <Label className="font-display tracking-widest">邮箱</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="font-display tracking-widest">密钥</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full font-display tracking-widest text-lg">
            {loading ? "施法中…" : mode === "signup" ? "结契" : "入山"}
          </Button>
        </form>
        <Button onClick={google} variant="outline" className="w-full mt-3 font-display tracking-widest">
          以 Google 入山
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-primary tracking-widest"
        >
          {mode === "signup" ? "已有道号？复归山门" : "尚未结契？招神入册"}
        </button>
      </div>
    </div>
  );
}
