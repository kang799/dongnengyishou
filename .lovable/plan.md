## 修改两处前端体验问题

### 1. 斗兽台战斗日志自动滚动

`src/routes/arena.tsx`
- 给战斗日志容器加一个 `ref`（`logRef`）。
- 新增 `useEffect`，依赖 `battleEvents.length`，每当新增一回合时执行 `logRef.current?.scrollTo({ top: scrollHeight, behavior: "smooth" })`，让最新一条始终可见。
- 另外在战斗结束（`result` 变化）时再触发一次，保证"胜/败"字样也滚到视窗内。

### 2. 榜单切磋按钮稳定显示

`src/routes/leaderboards.tsx`
- 现状：`{user && r.user_id !== user.id && <Button>切磋</Button>}`。在 848px 视口下，行内 `flex-1` 名称区会把按钮挤出可视区，看上去像"按钮消失"。
- 调整每行布局：
  - 给名称容器加 `min-w-0`，让 truncate 生效不再挤压右侧。
  - 给"切磋"按钮加 `shrink-0`，并保留固定宽度（如 `w-20`）。
  - 数值列也加 `shrink-0` + `text-right w-20`，避免被挤压。
- 渲染逻辑保持"非自己即显示按钮"，但把判断从 `user && ...` 改为更稳定的形式：始终渲染占位（保持行高一致），用 `invisible` 控制自己那行的按钮隐藏，确保布局不抖动、按钮永远固定在右侧。

### 不改动

- 后台 RPC、排名规则、战斗算法。
- "我的位置"卡片的"定位"按钮逻辑不变。

### 技术细节

- 自动滚动用原生 `scrollTo`，无需新依赖；用 `requestAnimationFrame` 包一层避免在 DOM 还未追加新行时取错 `scrollHeight`。
- 行布局示意：
```text
[名次] [头像] [名称 flex-1 min-w-0 truncate] [数值 w-20 shrink-0] [按钮 w-20 shrink-0]
```
