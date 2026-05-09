## 目标
道友录中点击「切磋」按钮，应直接与该道友对战，行为与封神榜一致。

## 改动
**`src/routes/friends.tsx`**：将 `<Button onClick={() => nav({ to: "/arena" })}>` 改为 `nav({ to: "/arena", search: { vs: r.user_id } })`，与 leaderboards.tsx 中切磋按钮逻辑一致。

arena 路由已支持 `vs` 搜索参数，会自动锁定该对手。无需其他文件改动。