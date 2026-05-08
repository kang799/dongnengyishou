## 调整内容

### 1. 替换 Logo
- 把上传的图片保存为 `src/assets/logo.png`。
- `src/components/site-header.tsx`：用 `<img>` 替换原"兽"印章 + "动能异兽"文字组合（保留"动能异兽"标题在 logo 旁，或仅保留图标，详见问题）。
- 整个 logo 区域包裹在 `<Link to="/">`，点击返回首页（即推荐页）。

### 2. 右上角不显示邮箱
- 在 `site-header.tsx` 删除 `{user.email ?? "游客"}` 这段 span。
- 改为显示**道号**（`profiles.display_name`），从 profiles 表读取，与头像一起显示。

### 3. 道号（玩家 ID）规则
- **唯一**、**最多 6 个汉字/字符**。
- 注册时：用户填则用用户填的；留空则后端随机分配一个古风名（如"青衫客"、"白鹿吟"、"墨九"、"沧溟子"…）。
- 游客入山：同样自动分配古风名。
- 已有用户登录：不再要求输入。

### 4. 数据库变更（迁移）
- `profiles.display_name`：加 `UNIQUE` 约束 + `CHECK (char_length(display_name) <= 6 AND char_length(display_name) >= 1)`。
- 扩充 `validate_display_name` 触发器：
  - 长度截断到 6。
  - 若为空 / 重名 / 非法（纯数字/电话样式）→ 从古风名词库随机抽，最多重试 20 次拼短后缀保证唯一。
- 修改 `handle_new_user`：不再用"游客·xxxxxx"或"邮箱前缀"，而是统一走"如果 raw_user_meta_data.display_name 非空就用它（触发器再校验唯一），否则从古风词库随机选"。

### 5. 前端校验
- `src/routes/auth.tsx`：道号输入框加 `maxLength={6}`，提交前若长度 > 6 提示。
- 注册时若重名 → 显示后端返回的错误，提示换一个。
- 标签从"道号"改为"道号 / 玩家ID（最多 6 字，留空随机）"。

### 6. 古风词库
新建 `src/lib/ancient-names.ts`（前端可用做提示）；同时在迁移里写入一个 PL/pgSQL 的 `text[]` 常量供触发器使用，约 60-80 个名字，例：
青衫客、白鹿吟、墨九、沧溟子、听雪、问月、临渊、扶摇、怀霜、子衿、长歌、莫离、燕千幻、洛白、墨砚、…

### 涉及文件
- 新增：`src/assets/logo.png`、`src/lib/ancient-names.ts`、新迁移文件
- 编辑：`src/components/site-header.tsx`、`src/routes/auth.tsx`

---

## 几个想先确认的小点

请回答下面问题再开始改：