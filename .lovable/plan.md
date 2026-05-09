## 根因

控制台连续报错：

```
load pet/profile failed
code: 42501
message: permission denied for table profiles
```

`/pet` 页里 `load()` 抛错后，组件直接渲染错误分支：

```tsx
if (fetchErr || !pet || !profile) {
  return <div>召唤受阻：{fetchErr}</div>;
}
```

于是 `data-tour="pet-portrait" / "pet-stats" / "pet-go-train"` 三个挂点根本没挂到 DOM —— SpotlightTour 用 `document.querySelector(step.selector)` 找不到，重试 4 次后就显示「未找到目标元素，可点下一步继续」，自然也没有高亮框。

第 4 步 `train-squat-card` 也"找不到"是次生问题：第 3 步是 `waitForClick` 绑在不存在的 `pet-go-train` 上，用户只能点"下一步"强行推进，此时还在 `/pet` 路由，组件来不及切到 `/train` 就开始查 `train-squat-card`，重试窗口（4×100ms）跑完就报 missing。

也就是说 **问题不在引导组件，而在 profiles 表的 RLS**：当前已登录用户对 `public.profiles` 没有 SELECT 权限。

## 修复

### 1. 修复 profiles 表 RLS（数据库迁移）

新增迁移，确保已登录用户至少能读自己的行（其它策略保持不动）：

- 启用 `public.profiles` 上的 RLS（如未启用）。
- 新建策略：`profiles_select_self`，`for select to authenticated using (id = auth.uid())`。
- 视情况补 `profiles_insert_self`、`profiles_update_self`，避免 `pet.tsx` 的 insert/update 也撞同样的 42501。

确认现有策略后只补缺失的，避免重复创建。

### 2. 增强 SpotlightTour 的兜底（防御性，可选）

即使数据库修好了，将来某个目标元素短暂不渲染时，也不应该让用户陷入"无聚光灯+无法继续"的状态：

- 路由切换后将查找重试窗口从 4×100ms 提升到 ~10×200ms（覆盖懒加载/重定向）。
- `waitForClick` 步骤如果元素一直缺失，自动退化为显示"下一步"按钮（已经有 `missing && 下一步` 的 UI 分支，目前是 OR 逻辑没问题，无需改动）。

### 3. 验证

- 当前已登录账号刷新 `/pet`：不再出现 "permission denied"，正常渲染异兽卡片。
- 走一遍引导：5 步全部命中 `data-tour` 元素，聚光灯虚线框正常显示。
- 退出账号、用游客身份再走一遍，确认 RLS 对 anon 的策略未被破坏。

## 备注

SpotlightTour 本身的逻辑没问题，根因 100% 是 `/pet` 因 RLS 报错走了错误分支导致挂点缺失。先修数据库再看引导，第 2 步只是顺手加固。
