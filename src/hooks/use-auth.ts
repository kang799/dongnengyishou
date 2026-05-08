import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // 异步更新最后活跃时间，失败不影响登录
        void supabase
          .from("profiles")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", s.user.id);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        void supabase
          .from("profiles")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", data.session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
