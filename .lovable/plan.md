## 目标

游客退出登陆后回到 auth 页面，再点击「结契」（邮箱注册）/「入山」（邮箱登录）/「游客入山」之前，先弹出二次确认窗：
- **是 · 覆盖**：彻底删除旧游客账号（包括其在数据库中的痕迹，使其不再出现在榜单与好友列表），然后继续原本的注册/登录/新建游客流程；
- **否**：仅关闭确认弹窗，回到 auth 页面，让用户重新选择。

## 流程改动

1. **入口拦截**：在 `src/routes/auth.tsx` 中，对三个入口加一道前置检查：
   - 邮箱表单 `submit`（signup / signin 两种 mode）
   - 「游客入山」按钮 `guestLogin`
   
   若 `loadGuestSession()` 仍存在缓存，则不直接执行原逻辑，而是打开「覆盖确认弹窗」并记录待执行的动作类型。

2. **覆盖确认弹窗**：新增 `overwritePromptOpen` 状态与 `pendingAction`（`"signup" | "signin" | "guest"`）。
   - 标题：「覆盖旧游客账号？」
   - 文案：「上次的游客异兽与修行数据将被永久消散，无法找回。是否继续？」
   - 「否」按钮：`setOverwritePromptOpen(false)` + `setPendingAction(null)`，不做任何破坏性操作。
   - 「是 · 覆盖」按钮：先调用删除接口，成功后 `clearGuestSession()` + `clearSupabaseLocalAuth()`，再根据 `pendingAction` 走真正的 signup / signin / guestLogin。

3. **页面初始的「检测到上次游客身份」对话框**：保持原样（继续/新建二选一），其中「新建账号」按钮不再只 `clearGuestSession`，而是触发同一个「覆盖确认弹窗」，避免误删。

4. **删除旧游客账号**：新增一个 server function（不会暴露 service role 给前端）。
   - 文件：`src/lib/guest-cleanup.functions.ts`
   - 输入：`{ user_id: string, refresh_token: string }`
   - 步骤：
     1. 用 `refresh_token` 调 `supabase.auth.refreshSession`（用普通 anon 客户端）验证 token 确实属于该 `user_id`，避免任意用户被删除。
     2. 验证 `profiles.is_guest = true`（只允许删游客）。
     3. 用 `supabaseAdmin` 依次删除：`exercise_logs` / `battles`（challenger_id 或 defender_id）/ `pets` / `profiles` / `auth.users`（参考已有 `cleanup_inactive_guests` 函数）。
   - 失败时返回明确错误，前端 toast 提示，不继续后续登录动作。

## 涉及文件

- `src/routes/auth.tsx`：新增覆盖确认弹窗 UI、`pendingAction` 状态、三处入口拦截、调用删除 server function。
- `src/lib/guest-cleanup.functions.ts`（新建）：`deleteGuestAccount` server function。
- 不需要新建迁移；删除逻辑复用现有表结构与 service role。

## 不改动

- `OnboardingProvider`、`SpotlightTour`、`WelcomeCarousel`、新手引导逻辑保持现状。
- 数据库表结构、RLS、`cleanup_inactive_guests` 定时清理函数保持现状。
- 邮箱账号之间互相切换的逻辑不变。
- 已删除的游客原本就不会再出现在榜单/好友（`profiles` / `pets` 都被删除），无需额外改前端列表查询。
