## 问题

当前 `guestPromptOpen` 的 `onOpenChange` 关闭分支调用了 `declineGuest()`，而 `declineGuest()` 会打开「覆盖旧游客账号」确认弹窗。结果是：用户点右上角叉号（或按 Esc / 点遮罩）想关掉提示，却被强制弹出覆盖确认；如果再在覆盖弹窗点「否」，又因为旧缓存仍在被弹回「继续 / 新建」提示，形成死循环。

## 改动

**唯一改动文件**：`src/routes/auth.tsx`

1. 把「点叉号关闭」与「点新建账号按钮」拆成两条路径：
   - `<Dialog open={guestPromptOpen} onOpenChange={...}>` 的关闭分支改为只 `setGuestPromptOpen(false)`，不再触发覆盖确认。用户点叉号 = 单纯关闭，回到邮箱登录界面，旧游客缓存保持不变（下次刷新仍可继续）。
   - 「新建账号」按钮继续调用 `declineGuest()`，弹出覆盖确认（这是用户的明确意图）。

2. `cancelOverwrite()` 中「重新打开 guestPromptOpen」的逻辑保留，但只在 `pendingAction === "signup"` 且来源是 guestPrompt 时才重弹；从邮箱表单 submit 或游客入山按钮触发的覆盖弹窗，点「否」就单纯关闭，不再重弹 guestPrompt，避免循环。
   
   实现：新增一个 `overwriteSource` 状态（`"guestPrompt" | "form" | null`），`declineGuest` 设为 `"guestPrompt"`，`submit` / `guestLogin` 设为 `"form"`。`cancelOverwrite` 只在 `overwriteSource === "guestPrompt"` 时重开 guestPrompt。

## 不改动

- `src/lib/guest-cleanup.functions.ts`、`src/lib/guest-session.ts`
- 数据库、RLS、其他页面
- `confirmOverwrite` / `continueAsGuest` / `doSubmit` / `doGuestLogin` 主流程
