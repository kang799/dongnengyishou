## 目标
新的游客账号覆盖旧游客账号后，必须保持已登录状态并直接显示已登录后的页面，不再停留或回到登录页。

## 计划
1. 在 `src/routes/auth.tsx` 里为游客登录成功后的跳转加一个“会话确认”步骤：`signInAnonymously` 成功后先保存新游客 session，再显式调用 `supabase.auth.setSession(...)` 和 `supabase.auth.getSession()` 确认浏览器已恢复新会话。
2. 修改 `doGuestLogin()` 的跳转：确认 session 存在后使用 `nav({ to: "/pet", replace: true })`，让用户直接进入已登录的「我的异兽」页；若用户手动回首页，首页也会显示已登录状态。
3. 在覆盖流程 `confirmOverwrite()` 中保留当前“先删除旧游客 → 清旧缓存 → 创建新游客”的顺序，但确保清理旧缓存不会发生在新游客 session 建立之后。
4. 如有必要，在 `useAuth` 里避免登录态初始化竞态：初始 `getSession()` 与后续 `onAuthStateChange` 都能正确设置 `loading=false`，防止保护页误判为未登录后跳回 `/auth`。

## 不改动
- 邮箱注册仍然必须验证后才能自动入山。
- 旧游客覆盖确认弹窗文案和删除逻辑不变。
- 不改数据库和权限规则。