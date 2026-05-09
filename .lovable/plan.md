## 目标

1. 把"聚光灯"新手引导加回来（事件驱动版，杜绝之前的卡顿）
2. `pushup` / `situp` 也要有进度条 + 实时文案（与 squat 一致）
3. 游客退出后再回到 `/auth`，弹双选项：「继续上次游客」/「新建账号」

---

## 一、聚光灯引导（性能版）

### 触发
仅首次登录时，`WelcomeCarousel` 关闭后自动启动（旧用户 `onboarded_at` 已写则不触发）。头部不再加"指引"按钮。

### 5 步流程（跨 2 页）
1. `/pet` · 异兽主卡 — "这是与你结契的山海经异兽"
2. `/pet` · 三脉真气面板 — "修行三式可注入对应真气"
3. `/pet` · 顶部导航「修行」 — "点此前往修行"（等用户点击高亮元素）
4. `/train` · 三式选择卡 — "选择今日要练的式样"
5. `/train` · 「启动修行」按钮 — "点此开启摄像头开始修行"（结束）

随时可点右上「跳过」结束。

### 性能要点（避免上一版 60fps rAF 循环）
新建 `src/components/onboarding/SpotlightTour.tsx`：
- 仅在以下事件重算一次目标 `getBoundingClientRect`：
  - 步骤切换 / 路由变更
  - `ResizeObserver`（监听目标元素）
  - `MutationObserver`（监听 `document.body`，subtree+childList）
  - `window` 的 `scroll`（capture, passive）+ `resize`（rAF 节流，下一帧最多算一次）
- 不使用 `setInterval` 与持续 rAF。
- 路由变更后用 `requestIdleCallback`（fallback `setTimeout 80ms`）重试找元素，最多 3 次（共 ~300ms）；找不到就显示无高亮的居中卡片，按钮「下一步」继续。
- 高亮蒙层用 4 块边框 div（top/right/bottom/left）+ 1 个虚线框，避免 SVG mask 在低端机上的合成开销。
- 高亮区域 `pointer-events: none`；当 step 标记 `waitForClick` 时，只在目标 `rect` 范围内允许鼠标事件穿透（再叠一层透明 overlay 留出洞），用户点击目标自然触发原本的导航/按钮。

### Provider 改动
`OnboardingProvider`：
- 新增 `tourActive`、`tourStep`、`startTour`、`nextTourStep`、`endTour`
- `closeWelcome`：写入 `markOnboarded()` → 关闭弹窗 → 调 `startTour()`
- 跳过欢迎卷轴（点右上「跳过」）→ 仅 `markOnboarded()`，不启动 tour

### 步骤定义
集中放 `src/components/onboarding/tour-steps.ts`：
```ts
[
  { route: "/pet",   selector: "[data-tour=pet-card]"        },
  { route: "/pet",   selector: "[data-tour=pet-stats]"       },
  { route: "/pet",   selector: "[data-tour=nav-train]",  waitForClick: true },
  { route: "/train", selector: "[data-tour=train-squat-card]" },
  { route: "/train", selector: "[data-tour=train-start-btn]", waitForClick: true, last: true },
]
```

### `data-tour` 属性补齐
- `/pet`：异兽主卡 `data-tour="pet-card"`，三脉真气面板 `data-tour="pet-stats"`
- `/train`：深蹲卡片与启动按钮已有
- `site-header.tsx`：导航中"修行"链接 `data-tour="nav-train"`

### 文件改动
- 新增 `src/components/onboarding/SpotlightTour.tsx`、`tour-steps.ts`
- 改 `OnboardingProvider.tsx`、`__root.tsx`（挂载 `<SpotlightTour />`）
- 改 `pet.tsx`、`site-header.tsx` 加 `data-tour` 属性

---

## 二、俯卧撑 / 仰卧起坐：补进度条与提示

### 现状
`usePoseCounter` 仅在 squat 流程更新 `status.progress` 与 `status.message`；`train.tsx` 底部进度条仅在 `exercise === "squat"` 时渲染。

### Hook 改动 (`src/hooks/use-pose-counter.ts`)
**`detectPushup`**（每帧末尾统一 `updateStatus`）：
- 进度：`progress = clamp((150 - elbow) / (150 - 108), 0, 1)`
- 文案：
  - 未检测到 / 非俯卧姿态：`"请进入俯卧姿态，肩肘腕入镜"`，progress=0
  - `state==="up"`：`"屈臂下压"`
  - `state==="down"`：`"推起还原"`
  - 完成一次后 600ms 内：`"推起完成 +1"`
- `shoulderVisible = elbow != null`

**`detectSitup`**：
- 进度：`progress = clamp((132 - hip) / (132 - 88), 0, 1)`
- 文案：
  - 未检测到：`"请仰卧入镜，膝盖弯起"`
  - `state==="up"`（躺平）：`"卷腹起身"`
  - `state==="down"`（已起身）：`"缓慢躺回"`
  - 完成一次后 600ms 内：`"完成一次 +1"`

`updateStatus` 已有阈值去抖（progress diff < 0.02 不触发 setState），无需额外节流。

### 页面改动 (`src/routes/train.tsx`)
- 底部进度条容器：`active && ready && exercise === "squat"` → `active && ready`
- 底部小字提示按当前 `exercise` 切换：
  - squat：保留原"按提示完成站立与下蹲两步校准"
  - pushup：`"上半身入镜，肩肘腕清晰可见"`
  - situp：`"侧躺或正面入镜均可，膝盖保持弯起"`

---

## 三、游客身份记忆 + 双选弹窗

### 背景
`signInAnonymously` 创建的匿名账号仅在浏览器 session 中保留。一旦 `signOut`，常规情况下无法再回到原匿名账号。但 Supabase 颁发的 `refresh_token` 可在本地保存后通过 `supabase.auth.setSession({ access_token, refresh_token })` 恢复会话。

### 方案
1. **登录成功时缓存** —— `guestLogin` 拿到 `data.session` 后，把 `{ refresh_token, access_token, user_id, created_at }` 写入 `localStorage["yishou.guestSession"]`。同样在 `auth.signUp` 时清掉该缓存（避免误以为还有游客）。
2. **登出时不清除** —— `signOut` 不动 `yishou.guestSession`，只清当前会话。
3. **进入 `/auth` 时检测** —— `useEffect` 读取 `yishou.guestSession`：
   - 不存在：维持原 UI
   - 存在：弹窗（shadcn `<Dialog>` / `<AlertDialog>`），标题"检测到上次游客身份"，两个按钮：
     - **「继续上次游客」**：调 `supabase.auth.setSession({ access_token, refresh_token })`；若返回错误（refresh_token 过期 / 用户被清理），`toast.error` 并清除缓存、关闭弹窗、留在 `/auth` 让用户新建。
     - **「新建账号」**：清除缓存（防止下次再弹），关闭弹窗，正常登录/注册/再次游客入山。
4. **过期数据清理** —— `created_at` 超过 30 天（与服务端 `cleanup_inactive_guests` 对齐）的缓存视为过期，进入 `/auth` 时直接清掉、不弹窗。

### 文件改动
- 改 `src/routes/auth.tsx`：在 `guestLogin` 写入缓存；新增弹窗组件与上述检测逻辑
- 新增 `src/lib/guest-session.ts`：封装 `saveGuestSession / loadGuestSession / clearGuestSession / isExpired` 四个工具
- 不需要数据库改动

### 备注
Supabase 匿名用户没有 email/password 凭证，唯一登录手段就是该 refresh_token；因此本方案的"继续上次游客"在 token 还活着时一定能回到原账号；token 失效（刷新失败 / 服务端已清理用户）则只能新建。

---

## 验证

- 首次注册 → 看完欢迎卷轴 → 自动出现聚光灯，依次走完 5 步，跨 `/pet → /train`，CPU 占用平稳，不再出现卡顿。点击右上「跳过」可立即结束。
- `/train` 切到俯卧撑：底部出现进度条；屈臂时进度条增长，提示「屈臂下压 → 推起还原 → 推起完成 +1」交替；切到仰卧起坐同理；切回深蹲恢复原校准提示。
- 游客入山 → 退出 → 回到 `/auth`：弹双选项弹窗。点「继续上次游客」回到原账号 + 原异兽数据；点「新建账号」清除缓存，回到普通登录界面。
- 旧已 onboarded 用户：无卷轴、无聚光灯，行为不变。
