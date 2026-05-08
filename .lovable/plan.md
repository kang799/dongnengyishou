## 问题
首页"开始游戏"按钮在 `useAuth()` 还没加载完登录态时就把 `to` 写死成 `/auth`，导致已登录用户点击瞬间被推到登录页。

## 方案
把首页的 `<Link to={startTo}>` 改为 `<Button onClick=...>`，点击时**实时**判断登录态再跳转，并用 loading 状态防止误跳。

## 改动（仅 `src/routes/index.tsx`）

1. 从 `useAuth()` 取出 `loading`。
2. 用 `useNavigate()` 替代 `<Link>` 包裹的方式：
   - 如果 `loading` → 按钮禁用，文案"载入中…"。
   - 否则点击时再次 `supabase.auth.getSession()` 兜底，已登录跳 `/pet`，未登录跳 `/auth`。
3. "回到山门"文案逻辑保留：`user ? "回到山门" : "开 始 游 戏"`。
4. 顺手给 `<Link to="/leaderboards">` 等其它按钮预加载（不强制）。

## 不改动
- `useAuth` 本身、`/auth`、`/pet` 路由逻辑保持不变。
- 视觉样式、布局完全不变。