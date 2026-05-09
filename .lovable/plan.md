## 目标

1. 邮箱注册后，必须先点邮件验证链接才能登录使用，防止虚假/非本人邮箱注册成功。
2. 用户点开邮件验证链接 → 自动登录 → 直接落到首页 `/`（推荐页），不再回到 `/auth` 登录页。
3. 在用户验证邮箱前，禁止其登录使用账号。

## 改动

### 一、Supabase Auth 配置

通过 `configure_auth` 关闭自动确认邮箱（即开启邮箱验证强制要求）：
- `auto_confirm_email: false`
- 同时开启 `password_hibp_enabled: true`，拒绝已泄露弱密码（也算"防虚假"的一部分）。

效果：`signUp` 后用户没有 session，必须点邮件链接才能完成验证、生成 session。

### 二、`src/routes/auth.tsx` 注册流程

修改 `doSubmit()` 的 signup 分支：
- 调用 `supabase.auth.signUp` 时，`emailRedirectTo` 改为 `${window.location.origin}/auth/callback`（不再是站点根目录），保证回跳一定经过我们的回调页处理。
- 注册成功后（无 session 是预期行为），不再 `nav({ to: "/pet" })`，改为：
  - 清空表单 / 仍停留在 `/auth`；
  - 弹出明显提示卡片或 toast：「神谕已发往 xxx@xx，须点击邮件中『入山令』方可结契」；
  - 提示中附「重新发送验证邮件」按钮，调用 `supabase.auth.resend({ type: 'signup', email })`。
- 头像上传逻辑：因为此时 `data.session` 为空，无法满足 `avatars` bucket RLS。改为：把已选头像 `File` 暂存到 `sessionStorage`（base64 + 文件名），等回调页登录成功后再上传。
- 登录分支 (`signin`)：若 `signInWithPassword` 返回 `Email not confirmed` 错误，提示「邮箱尚未验证，请先在邮件中点击入山令」并提供「重新发送」按钮，禁止其继续。

### 三、新增回调路由 `src/routes/auth.callback.tsx`

负责处理邮件链接回跳：
- Supabase 邮件链接默认会带 `#access_token=...&refresh_token=...&type=signup`（implicit flow）。
- 组件 `useEffect` 中：
  - 读取 `window.location.hash`，解析 `access_token` / `refresh_token` / `type`；
  - 调 `supabase.auth.setSession({ access_token, refresh_token })`；
  - 成功后：若 `sessionStorage` 中有暂存头像，则上传到 `avatars` bucket 并写回 `profiles.avatar_url`；清掉暂存；
  - `clearGuestSession()`（用户已确认走邮箱身份）；
  - `toast.success("神契已成，入山！")`；
  - `nav({ to: "/" })` —— 落到首页推荐页，而不是 `/auth`。
- 失败（链接过期 / 缺参）：toast 报错并 `nav({ to: "/auth" })`，让用户重新发送。
- 路由本身不做 auth 守卫（它就是用来建立 session 的）。

### 四、`useAuth` / 其它

- 不需要改 `useAuth.ts`：`onAuthStateChange` 在 `setSession` 后会自动触发并更新 last_active_at。
- 首页 `/` 已经能识别登录态，`handleStart` 会把已登录用户带到 `/pet`，不需要额外改动。

## 不改动

- 游客流程（`guestLogin` / `continueAsGuest` / `declineGuest` / 覆盖确认）保持现状。
- `pet`、`train`、`arena`、`leaderboards`、`friends` 等页面不改。
- 数据库表结构 / RLS / `handle_new_user` 触发器 / Edge Function 不改。
- `clearSupabaseLocalAuth`、`guest-session.ts` 不改。

## 技术细节

- `configure_auth` 调用参数：`{ disable_signup: false, external_anonymous_users_enabled: true, auto_confirm_email: false, password_hibp_enabled: true }`（保留游客匿名登录）。
- 头像暂存键名：`pending-signup-avatar`，结构 `{ name, type, dataUrl }`，`dataUrl` 为 `FileReader.readAsDataURL` 结果，回调页用 `fetch(dataUrl).then(r => r.blob())` 还原。
- 回调页路由文件名按 TanStack 扁平点号命名：`src/routes/auth.callback.tsx` → URL `/auth/callback`。
- 邮件链接由 Supabase 默认模板发送，此次不引入自定义邮件模板（保持最小改动）。如后续要换品牌邮件，再走 auth email scaffold 流程。
