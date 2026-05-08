## 1. 头像 / 道号随时可改

在 `site-header.tsx` 把头像 + 道号区域改成可点击：

- 点击 → 弹出 shadcn `Dialog`（"修改身份"）。
- Dialog 内：
  - 头像：复用现有的圆形上传按钮（点击换图，>3MB / 非图片提示）。上传到 `avatars/{userId}/avatar.{ext}`（`upsert: true`），写入 `profiles.avatar_url`。
  - 道号：`Input maxLength={6}`，提交时校验 1–6 字。
  - "保存" 按钮：先上传头像（如有改动），再 `update profiles set avatar_url, display_name`。
  - 失败处理：唯一约束冲突 → toast "此道号已被其他道友占用，请换一个"。
  - 成功：刷新本地 state，关闭弹窗，toast "已更新"。
- 头像上传新文件名加时间戳后缀（`avatar-{ts}.{ext}`），避免 CDN 缓存旧头像。

涉及：`src/components/site-header.tsx`（新增 dialog state + 表单）。不需要新建组件文件。

## 2. 页面切换提速

排查到的几个明确瓶颈：

### a) `defaultPreloadStaleTime: 0` + 未启用 intent 预加载
当前 router 没设 `defaultPreload`，每次点击都要走完整 loader / RSC 流，且预加载结果立刻过期。
**改：** `defaultPreload: "intent"`，`defaultPreloadStaleTime: 30_000`（鼠标悬停就开始拉取下一页数据）。

### b) `backdrop-blur` 在 sticky header 上每帧重采样
`site-header.tsx` 用 `bg-background/70 backdrop-blur sticky`，移动端切页时整页重绘，header 的 blur 是高额开销。
**改：** 去掉 `backdrop-blur`，换成实色 `bg-background/95`（视觉差异极小，性能提升明显）。`train.tsx` 内的 3 处 `backdrop-blur-sm` 是训练页静态层不重要，但顺带改成实色更稳。

### c) 顶栏每次路由切换都重新查 profile
`useEffect` 依赖 `[user]`，但 `user` 引用每次 `onAuthStateChange` 触发都会变 → 每次路由进入都打一次数据库。
**改：** 用 `user?.id` 作为依赖，并把 profile 查询挪到 React Query (`useQuery(["profile", user.id])`)，缓存 5 分钟。这样切页头像/道号瞬间渲染。

### d) `useAuth` 在每个页面被重复实例化
现在每个路由组件 + header 都各自跑 `getSession()` + 订阅 `onAuthStateChange`。Supabase 内部虽然便宜，但每次仍触发组件树 re-render。
**改：** 暂不重构（影响面大），先靠 (a)(b)(c) 的收益。

### e) （可选）路由 Link `preload="intent"`
全局 default 已覆盖，无需逐个加。

## 涉及文件

- `src/router.tsx`：加 `defaultPreload: "intent"`、调高 staleTime。
- `src/components/site-header.tsx`：去 backdrop-blur；加身份编辑 Dialog；profile 查询改 React Query + 用 `user?.id` 依赖。
- `src/routes/train.tsx`：3 处 `backdrop-blur-sm` → 实色（顺手做，非关键）。

不动数据库（道号唯一性 / 长度约束已在上一轮加好，update 时会自动校验）。
