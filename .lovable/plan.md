## 问题

当前点击「否」（不覆盖）后，覆盖确认弹窗直接关闭，回到 auth 登录页，用户没有任何入口回到旧游客账号，相当于被困住。

## 改动

**唯一改动文件**：`src/routes/auth.tsx`

1. **`cancelOverwrite()`**：除了关闭覆盖弹窗、清空 `pendingAction`，再根据来源决定回退：
   - 如果 `pendingAction === "signup"` 且来源是「检测到上次游客身份」对话框（即用户刚点了「新建账号」），则重新打开 `guestPromptOpen`，让用户重新在「继续游客 / 新建账号」之间选择。
   - 如果来源是邮箱表单 submit 或「游客入山」按钮（用户主动操作），同样重新打开 `guestPromptOpen`，让用户有机会选择「继续游客」恢复旧身份，而不是被卡死。
   
   简化方案：**只要旧游客缓存仍存在，点「否」一律重新打开 `guestPromptOpen`**。这样无论从哪个入口触发，用户都能回到「继续 / 新建」的二选一界面。

2. **`Dialog onOpenChange`**：覆盖弹窗的 `onOpenChange` 关闭分支也走 `cancelOverwrite()`，行为一致（用户按 Esc 或点遮罩关闭，也会回到游客二选一）。

3. 其余逻辑（`confirmOverwrite`、`continueAsGuest`、`doSubmit`、`doGuestLogin`、server function）保持现状。

## 不改动

- `src/lib/guest-cleanup.functions.ts`
- `src/lib/guest-session.ts`
- 数据库、RLS、其他页面
