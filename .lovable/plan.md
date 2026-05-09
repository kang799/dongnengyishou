## 目标
点击「是·覆盖」并完成旧游客消散后，应根据后续动作直接跳到主页 `/`，而不是停留在登陆页或跳到 `/pet`。

## 改动（仅 `src/routes/auth.tsx`）

1. **`doGuestLogin()`**：成功后 `nav({ to: "/" })`（原为 `/pet`）。
2. **`doSubmit()` 登录分支**：登录成功后 `nav({ to: "/" })`（原为 `/pet`）。
3. **`doSubmit()` 注册分支**：保持现状——仍需邮箱验证后再由 `/auth/callback` 跳转到 `/`，不能在未验证时进入主页（与上一轮已确认的「必须验邮箱后自动入山」一致）。覆盖后若动作是 signup，会清掉旧游客 → 发送验证邮件 → 显示「神谕待启」提示卡，等用户去邮箱点链接。
4. **`confirmOverwrite()`**：逻辑不变（仍然根据 `pendingAction` 调 `doGuestLogin` / `doSubmit`），由上面两处的 nav 改动负责跳转到 `/`。

## 不动的部分
- `guestPromptOpen` / `overwriteOpen` 弹窗本身的触发与文案
- `cancelOverwrite()`、`continueAsGuest()`、`declineGuest()`、`resendVerifyEmail()`
- `src/routes/auth.callback.tsx`、`guest-cleanup.functions.ts`、`guest-session.ts`
- 数据库 / RLS / 其他页面

## 备注
若你希望「覆盖后即便是注册分支也立刻进主页（跳过邮箱验证）」，请告诉我——这会与上一轮「必须验邮箱后自动入山」的决定冲突，需要先撤销那条规则。