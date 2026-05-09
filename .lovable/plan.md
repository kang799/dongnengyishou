## 目标
用上传图中的三幅水墨 logo（速度=凤、体质=龙、力量=拳）替换训练页和欢迎走马灯里那三个红色「速 / 力 / 体」字。

## 步骤
1. 将上传的合成图按 1/3 等宽切成三张 PNG，保存到：
   - `src/assets/icon-speed.png`（左：凤 · 速度）
   - `src/assets/icon-vitality.png`（中：龙 · 体质）
   - `src/assets/icon-strength.png`（右：拳 · 力量）
   切割用 Python/PIL 在 `code--exec` 里跑，输出后用 `code--view` 目检三张图都没截偏。

2. 修改 `src/routes/train.tsx`：
   - 在顶部 `import` 三张图片资源。
   - 把 `EXERCISES` 里的 `kanji` 字段换成对应图片（或新增 `icon` 字段）。
   - 把渲染处的 `<span className="font-display text-5xl text-primary">{e.kanji}</span>` 改成 `<img src={e.icon} alt={e.title} className="w-16 h-16 object-contain shrink-0" />`，保持原卡片布局不变。

3. 修改 `src/components/onboarding/WelcomeCarousel.tsx` 第二卷里那个 3 列「速 / 力 / 体」预览：
   - 同样导入三张图，把每个格子里的大字 `{x.k}` 换成对应的 `<img>`，下面的「深蹲 / 俯卧撑 / 仰卧起坐」小标题保留。
   - 注意顺序：欢迎页当前顺序是 速→力→体，需要按训练动作含义对应到 速度图 / 力量图 / 体质图，不要错位。

4. 不动 `pet.tsx`、数据库、登录流程；仅替换这两处的视觉元素。

## 不改动
- 配色 token、字体、其他文案。
- 路由、认证、覆盖游客流程。
- 原图本身，只生成切片副本到 `src/assets/`。
