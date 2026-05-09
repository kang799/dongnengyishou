import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import logoUrl from "@/assets/logo.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { loadGuestSession, clearSupabaseLocalAuth, saveGuestSession } from "@/lib/guest-session";
const NAV = [
  { to: "/pet", label: "我的异兽" },
  { to: "/train", label: "修行" },
  { to: "/friends", label: "道友" },
  { to: "/leaderboards", label: "封神榜" },
] as const;

export function SiteHeader() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const onAuthPage = loc.pathname === "/" || loc.pathname === "/auth";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const userId = user?.id;
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    if (!userId) { setAvatarUrl(null); setDisplayName(null); setIsGuest(false); return; }
    void supabase
      .from("profiles")
      .select("avatar_url, display_name, is_guest")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setAvatarUrl(data?.avatar_url ?? null);
        setDisplayName(data?.display_name ?? null);
        setIsGuest(!!(data as any)?.is_guest);
      });
  }, [userId]);

  function openEdit() {
    setEditName(displayName ?? "");
    setEditAvatarFile(null);
    setEditAvatarPreview(avatarUrl);
    setEditOpen(true);
  }

  function pickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("头像不可超过 3MB"); return; }
    setEditAvatarFile(file);
    setEditAvatarPreview(URL.createObjectURL(file));
  }

  async function saveProfile() {
    if (!userId) return;
    const name = editName.trim();
    if (name.length < 1 || name.length > 6) {
      toast.error("道号需 1–6 个字");
      return;
    }
    setSaving(true);
    try {
      let newUrl = avatarUrl;
      if (editAvatarFile) {
        const ext = editAvatarFile.name.split(".").pop() || "png";
        const path = `${userId}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, editAvatarFile, { upsert: true, contentType: editAvatarFile.type });
        if (upErr) throw upErr;
        newUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name, avatar_url: newUrl })
        .eq("id", userId);
      if (error) {
        if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
          toast.error("此道号已被其他道友占用，请换一个");
        } else {
          toast.error(error.message);
        }
        return;
      }
      setDisplayName(name);
      setAvatarUrl(newUrl);
      setEditOpen(false);
      toast.success("身份已更新");
    } catch (err: any) {
      toast.error(err.message || "更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <header className="border-b border-foreground/15 bg-background/95 sticky top-0 z-30">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoUrl} alt="动能异兽" className="h-10 w-10 rounded-full object-cover" />
          <span className="font-display text-2xl tracking-[0.25em] hidden sm:inline">动能异兽</span>
        </Link>
        {user && (
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-4 py-2 font-display tracking-widest text-foreground/70 hover:text-primary transition-colors"
                activeProps={{ className: "px-4 py-2 font-display tracking-widest text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {!loading && user && (
            <>
              <button
                type="button"
                onClick={openEdit}
                className="flex items-center gap-2 rounded-full hover:bg-foreground/5 transition-colors px-1 py-1"
                aria-label="修改身份"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="头像"
                    className="h-8 w-8 rounded-full object-cover border border-foreground/20"
                  />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-display">
                    {(displayName?.[0] ?? "兽")}
                  </span>
                )}
                <span className="hidden sm:inline text-sm text-foreground/80 font-display tracking-widest">
                  {displayName ?? "道友"}
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (isGuest) {
                    // 游客：在退出前刷新一次 refresh_token 并保存到游客缓存，
                    // 然后只清掉浏览器中的 supabase 会话键，保留后端 session 与游客缓存，
                    // 这样下次进入登录页可凭 refresh_token 恢复身份。
                    try {
                      const { data } = await supabase.auth.refreshSession();
                      const sess = data.session;
                      if (sess) {
                        saveGuestSession({
                          access_token: sess.access_token,
                          refresh_token: sess.refresh_token,
                          user_id: sess.user.id,
                        });
                      } else {
                        // 兜底：使用现有 session
                        const cur = (await supabase.auth.getSession()).data.session;
                        if (cur) {
                          saveGuestSession({
                            access_token: cur.access_token,
                            refresh_token: cur.refresh_token,
                            user_id: cur.user.id,
                          });
                        }
                      }
                    } catch (e) {
                      console.warn("refresh before guest signout failed", e);
                    }
                    clearSupabaseLocalAuth();
                  } else {
                    await supabase.auth.signOut();
                  }
                  window.location.href = "/";
                }}
              >
                归隐
              </Button>
            </>
          )}
          {!loading && !user && !onAuthPage && (
            <Link to="/auth">
              <Button size="sm">入门</Button>
            </Link>
          )}
        </div>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display tracking-widest">修改身份</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-20 w-20 rounded-full border-2 border-dashed border-foreground/30 overflow-hidden flex items-center justify-center bg-background/40 hover:border-primary transition-colors"
              >
                {editAvatarPreview ? (
                  <img src={editAvatarPreview} alt="头像" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground tracking-widest">上传头像</span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <span className="text-[11px] text-muted-foreground tracking-widest">点击更换 · 不超过 3MB</span>
            </div>
            <div>
              <Label className="font-display tracking-widest">道号（1–6 字，需唯一）</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value.slice(0, 6))}
                maxLength={6}
                placeholder="例：青衫客"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={saveProfile} disabled={saving} className="font-display tracking-widest">
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
