import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export const deleteGuestAccount = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        refresh_token: z.string().min(10),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

    // 1) 用 refresh_token 验证它确实属于该 user_id（防止任意删除）
    const anon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: refreshed, error: refreshErr } = await anon.auth.refreshSession({
      refresh_token: data.refresh_token,
    });
    if (refreshErr || !refreshed.session || refreshed.session.user.id !== data.user_id) {
      throw new Error("游客身份校验失败");
    }

    // 2) 确认是游客账号
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, is_guest")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile || !profile.is_guest) {
      throw new Error("仅可删除游客账号");
    }

    // 3) 清理数据
    const uid = data.user_id;
    await supabaseAdmin.from("exercise_logs").delete().eq("user_id", uid);
    await supabaseAdmin
      .from("battles")
      .delete()
      .or(`challenger_id.eq.${uid},defender_id.eq.${uid}`);
    await supabaseAdmin.from("pets").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);

    // 4) 删除 auth.users
    const { error: delUserErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (delUserErr) throw new Error(delUserErr.message);

    return { ok: true };
  });
