import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import heroBeast from "@/assets/hero-kinetic-beast.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "动能异兽 · 用汗水唤醒山海经神兽" },
      { name: "description", content: "深蹲、俯卧撑、仰卧起坐喂养你的异兽，争夺三大封神榜。" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const handleStart = async () => {
    if (loading) return;
    if (user) {
      navigate({ to: "/pet" });
      return;
    }
    // 兜底：再查一次实时会话，避免 hook 状态滞后
    const { data } = await supabase.auth.getSession();
    navigate({ to: data.session ? "/pet" : "/auth" });
  };

  return (
    <div className="relative">
      {/* Hero — 关键信息前置 */}
      <section className="container mx-auto px-6 pt-8 pb-12">
        <div className="relative rounded-3xl overflow-hidden border border-foreground/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
          {/* 背景图：水墨异兽 */}
          <img
            src={heroBeast}
            alt="动能异兽 Kinetic Beast"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* 暗角与底部渐隐 */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/80 to-transparent" />

          <div className="relative px-6 md:px-12 pt-[55vw] sm:pt-[42vw] md:pt-[28vw] lg:pt-[22vw] pb-10 md:pb-14">
            <div className="absolute top-6 right-6 seal text-xs tracking-widest">·甲辰·</div>
            <div className="max-w-2xl space-y-5">
              <div className="text-[11px] font-display tracking-[0.6em] text-primary/90">江 湖 健 身 录</div>
              <p className="text-base md:text-lg text-foreground/85 leading-loose font-display tracking-wider">
                每一次心跳，都是它的心跳。
              </p>
              <p className="text-sm md:text-base text-foreground/65 leading-loose max-w-xl">
                开摄像头，深蹲炼速 · 俯卧撑炼力 · 仰卧起坐炼体。<br/>
                三脉真气满，山海异兽破壳进化，登顶封神榜。
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
              <Button
                size="lg"
                onClick={handleStart}
                disabled={loading}
                className="text-lg px-10 font-display tracking-[0.3em]"
              >
                {loading ? "载 入 中…" : user ? "回到山门" : "开 始 游 戏"}
              </Button>
              <Link to="/leaderboards">
                <Button size="lg" variant="outline" className="text-lg px-8 font-display tracking-[0.3em]">
                  观封神榜
                </Button>
              </Link>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-6 max-w-md">
                <Stat label="异兽种数" value="60+" />
                <Stat label="进化阶位" value="6" />
                <Stat label="封神榜单" value="3" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 三式修行 — 关键玩法 */}
      <section className="container mx-auto px-6 pb-12">
        <div className="flex items-end justify-between mb-6 px-2">
          <div>
            <h2 className="font-display text-3xl">三式修行</h2>
            <p className="text-sm text-muted-foreground tracking-widest mt-1">真气三脉 · 缺一不可</p>
          </div>
          <div className="hidden md:block text-xs font-display tracking-[0.4em] text-muted-foreground">·摄像头自动计数·</div>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <Way kanji="速" title="深蹲" desc="炼速度 · 闪避更高" stat="+1 速 / 次" />
          <Way kanji="力" title="俯卧撑" desc="炼力量 · 伤害更高" stat="+1 力 / 次" />
          <Way kanji="体" title="仰卧起坐" desc="炼体质 · 血量更厚" stat="+1 体 / 次" />
        </div>
      </section>

      {/* 四殿 */}
      <section className="container mx-auto px-6 pb-12">
        <div className="px-2 mb-6">
          <h2 className="font-display text-3xl">四殿可游</h2>
          <p className="text-sm text-muted-foreground tracking-widest mt-1">异兽 · 修行 · 斗兽 · 封神</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Hall kanji="兽" title="我的异兽" desc="属性 · 阶位 · 战绩" />
          <Hall kanji="练" title="修行" desc="开摄像头喂养真气" />
          <Hall kanji="斗" title="斗兽 · 道友" desc="自动回合切磋" />
          <Hall kanji="榜" title="封神榜" desc="属性 / 战力 / 打卡" />
        </div>
      </section>

      {/* 进化之道 */}
      <section className="container mx-auto px-6 pb-20">
        <div className="px-2 mb-6">
          <h2 className="font-display text-3xl">进化之道</h2>
          <p className="text-sm text-muted-foreground tracking-widest mt-1">三脉满盈 · 破壳化形</p>
        </div>
        <div className="ink-card rounded-2xl p-6 md:p-8">
          <ol className="grid md:grid-cols-2 gap-x-10 gap-y-3 font-display tracking-wider text-base md:text-lg">
            <li><span className="seal mr-3">壹</span>各满 <b className="text-primary">10</b> · 化形异兽</li>
            <li><span className="seal mr-3">贰</span>各满 <b className="text-primary">100</b> · 通灵神兽</li>
            <li><span className="seal mr-3">叁</span>各满 <b className="text-primary">1000</b> · 上古凶兽</li>
            <li><span className="seal mr-3">肆</span>各满 <b className="text-primary">10000</b> · 天地圣兽</li>
            <li><span className="seal mr-3">伍</span>各满 <b className="text-primary">100000</b> · 鸿蒙创世</li>
          </ol>
          <div className="text-center mt-8">
            <Button
              size="lg"
              onClick={handleStart}
              disabled={loading}
              className="font-display tracking-[0.4em] px-12"
            >
              {loading ? "载 入 中…" : "开 始 游 戏"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-primary/40 pl-3">
      <div className="font-display text-2xl text-primary leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground tracking-widest mt-1">{label}</div>
    </div>
  );
}

function Way({ kanji, title, desc, stat }: { kanji: string; title: string; desc: string; stat: string }) {
  return (
    <div className="ink-card rounded-2xl p-6 flex items-center gap-5 group hover:-translate-y-1 transition-transform">
      <div className="font-display text-6xl text-primary/80 group-hover:text-primary transition-colors leading-none">
        {kanji}
      </div>
      <div className="flex-1">
        <h3 className="font-display text-xl mb-1 tracking-widest">{title}</h3>
        <p className="text-muted-foreground text-sm mb-2">{desc}</p>
        <span className="seal inline-block text-xs">{stat}</span>
      </div>
    </div>
  );
}

function Hall({ kanji, title, desc }: { kanji: string; title: string; desc: string }) {
  return (
    <div className="ink-card rounded-2xl p-5 text-center hover:-translate-y-1 transition-transform">
      <div className="font-display text-4xl text-primary/80 mb-2">{kanji}</div>
      <h3 className="font-display text-lg tracking-widest">{title}</h3>
      <p className="text-muted-foreground text-xs mt-1">{desc}</p>
    </div>
  );
}
