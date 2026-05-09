## 问题

当前点击「游客入山」按钮时，若检测到本地有上次游客缓存，会直接弹出「覆盖旧游客账号？」的双选确认框。这与「检测到上次游客身份」的入口体验不一致——用户其实更可能想继续上次的游客身份，而不是直接被询问是否覆盖。

## 改动

**唯一改动文件**：`src/routes/auth.tsx`

修改 `guestLogin()` 函数：当检测到 `loadGuestSession()` 存在时，不再设置 `pendingAction="guest"` 并打开 `overwriteOpen`，改为直接打开 `guestPromptOpen`（即「继续游客 / 新建账号」选择框）。

- 用户点「继续游客」→ 走 `continueAsGuest()`，恢复旧身份；
- 用户点「新建账号」→ 走原有 `declineGuest()` 流程，弹出覆盖确认（此时是用户的明确意图）；
- 用户点叉号 → 单纯关闭，回到登录页。

无缓存时 `guestLogin()` 行为不变，直接 `doGuestLogin()` 创建新游客。

## 不改动

- `submit()` 中邮箱注册/登录的覆盖确认逻辑保持原样（邮箱场景下用户已选定要切换到邮箱账号，覆盖确认是合理的）。
- `declineGuest` / `continueAsGuest` / `confirmOverwrite` / `cancelOverwrite` 主流程不变。
- `src/lib/guest-cleanup.functions.ts`、`src/lib/guest-session.ts`、数据库、其他页面均不动。
