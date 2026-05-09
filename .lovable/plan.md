## 新手强引导方案

让首次进入的玩家用 90 秒就明白「这是什么、要做什么、第一步去哪」，并通过强制完成 1 次深蹲来真正上手。

### 一、全屏开场轮播（首登/未完成时弹出）

登录后若 `profiles.onboarded_at` 为空，则以全屏对话框展示 4 页轮播，可左右翻页、底部圆点指示，右上角「跳过」：

1. **世界观** — 大图 + 「以汗水唤醒山海异兽」一句话
2. **三式修行** — 速/力/体三个汉字大字 + 对应动作（深蹲/俯卧撑/仰卧起坐）
3. **进化破壳** — 三脉满 10/100/1000… 阶位图
4. **封神榜与斗友** — 战力榜+道友切磋；底部 CTA「开 始 第 一 课」直达 `/train` 并自动选中深蹲

### 二、分步遮罩教程（spotlight）

开场结束后自动进入。半透黑遮罩 + 镂空高亮目标元素 + 气泡说明，用户必须按提示点击才能前进；右上角「跳过引导」永久关闭。

| 步 | 路由 | 高亮元素 | 提示文案 |
|---|---|---|---|
| 1 | /pet | 异兽肖像区 | 「这是你的异兽。三脉真气满即可破壳进化。」 |
| 2 | /pet | 三脉真气进度条 | 「力·速·体三条进度，每做一次动作 +1。」 |
| 3 | /pet | 「前往修行」按钮 | 「点此开始第一次修行。」 |
| 4 | /train | 「深蹲」卡片 | 「先选深蹲，炼速度。」 |
| 5 | /train | 「开始」按钮 | 「打开摄像头，做 1 个深蹲即可解锁全部殿堂。」 |
| 6 | /train | 计数器 | 完成 1 rep 后弹「✓ 入门已成」庆祝动画 → 写入 `onboarded_at` → 解锁所有页面 |

### 三、首训任务锁

未完成首训前：

- 顶部全宽**任务条**（红章风）：`新手任务 · 完成 1 次深蹲（0/1）`，固定显示在 SiteHeader 下方
- `/arena`、`/friends`、`/leaderboards` 入口在导航中**置灰禁用**，鼠标悬停提示「需先完成新手修行」；直接访问 URL 时跳回 `/pet` 并 toast 提示
- `/pet`、`/train` 全程可用

### 四、完成判定与持久化

- 新增 `profiles.onboarded_at timestamptz`（migration）
- `/train` 在累计 reps 落库成功且为新手时，调用 `profiles.update({ onboarded_at: now() })`
- 全局 `useOnboarding()` hook 读取该字段，统一控制开场弹窗、遮罩、任务条与导航锁
- 用户头像菜单加「重看新手指引」入口（清空 `onboarded_at`）

### 技术实现要点

- 新增 `src/components/onboarding/`：`WelcomeCarousel.tsx`、`SpotlightTour.tsx`、`OnboardingTaskBar.tsx`、`useOnboarding.ts`
- Spotlight：用 `getBoundingClientRect()` 计算 4 段矩形 mask，避免引入新依赖；目标元素用 `data-tour="pet-portrait"` 等属性标记
- SiteHeader：根据 `onboarded_at` 为导航 `<Link>` 加 `aria-disabled` 与 `pointer-events-none` 样式
- 路由守卫：在 `/arena` `/friends` `/leaderboards` 的 component 顶部判断未完成则 `nav({to:'/pet'})`
- 数据库迁移仅加一列，无破坏性变更

### 文件改动清单

- 新增：`src/components/onboarding/{WelcomeCarousel,SpotlightTour,OnboardingTaskBar}.tsx`、`src/hooks/use-onboarding.ts`
- 修改：`src/routes/__root.tsx`（挂载引导层）、`src/components/site-header.tsx`（导航锁+重看入口）、`src/routes/pet.tsx`（data-tour 标记）、`src/routes/train.tsx`（data-tour 标记 + 完成回写 onboarded_at）、`src/routes/arena.tsx` `/friends.tsx` `/leaderboards.tsx`（路由守卫）
- 迁移：`profiles` 增加 `onboarded_at` 列