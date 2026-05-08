import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/pet", label: "我的异兽" },
  { to: "/train", label: "修行" },
  { to: "/arena", label: "斗兽台" },
  { to: "/friends", label: "道友" },
  { to: "/leaderboards", label: "封神榜" },
] as const;

export function SiteHeader() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const onAuthPage = loc.pathname === "/" || loc.pathname === "/auth";

  return (
    <header className="border-b border-foreground/15 bg-background/70 backdrop-blur sticky top-0 z-30">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <span className="seal text-xl">兽</span>
          <span className="font-display text-2xl tracking-[0.25em]">异兽录</span>
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
              <span className="hidden sm:inline text-sm text-muted-foreground font-display">
                {user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await supabase.auth.signOut();
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
    </header>
  );
}
