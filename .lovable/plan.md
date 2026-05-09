## 目标

1. 修复新手教程结束时的卡顿
2. 删除右上角常驻"指引"入口；新手引导只在首次登录时弹一次
3. 重写引导内容，覆盖封神榜、切磋等核心玩法
4. 把"斗兽台"从导航撤掉，把"切磋"按钮直接放进封神榜每行旁

---

## 一、卡顿根因（已定位）

`src/components/onboarding/SpotlightTour.tsx`：
- 用 `requestAnimationFrame` 无限循环每帧读取 `getBoundingClientRect()` 并 `setRect`，造成持续 60fps 重渲染整棵覆盖层。
- 第二个 `useEffect` 依赖 `rect`，每帧 `addEventListener/removeEventListener`，进一步放大开销。
- 在 `/train` 页时，MediaPipe 姿态识别本身就吃 CPU，叠加上述循环 → 完成深蹲触发 `markOnboarded` 时，state 变更与 toast 同时进行，掉帧最明显。

修复方案：彻底删除 `SpotlightTour`（见第三节）；卡顿源随之消失。同时把"完成 1 次深蹲才解锁"的强制门槛去掉——既然不再有分步指引，就不再需要锁定其他页面。

---

## 二、删除项

- 删除文件 `src/components/onboarding/SpotlightTour.tsx`
- 删除文件 `src/components/onboarding/OnboardingTaskBar.tsx`
- `src/routes/__root.tsx`：移除上述两个组件的 import 与 JSX 引用
- `src/components/site-header.tsx`：
  - 删除右上角"指引"按钮以及 `restart` 调用
  - 移除 `NAV` 中的 `needsOnboard` 锁定逻辑（因为不再有分步引导，且斗兽台要从导航中去掉）
- `src/routes/train.tsx`：移除 `markOnboarded` 在完成深蹲时的调用与 toast"全部殿堂已解锁"
- `src/routes/leaderboards.tsx`、`src/routes/arena.tsx`：去掉 "未完成新手 → 跳回 /pet" 的拦截

`onboarded_at` 字段保留（用来判断"是否已经看过开场卷轴"，避免每次登录都弹）。

---

## 三、新手引导：仅首次登录弹一次卷轴

保留并扩写 `WelcomeCarousel`，把"看完即结束"作为唯一引导方式。

在 `OnboardingProvider` 中：当 `WelcomeCarousel` 关闭（无论"开始游戏"还是"跳过"），直接调用 `markOnboarded()` 写入 `profiles.onboarded_at`，下次登录不再弹。

`WelcomeCarousel` 改为 5 卷，覆盖核心玩法：

1. **壹 · 异兽降世** — "你结契一只山海经异兽，每一次心跳都是它的心跳"
2. **贰 · 三式修行** — 深蹲炼速 / 俯卧撑炼力 / 仰卧起坐炼体；摄像头自动计数
3. **叁 · 破壳进化** — 三脉真气满 10/100/1000/10000/100000 阶位飞升
4. **肆 · 封神榜** — 属性榜 · 战力榜 · 打卡榜，全服争锋
5. **伍 · 道友切磋** — 在封神榜任意行点"切磋"即可挑战该道友，胜则取代其战力榜排名

最后一卷按钮文案改为 **"入山修行"**，点击后关闭弹窗 → 跳转 `/pet`，不再启动 SpotlightTour。

---

## 四、导航与切磋入口

`src/components/site-header.tsx` 的 `NAV` 改为 4 项：
```
我的异兽 · 修行 · 道友 · 封神榜
```
（移除 `斗兽台`）

`/arena` 路由保留，但只能通过封神榜的"切磋"按钮进入，使用 search param 携带对手 user_id：
- 跳转：`nav({ to: '/arena', search: { vs: targetUserId } })`
- `/arena` 读取 `vs` search param：若存在，加载完自动选中该对手并显示在挑战卡片首位（或直接弹出 VS 卡）。

`src/routes/leaderboards.tsx` 改动：
- 每行（除自己外）追加一个 **"切磋"** 按钮，朱红墨块风格，调用 `nav({ to: '/arena', search: { vs: row.user_id }})`
- 三个榜单（属性 / 战力 / 打卡）都展示该按钮
- 移除新手拦截逻辑

`src/routes/arena.tsx` 改动：
- 顶部不再展示候选对手列表的 20 人（或保留为"近邻对手"的次要区块），主区改为：当 `vs` 存在 → 立即展示与该对手的 VS 卡和「开始切磋」按钮
- 仍允许从候选列表里点 `挑战`，逻辑不变

---

## 五、技术细节

- `OnboardingProvider`：`closeWelcome` 内部触发 `markOnboarded()`；删除 `tourStep` / `startTour` / `nextStep` / `setTourStep` 相关字段（同时清理使用方）。
- `markOnboarded` 失败时不阻塞用户，仅 console.warn。
- `WelcomeCarousel` 视觉沿用现有水墨朋克风（`ink-card`、`seal`、朱红主色），新增的"封神榜""切磋"两卷用极简符号：朱印「榜」「斗」+ 三行说明。
- `arena` 的 search 校验：使用 zod `{ vs: z.string().uuid().optional() }`，并在 `validateSearch` 中处理。

---

## 验证

- 首次登录：自动弹 5 卷卷轴；关闭后 `profiles.onboarded_at` 写入；刷新不再弹。
- 在 `/train` 完成深蹲：不再触发 markOnboarded、不再 toast "解锁殿堂"；帧率应明显回升。
- 顶部导航：4 项，无"斗兽台"，无"指引"按钮。
- 封神榜：每行有"切磋"按钮；点击跳到 `/arena?vs=<id>` 并立即看到 VS 卡。
- 旧用户（已有 onboarded_at）：行为不变，无弹窗、无锁定。
