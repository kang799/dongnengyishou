import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "异兽录 · 用汗水唤醒山海经神兽" },
      { name: "description", content: "深蹲、俯卧撑、仰卧起坐喂养你的异兽，争夺三大封神榜。" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && user) nav({ to: "/pet" });
  }, [user, loading, nav]);

  return (
    <div className="relative">
      <section className="container mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 text-sm font-display tracking-[0.4em] text-primary">
            · 山 海 健 身 ·
          </div>
          <h1 className="font-display text-6xl md:text-7xl leading-tight">
            以汗水<br />唤醒<span className="text-primary">异兽</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md leading-loose">
            开启摄像头，每一个深蹲、俯卧撑、仰卧起坐都化作真气，
            注入你从《山海经》中召唤的异兽。属性满盈，便可破壳进化，
            登顶三大封神榜。
          </p>
          <div className="flex gap-4">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8 font-display tracking-widest">
                招神入册
              </Button>
            </Link>
            <Link to="/leaderboards">
              <Button size="lg" variant="outline" className="text-lg px-8 font-display tracking-widest">
                观封神榜
              </Button>
            </Link>
          </div>
          <div className="flex gap-8 pt-6 text-sm">
            <Stat label="异兽种数" value="60+" />
            <Stat label="进化阶位" value="6" />
            <Stat label="封神榜单" value="3" />
          </div>
        </div>
        <div className="relative aspect-square">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 via-accent/20 to-transparent blur-3xl" />
          <div className="ink-card relative h-full rounded-3xl flex items-center justify-center overflow-hidden">
            <div className="absolute top-6 left-6 seal">朱砂封印</div>
            <div className="text-center space-y-4">
              <div className="font-display text-[10rem] leading-none text-primary/80 select-none">兽</div>
              <div className="font-display tracking-[0.5em] text-muted-foreground">异兽待主</div>
            </div>
            <div className="absolute bottom-6 right-6 text-xs font-display tracking-widest text-muted-foreground">
              ·甲辰· 异兽录
            </div>
          </div>
        </div>
      </section>

      <div className="ink-divider container mx-auto" />

      <section className="container mx-auto px-6 py-20">
        <h2 className="font-display text-4xl text-center mb-2">三式修行</h2>
        <p className="text-center text-muted-foreground mb-12 tracking-widest">真气三脉，缺一不可</p>
        <div className="grid md:grid-cols-3 gap-6">
          <Way kanji="速" title="深蹲" desc="炼速度，提升异兽闪避" stat="+1 速度 / 次" />
          <Way kanji="力" title="俯卧撑" desc="炼力量，提升异兽攻击" stat="+1 力量 / 次" />
          <Way kanji="体" title="仰卧起坐" desc="炼体质，提升异兽生命" stat="+1 体质 / 次" />
        </div>
      </section>

      <section className="container mx-auto px-6 py-20">
        <h2 className="font-display text-4xl text-center mb-12">进化之道</h2>
        <div className="ink-card rounded-2xl p-8 max-w-3xl mx-auto">
          <ol className="space-y-4 font-display tracking-wider text-lg">
            <li><span className="seal mr-3">壹</span>三属性各满 <b className="text-primary">10</b> · 化形异兽</li>
            <li><span className="seal mr-3">贰</span>三属性各满 <b className="text-primary">100</b> · 通灵神兽</li>
            <li><span className="seal mr-3">叁</span>三属性各满 <b className="text-primary">1000</b> · 上古凶兽</li>
            <li><span className="seal mr-3">肆</span>三属性各满 <b className="text-primary">10000</b> · 天地圣兽</li>
            <li><span className="seal mr-3">伍</span>三属性各满 <b className="text-primary">100000</b> · 鸿蒙创世</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-3xl text-primary">{value}</div>
      <div className="text-xs text-muted-foreground tracking-widest mt-1">{label}</div>
    </div>
  );
}

function Way({ kanji, title, desc, stat }: { kanji: string; title: string; desc: string; stat: string }) {
  return (
    <div className="ink-card rounded-2xl p-8 text-center group hover:-translate-y-1 transition-transform">
      <div className="font-display text-7xl text-primary/80 mb-4 group-hover:text-primary transition-colors">{kanji}</div>
      <h3 className="font-display text-2xl mb-2 tracking-widest">{title}</h3>
      <p className="text-muted-foreground text-sm mb-4">{desc}</p>
      <div className="seal inline-block text-sm">{stat}</div>
    </div>
  );
}
