## 改动目标

1. **头像替换**：道友录、封神榜、聊天页里展示的圆形头像，从「水墨异兽 logo」改为用户在注册/资料里上传的头像（`profiles.avatar_url`）。未上传则回退到现在的异兽 logo，再回退到「兽」字。
2. **称呼顺序调整**：当前显示 `{异兽名} 道友 · {道号}`，改为 `{道号} · {异兽名}`，让用户的道号在前。

## 改动范围

### 1. `src/components/beast-avatar.tsx`（核心组件改造）
新增可选 `avatarUrl?: string | null` 与 `name?: string`（用于 alt），渲染优先级：
- `avatarUrl` 存在 → 显示用户头像（圆形 cover）
- 否则 → 显示对应 species 的水墨异兽 logo
- 都没有 → 显示「兽」字

保持现有 `size` 接口，已有调用全部兼容。

### 2. 数据加载补 `avatar_url`
- **`src/routes/friends.tsx`**：`loadProfilesAndPets` 的 profiles select 加入 `avatar_url`，Row 类型加 `avatar_url: string | null`，所有 `<BeastAvatar>` 调用传入 `avatarUrl={r.avatar_url}`。
- **`src/routes/leaderboards.tsx`**：profiles 查询加 `avatar_url`，Row 类型补字段，自身的内部 `BeastAvatar` 包装组件接收并透传 `avatarUrl`。
- **`src/routes/chat.$userId.tsx`**：对方资料查询补 `avatar_url`，传给头像组件。

### 3. 称呼显示顺序统一调整

当前格式 → 新格式：

| 位置 | 旧 | 新 |
|---|---|---|
| 榜单行 | `{name}　道友 · {display_name}` | `{display_name} · {name}` |
| 我的高亮行 | `{name}　道友 · {display_name}（我）` | `{display_name}（我）· {name}` |
| 道友列表 | `{name}　道友 · {display_name}` | `{display_name} · {name}` |
| 申请列表（收到/发出）| 同上 | 同上 |
| 寻访结果 | 同上 | 同上 |
| 聊天页头部 | 同上 | 同上 |

主标题样式（font-display + 主色）给 `display_name`，副标题样式（小字 muted）给异兽名 `{name}`，因为「用户身份」是道号，异兽是其宠物。

## 不改动的位置
- 异兽页（`pet.tsx`）中央大「兽」字保持不变（那是用户自己的异兽展示，不是社交身份）。
- 数据库与 RLS 不动；`avatar_url` 字段已存在并已可读。
- 不新增上传入口（顶栏 `site-header.tsx` 已有头像上传弹窗）。

## 摘要
让社交相关页面统一以「用户上传头像 + 道号在前、异兽名在后」呈现身份，异兽 logo 仅作为未设置头像时的回退。