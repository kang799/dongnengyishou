import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { randomBeast } from "@/lib/beasts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { saveGuestSession, loadGuestSession, clearGuestSession, clearSupabaseLocalAuth } from "@/lib/guest-session";
import { deleteGuestAccount } from "@/lib/guest-cleanup.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "招神入册 · 动能异兽" }] }),
  component: AuthPage,
});

const PENDING_AVATAR_KEY = "pending-signup-avatar";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [petName, setPetName] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [guestRestoring, setGuestRestoring] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [overwriteBusy, setOverwriteBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<"signup" | "signin" | "guest" | null>(null);
  const [overwriteSource, setOverwriteSource] = useState<"guestPrompt" | "form" | null>(null);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const deleteGuestFn = useServerFn(deleteGuestAccount);

  useEffect(() => {
    if (loadGuestSession()) setGuestPromptOpen(true);
  }, []);

  async function continueAsGuest() {
    const cache = loadGuestSession();
    if (!cache) { setGuestPromptOpen(false); return; }
    setGuestRestoring(true);
    try {
      // 先清掉任何残留的本地会话，避免和旧 sb-* 缓存冲突
      clearSupabaseLocalAuth();
      // 直接用 refresh_token 换取新 session（access_token 1 小时已过期，setSession 不会自动刷新匿名 token）
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: cache.refresh_token,
      });
      if (error || !data.session) throw error ?? new Error("no session");
      saveGuestSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.session.user.id,
      });
      toast.success("已恢复上次游客身份");
      setGuestPromptOpen(false);
      nav({ to: "/pet" });
    } catch (err: any) {
      console.warn("restore guest failed", err);
      clearGuestSession();
      toast.error("游客身份已失效，请新建账号");
      setGuestPromptOpen(false);
    } finally {
      setGuestRestoring(false);
    }
  }

  function declineGuest() {
    // 「新建账号」= 覆盖旧游客并以新游客身份直接入山
    setGuestPromptOpen(false);
    setPendingAction("guest");
    setOverwriteSource("guestPrompt");
    setOverwriteOpen(true);
  }

  function pickAvatar(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("头像不可超过 3MB");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar(userId: string): Promise<string | null> {
    if (!avatarFile) return null;
    const ext = avatarFile.name.split(".").pop() || "png";
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
    if (error) {
      toast.error("头像上传失败：" + error.message);
      return null;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function resendVerifyEmail() {
    if (!pendingVerifyEmail) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerifyEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      toast.success("入山令已重发，请查收邮件");
    } catch (err: any) {
      toast.error(err?.message || "重发失败");
    } finally {
      setResending(false);
    }
  }

  async function guestLogin() {
    if (loadGuestSession()) {
      setGuestPromptOpen(true);
      return;
    }
    await doGuestLogin();
  }

  async function doGuestLogin() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInAnonymously({
        options: { data: { is_guest: true } },
      });
      if (error) throw error;
      if (data.user) {
        const url = await uploadAvatar(data.user.id);
        if (url) {
          await supabase.from("profiles").update({ avatar_url: url }).eq("id", data.user.id);
        }
      }
      if (data.session) {
        saveGuestSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user_id: data.session.user.id,
        });
        // 确认浏览器 supabase 客户端已持有新会话，避免跳转后被保护页判定为未登录
        try {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        } catch (e) {
          console.warn("setSession after guest signup failed", e);
        }
      }
      toast.success("已以游客身份入山，30 天未登录将自动消散");
      nav({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message || "游客登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // 若仍有上次的游客缓存，先弹覆盖确认
    if (loadGuestSession()) {
      setPendingAction(mode === "signup" ? "signup" : "signin");
      setOverwriteSource("form");
      setOverwriteOpen(true);
      return;
    }
    await doSubmit();
  }

  async function doSubmit() {
    setLoading(true);
    try {
      if (mode === "signup") {
        const finalPetName = petName.trim() || randomBeast();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              display_name: displayName || email.split("@")[0],
              pet_name: finalPetName,
            },
          },
        });
        if (error) throw error;
        // Supabase 邮箱枚举保护：重复注册返回空 identities
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          toast.error("该邮箱已注册，请直接登录");
          setMode("signin");
          return;
        }
        // 邮箱必须验证：此时 data.session 为 null。把头像暂存，等验证回调再上传。
        if (avatarFile) {
          try {
            const dataUrl = await fileToDataUrl(avatarFile);
            sessionStorage.setItem(
              PENDING_AVATAR_KEY,
              JSON.stringify({ name: avatarFile.name, type: avatarFile.type, dataUrl }),
            );
          } catch (err) {
            console.warn("stash avatar failed", err);
          }
        }
        setPendingVerifyEmail(email);
        toast.success("神谕已发出，请到邮箱点击『入山令』完成结契");
      } else {
        // 切回邮箱账号前先清掉残留匿名 session
        clearSupabaseLocalAuth();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (/email not confirmed/i.test(error.message)) {
            setPendingVerifyEmail(email);
            toast.error("邮箱尚未验证，请先在邮件中点击『入山令』");
            return;
          }
          if (/invalid login credentials/i.test(error.message)) {
            toast.error("该账号尚未注册或密码有误，请先结契");
            setMode("signup");
            return;
          }
          throw error;
        }
        if (data.user && avatarFile) {
          const url = await uploadAvatar(data.user.id);
          if (url) {
            await supabase.from("profiles").update({ avatar_url: url }).eq("id", data.user.id);
          }
        }
        nav({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message || "出错了");
    } finally {
      setLoading(false);
    }
  }

  function cancelOverwrite() {
    setOverwriteOpen(false);
    setPendingAction(null);
    // 仅当用户来自「检测到上次游客身份」对话框时，才重新弹出「继续 / 新建」选择
    // 让其有机会改选「继续游客」回到旧账号；其他来源（表单/游客入山）则单纯关闭，避免循环
    const source = overwriteSource;
    setOverwriteSource(null);
    if (source === "guestPrompt" && loadGuestSession()) {
      setGuestPromptOpen(true);
    }
  }

  async function confirmOverwrite() {
    const cache = loadGuestSession();
    if (!cache) {
      // 缓存不在了，直接继续
      const action = pendingAction;
      setOverwriteOpen(false);
      setPendingAction(null);
      if (action === "guest") await doGuestLogin();
      else if (action === "signup" || action === "signin") await doSubmit();
      return;
    }
    setOverwriteBusy(true);
    try {
      await deleteGuestFn({
        data: { user_id: cache.user_id, refresh_token: cache.refresh_token },
      });
      clearGuestSession();
      clearSupabaseLocalAuth();
      toast.success("旧游客账号已消散");
      const action = pendingAction;
      setOverwriteOpen(false);
      setPendingAction(null);
      if (action === "guest") await doGuestLogin();
      else if (action === "signup" || action === "signin") await doSubmit();
    } catch (err: any) {
      toast.error(err?.message || "删除旧游客失败");
    } finally {
      setOverwriteBusy(false);
    }
  }

  return (
    <>
    <div className="container mx-auto px-4 py-16 max-w-md">
      <div className="ink-card rounded-2xl p-8">
        {pendingVerifyEmail && (
          <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-loose">
            <div className="font-display tracking-widest mb-1">神 谕 待 启</div>
            <p className="text-muted-foreground">
              已发往 <span className="text-foreground">{pendingVerifyEmail}</span>，请到邮箱点击「入山令」完成验证。验证后会自动入山。
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resendVerifyEmail}
                disabled={resending}
                className="font-display tracking-widest"
              >
                {resending ? "重发中…" : "重 发 邮 件"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPendingVerifyEmail(null)}
                className="font-display tracking-widest"
              >
                关 闭
              </Button>
            </div>
          </div>
        )}
        <div className="text-center mb-6">
          <div className="seal inline-block text-2xl mb-3">{mode === "signup" ? "招" : "归"}</div>
          <h1 className="font-display text-3xl tracking-widest">
            {mode === "signup" ? "招神入册" : "复归山门"}
          </h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-20 w-20 rounded-full border-2 border-dashed border-foreground/30 overflow-hidden flex items-center justify-center bg-background/40 hover:border-primary transition-colors"
              aria-label="上传头像"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="头像预览" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground tracking-widest">上传头像</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
            />
            <span className="text-[11px] text-muted-foreground tracking-widest">可选 · 不超过 3MB</span>
          </div>
          {mode === "signup" && (
            <>
              <div>
                <Label className="font-display tracking-widest">道号 / 玩家ID（最多 6 字，留空随机）</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 6))}
                  maxLength={6}
                  placeholder="例：青衫客"
                />
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
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-primary tracking-widest"
        >
          {mode === "signup" ? "已有道号？复归山门" : "尚未结契？招神入册"}
        </button>
        <div className="mt-4 pt-4 border-t border-border/40">
          <Button
            type="button"
            variant="secondary"
            onClick={guestLogin}
            disabled={loading}
            className="w-full font-display tracking-widest"
          >
            游客入山 · 免注册体验
          </Button>
          <p className="text-[11px] text-muted-foreground text-center mt-2 tracking-widest">
            连续 30 日未归山，游客数据将自行消散
          </p>
        </div>
      </div>
    </div>

    <Dialog open={guestPromptOpen} onOpenChange={(o) => { if (!o) setGuestPromptOpen(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display tracking-widest text-center">
            检 测 到 上 次 游 客 身 份
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center leading-loose">
          上次你以游客身份入山，异兽与修行数据仍在。<br />
          要继续上次的游客身份，还是新建一个账号？
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={declineGuest}
            disabled={guestRestoring}
            className="font-display tracking-widest flex-1"
          >
            新 建 账 号
          </Button>
          <Button
            onClick={continueAsGuest}
            disabled={guestRestoring}
            className="font-display tracking-widest flex-1"
          >
            {guestRestoring ? "复归中…" : "继 续 游 客"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={overwriteOpen} onOpenChange={(o) => { if (!o && !overwriteBusy) cancelOverwrite(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display tracking-widest text-center">
            覆 盖 旧 游 客 账 号 ？
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center leading-loose">
          上次的游客异兽与修行数据将被永久消散，<br />
          榜单与好友列表中也不再出现，无法找回。<br />
          是否继续？
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={cancelOverwrite}
            disabled={overwriteBusy}
            className="font-display tracking-widest flex-1"
          >
            否
          </Button>
          <Button
            onClick={confirmOverwrite}
            disabled={overwriteBusy}
            className="font-display tracking-widest flex-1"
          >
            {overwriteBusy ? "消散中…" : "是 · 覆 盖"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
