# 水墨朋克 · 全站 UI 重构方案

将现有"暗红水墨"基调，进一步推向极简、宣纸、墨色为主，朱砂为唯一爆发色的「水墨朋克」语言。所有改动只触及前端样式与表现层，不动业务逻辑、数据库、路由结构。

## 一、设计令牌（src/styles.css）

把当前偏暖橙的暗底，重写为「宣纸 / 烟墨 / 朱砂」三色体系：

- `--background`：暖白宣纸 `oklch(0.93 0.012 85)`（默认改为亮色基调，更贴近"铺开的巨幅宣纸"）
- `--foreground`：浓墨黑 `oklch(0.18 0.008 60)`
- `--card`：米白宣纸 `oklch(0.96 0.008 85)`
- `--muted-foreground`：淡墨灰 `oklch(0.45 0.01 60)`
- `--border`：飞白灰 `oklch(0.78 0.01 60)`
- `--primary`：朱砂 `oklch(0.55 0.21 28)`（保留，加强为唯一爆发色）
- 移除蓝紫 `--secondary` 蓝调，改成深墨 `oklch(0.25 0.01 60)`
- 新增：
  - `--ink-wash`：墨水晕染渐变（用于按钮、进度条填充）
  - `--paper-grain`：宣纸纹理 SVG（用更明显的米黄棉麻颗粒）
  - `--brush-stroke`：飞白笔触 SVG（按钮边缘 / 标题下划线）
  - `--shadow-ink-blot`：墨滴软阴影 `0 8px 24px -8px oklch(0.18 0.01 60 / 0.35)`

`body` 背景重写：去掉红蓝双晕，改为单色宣纸 + 极淡墨雾 + 加重的颗粒纹理。

`.dark` 模式可保留现暗色作为夜读模式，不强制启用。

## 二、组件级表现层

### 1. 按钮 `src/components/ui/button.tsx`
- 默认 variant 改为「凝固墨块」：
  - 背景：`--foreground`（浓墨）
  - 文字：`--background`（宣纸）
  - 边缘：mask-image 飞白 SVG，使按钮左右边沿带墨笔扫尾
  - hover：朱砂浮印（`box-shadow: inset 0 0 0 2px var(--primary)`）
  - active：墨溅 keyframe（伪元素喷出 4–6 滴小圆点，`splash` 动画 400ms）
- 新增 variant `cinnabar`：朱砂印章风（实心朱砂 + 宣纸字）
- 新增 variant `ghost-ink`：透明 + 飞白下划线

### 2. 卡片 `.ink-card`（styles.css）
- 改为宣纸亮底 + 加深颗粒纹理
- `::before` 双线边框改为单条 1px 飞白
- 新增 `::after`：右下角小朱砂印泥（伪元素圆形 6×6，朱砂色，模拟落款）

### 3. 印章 `.seal`
- 保留朱砂底，但加 `clip-path` 不规则四边形 + 更明显的"湿润边缘"（filter: url(#ink-bleed) 引用全局 SVG filter）

### 4. 进度条 `.ink-progress`（新增）
- 用于属性条/真气条
- 灰墨底槽，填充层用墨水晕染渐变 `linear-gradient(90deg, transparent, var(--foreground) 20%, var(--foreground))`
- 末端 `::after` 朱砂墨滴（`radial-gradient` 圆点 + 轻微 `filter: blur`）
- 替换 `/pet`、`/train`、`/arena` 中现有 `<Progress>` / 自定义条

### 5. 标题
- 新增 `.title-brush`：标题下方贴一个 SVG 飞白横扫笔触（180×12），位置居左
- `/pet`、`/train`、`/arena`、`/leaderboards`、`/friends` 五个页面 H1 全部套用

## 三、动效

新增到 `styles.css` `@layer utilities`：

- `@keyframes ink-bleed`：scale(0.6)+blur(8px)+opacity 0 → scale(1)+blur(0)+opacity 1，用于页面切换淡入（套到 `__root.tsx` 的 `<Outlet>` 包装层）
- `@keyframes ink-splash`：按钮 active 喷点（4 个伪元素小圆从中心向外飞溅+渐隐）
- `@keyframes ink-pop`：数据 `+1` 时（套用到 `/train` 计数文字）：scale 0.6→1.4→1，附带朱砂色短暂闪烁
- `@keyframes ink-evolve`：进化时 1.2s 全屏墨爆遮罩（黑墨从中心扩散→朱砂飞溅→消散），用于 `/pet` 进化按钮触发后

页面切换 ink-bleed：在 `__root.tsx` 给 `<Outlet>` 外层套 `key={location.pathname}` + `animate-[ink-bleed_500ms_ease-out]` 的 div。

## 四、字体

- 标题/品牌：保留 Ma Shan Zheng / KaiTi（书法张力）
- 正文/数据：改用 Noto Sans SC（无衬线，清晰），通过 Google Fonts 引入；为数据元素加 `text-shadow: 0 0 0.3px currentColor` 模拟墨水毛边
- 在 `styles.css` 增 `@font-face` Noto Sans SC，并新增 `--font-data` 令牌，正文 `body` 默认改为 Noto Sans SC

## 五、改动文件清单

修改：
- `src/styles.css`（令牌 / 背景 / 卡片 / 印章 / 进度条 / 动画 / 字体）
- `src/components/ui/button.tsx`（墨块 variant + 飞白 + 溅墨）
- `src/components/ui/progress.tsx`（替换为墨水晕染样式）
- `src/routes/__root.tsx`（页面切换 ink-bleed 包装）
- `src/routes/index.tsx`（hero 改为宣纸大留白 + 朱砂落款；移除暗角红蓝晕）
- `src/routes/pet.tsx`（属性条→ink-progress；进化按钮接 ink-evolve 动画）
- `src/routes/train.tsx`（计数 +1 接 ink-pop）
- `src/routes/arena.tsx`、`/leaderboards.tsx`、`/friends.tsx`、`/auth.tsx`（H1 套 title-brush；卡片复查）
- `src/components/site-header.tsx`（导航悬停加飞白下划线）
- `src/components/onboarding/WelcomeCarousel.tsx`、`OnboardingTaskBar.tsx`、`SpotlightTour.tsx`（配合新色板，遮罩从黑改为浓墨）

新增：
- `src/components/ui/ink-progress.tsx`（封装墨水进度条）
- `src/assets/brush-stroke.svg`、`ink-splash.svg`、`paper-grain.svg`（静态资源）

## 六、不变项

- 数据库、RLS、Edge Functions、业务流程、引导逻辑、解锁条件均不修改
- 路由树不变
- 现有图片资源 `hero-kinetic-beast.png` 继续使用（在 hero 中改用 `mix-blend-mode: multiply` 让其与宣纸底融合）

## 七、验证

实现后通过浏览器预览主要五条路径：`/`、`/auth`、`/pet`、`/train`、`/leaderboards`，逐一截图核对：宣纸感、朱砂唯一强调、墨块按钮、飞白标题、墨晕进度条、页面切换墨晕、+1 墨跳。
