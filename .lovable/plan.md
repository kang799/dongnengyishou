## 三个问题修复

### 问题 1：默认应是「登录」而非「注册」
当前 `auth.tsx` 默认 `mode = "signup"`。改为：
- 默认 `mode = "signin"`，进入页面先显示**复归山门**（登录）
- 登录时如果 Supabase 报错 `Invalid login credentials`，弹 toast「该账号尚未注册，是否前往结契？」并自动切到 `signup` 模式（保留已填邮箱）
- 底部切换链接调整文案顺序：登录页提示「尚未结契？招神入册」

### 问题 2：已注册邮箱重复注册无提示
Supabase 默认开启邮箱枚举保护，重复注册会返回 `data.user.identities = []` 而无 error。
- 注册成功后判断 `(data.user.identities?.length ?? 0) === 0` → toast「该邮箱已注册，请直接登录」并切回 `signin` 模式

### 问题 3：结契提示的异兽名 ≠ 进入后看到的异兽名
根因：`auth.tsx` 中前端用 `randomBeast()` 随机一个名字 toast 给用户，但只有用户**手填了** `petName` 才会写库；否则数据库触发器 `handle_new_user` 又自己随机选一个 → 两个名字不一致。

修复：
- **`src/routes/auth.tsx`**
  - 始终先决定 `finalPetName = petName.trim() || randomBeast()`
  - 通过 `signUp` 的 `options.data.pet_name = finalPetName` 传给后端
  - 注册成功后再追加一次 `pets.update({ name: finalPetName, species: finalPetName }).eq('user_id', data.user.id)` 作为兜底，确保与 toast 一致
- **新建 migration** 更新 `public.handle_new_user()`：
  ```sql
  proposed_pet := nullif(trim(coalesce(new.raw_user_meta_data->>'pet_name','')), '');
  IF proposed_pet IS NULL THEN
    proposed_pet := beasts[1 + floor(random()*array_length(beasts,1))::int];
  END IF;
  INSERT INTO public.pets(user_id, name, species) VALUES (new.id, proposed_pet, proposed_pet);
  ```
  其余逻辑（profile、display_name 校验）保持不变。

## 涉及文件
- `src/routes/auth.tsx`：默认 signin、登录失败引导注册、重复邮箱检测、pet_name 透传 + 兜底 update
- 新建 `supabase/migrations/xxx_pet_name_from_metadata.sql`：更新 `handle_new_user` 触发器

## 不改动
- pet.tsx / site-header.tsx / 其他路由
- RLS、表结构
