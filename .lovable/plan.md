## 目标
封神榜三个榜单（属性榜 / 战力榜 / 打卡榜）顶部默认置顶显示当前用户自己一行，置顶行右侧多一个"定位"按钮，点击后页面平滑滚动到该用户在真实榜单中的位置并高亮闪烁一下。

## 改动范围
仅 `src/routes/leaderboards.tsx`。

## 设计

### 1. 数据
保持现有查询不变（`pets` + `profiles`）。在排序后：
- 计算 `myIndex = rows.findIndex(r => r.user_id === user.id)`
- 若 `myIndex >= 0`，把当前用户行单独提出来作为"置顶行"渲染在列表上方
- 真实榜单依旧渲染完整的 `rows`（含我自己），所以排名号、定位都准确

### 2. 置顶行 UI
- 复用现有行的视觉，外加一层 `border-primary/40 bg-primary/5` 强调
- 左侧排名号显示真实排名 `myIndex + 1`（不是 1）
- 最右侧渲染一个"定位"按钮（圆形小按钮，`Crosshair` 图标 + 文字"定位"）
- 不显示"切磋"按钮（自己不能切磋自己）

### 3. 定位行为
- 给真实榜单中"我自己"那一行加 `ref` 或 `id={`row-${user.id}`}`
- 点定位按钮：`document.getElementById(...)?.scrollIntoView({ behavior: "smooth", block: "center" })`
- 滚动到位后给该行加一个短暂的高亮动画（用 React state `flashId` 控制 className，800ms 后清除），CSS 用现有 `animate-pulse` 或新增 `ring-2 ring-primary` 配合 `transition`

### 4. 边界
- 未登录、或当前用户没在前 50 内：不渲染置顶行
- 标签切换时 `myIndex` 重新计算
- `rows` 上限保持 50，不变

## 验证
- 三个榜单切换都能看到自己置顶
- 点定位 → 平滑滚到真实位置 → 高亮一下
- 未登录访问榜单 → 不出现置顶行
- 自己排第 1 时也正常显示，定位按钮点击不报错
