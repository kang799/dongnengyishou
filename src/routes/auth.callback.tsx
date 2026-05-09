import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearGuestSession } from "@/lib/guest-session";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "入山令验证 · 动能异兽" }] }),
  component: AuthCallback,
});

const PENDING_AVATAR_KEY = "pending-signup-avatar";

async function uploadPendingAvatar(userId: string) {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem(PENDING_AVATAR_KEY);
  if (!raw) return;
  try {
    const { name, type, dataUrl } = JSON.parse(raw) as {
      name: string;
      type: string;
      dataUrl: string;
    };
    const blob = await (await fetch(dataUrl)).blob();
    const ext = (name.split(".").pop() || "png").toLowerCase();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: type || blob.type });
    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
    }
  } catch (err) {
    console.warn("pending avatar upload failed", err);
  } finally {
    sessionStorage.removeItem(PENDING_AVATAR_KEY);
  }
}

function AuthCallback() {
  const nav = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const errorDesc = params.get("error_description");

        if (errorDesc) throw new Error(errorDesc);
        if (!access_token || !refresh_token) {
          throw new Error("链接已失效，请重新发送验证邮件");
        }

        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error || !data.session) throw error ?? new Error("无法建立会话");

        clearGuestSession();
        await uploadPendingAvatar(data.session.user.id);

        // 清掉 URL 中的 hash，避免回到首页时仍带着 token
        window.history.replaceState(null, "", "/");
        toast.success("神契已成，入山！");
        nav({ to: "/" });
      } catch (err: any) {
        toast.error(err?.message || "验证失败，请重新发送邮件");
        nav({ to: "/auth" });
      }
    })();
  }, [nav]);

  return (
    <div className="container mx-auto px-6 py-24 text-center">
      <div className="font-display text-2xl tracking-widest mb-3">验 · 入 山 令</div>
      <p className="text-sm text-muted-foreground tracking-widest">正在确认神契…</p>
    </div>
  );
}