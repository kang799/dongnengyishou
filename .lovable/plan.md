## 目标
为《山海经》60 种异兽各生成一张水墨白描透明 PNG logo，并在「我的异兽」页中央与「封神榜」每行展示。

## 资源生成
- 使用 `imagegen--generate_image`（fast 档，透明背景 PNG，512×512）批量生成 60 张图。
- 风格 prompt 模板（与现有 `icon-speed/strength/vitality` 一致）：
  > Traditional Chinese ink wash line drawing of the mythical beast 「{name}」 from Shan Hai Jing, sumi-e baimiao style, single black brush strokes, minimal, centered, on a solid white background, no text
- 文件命名：`src/assets/beasts/{slug}.png`，slug 使用拼音化简（如 `taotie.png`）。

## 索引模块
新建 `src/lib/beast-icons.ts`：
- 使用 Vite `import.meta.glob('../assets/beasts/*.png', { eager: true, as: 'url' })` 自动收集所有图。
- 导出 `getBeastIcon(species: string): string | null`，按中文名 → slug 映射查表；找不到时返回 `null`。

## 页面接入
1. **`src/routes/pet.tsx`** —— 中央圆形里的大「兽」字替换为 `<img src={getBeastIcon(pet.species)}>`，保留圆形渐变与光晕背景；找不到图时回落到原「兽」字。
2. **`src/routes/leaderboards.tsx`** —— 在每行 `名字 · 道友` 左侧加一个 40×40 圆形头像 `<img>`，使用 `getBeastIcon(r.species)`；同样回落到「兽」字占位。「我」的高亮行同步加。

## 不改动
- 数据库、RLS、`beasts.ts` 名录、其他页面、配色与字体均保持不变。
- 首页「三式修行」「四殿」、训练页、引导轮播保持当前形态。

## 技术细节
- 60 张图生成耗时较长，将串行调用以避免速率限制；预计约 5–10 分钟。
- 图片体积控制：512×512 透明 PNG，预计每张 < 80KB，总量约 3–5MB，由 Vite 按需打包/懒加载。
- slug 映射表内置在 `beast-icons.ts` 顶部常量中，便于以后微调。
