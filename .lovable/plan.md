## 目标

1. **道友录页面套上异兽 logo**（与封神榜一致），之前漏改。
2. **新增「加好友」与「私聊」社交功能**，做成常见游戏的好友系统：申请 → 同意 → 好友列表 → 一对一聊天。

---

## 一、数据库（migration）

新增三张表：

**`friend_requests`** — 好友申请
- `from_user`, `to_user`, `status`（pending/accepted/declined）
- 唯一约束 `(from_user, to_user)`
- RLS：当事人双方可读；只能以自己身份发起；接收方可更新 status

**`friendships`** — 已确立的好友关系（双向，存两行或单行 + 排序键，采用「`user_a < user_b` 单行」方案）
- `user_a`, `user_b`, `created_at`，主键 `(user_a, user_b)`
- RLS：当事人双方可读；只能由 `accept_friend_request` 函数写入

**`messages`** — 私聊消息
- `sender_id`, `receiver_id`, `content`, `created_at`, `read_at`
- 索引 `(sender_id, receiver_id, created_at)` / 反向
- RLS：仅收发双方可读；发送方插入需为好友（用 `is_friend(a,b)` SECURITY DEFINER 函数校验）

**辅助函数（SECURITY DEFINER）**
- `send_friend_request(p_to uuid)`：拒绝自我、拒绝重复、若对方已申请则直接 accept
- `accept_friend_request(p_from uuid)`：更新 status，写入 friendships
- `decline_friend_request(p_from uuid)`
- `remove_friend(p_other uuid)`
- `is_friend(a uuid, b uuid) returns boolean`

**Realtime**：`ALTER PUBLICATION supabase_realtime ADD TABLE messages, friend_requests, friendships;`

---

## 二、前端改动

### `src/routes/friends.tsx`（重构为 Tabs 社交中心）

三个 Tab：
- **道友** — 当前已加好友列表
  - 每行：异兽 logo（`BeastAvatar`，复用封神榜样式）+ 名字 + 道号 + 战力
  - 操作按钮：`聊天`（→ `/chat/$userId`）、`切磋`（→ `/arena?vs=...`）、`删除`
- **申请** — 收到的 / 已发出的好友申请，带「同意 / 拒绝」按钮，未读数量徽标
- **寻访** — 现有的搜索页，每行新增「加好友」按钮（已是好友/已申请显示对应状态）

补上之前漏的：把头像 div 改成 `<BeastAvatar species={r.species} />`。

### 新增 `src/routes/chat.$userId.tsx`（一对一聊天）

- 顶栏：对方异兽 logo + 名字 + 返回按钮
- 消息流：左右气泡（自己右侧 primary 色，对方左侧 muted），按时间分组
- 底部输入框 + 发送按钮，回车发送
- 加载：`select * from messages where (sender,receiver) in (me,other) or (other,me) order by created_at`
- Realtime 订阅 `messages` 表插入事件，过滤 `receiver_id=me` 实时追加
- 进入页面时把对方发来的未读消息 `read_at` 标记为 now()

### `src/components/site-header.tsx`（小改）
- 「道友」入口加未读申请 / 未读消息数量小红点（可选，简单版）

---

## 三、范围之外
- 不做群聊、不做表情/图片、不做语音
- 暂不分页（消息默认拉最近 200 条）

确认后开始实施。
