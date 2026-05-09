## 目标

只用服务端 `profiles.onboarded_at` 判断是否需要新手引导：
- 新建账号（邮箱注册 / 游客新建）→ `onboarded_at` 为空 → 弹出引导
- 老账号（已完成引导）→ `onboarded_at` 有值 → 不再弹出
- 同一账号在新设备登录 → 因为读的是服务端字段，自动不弹

移除之前加入的 localStorage `yishou.onboarded` 兜底逻辑（它会让"已引导但换设备"的账号被误判，也会让"新账号但本机引导过别的账号"的被跳过）。

## 改动

### 1. `src/components/onboarding/OnboardingProvider.tsx`
- 自动弹窗条件改回纯服务端判断：
  ```ts
  if (!onboardedAt) setWelcomeOpen(true);
  ```
  删除 `&& !hasOnboardedLocal()`。
- `markOnboarded` 中删除 `markOnboardedLocal()` 调用。
- `restart` 中删除 `clearOnboardedLocal()` 调用。
- 删除 `markOnboardedLocal / hasOnboardedLocal / clearOnboardedLocal` 三个 import。

### 2. `src/lib/guest-session.ts`
- 删除 `ONBOARDED_KEY` 常量与 `markOnboardedLocal / hasOnboardedLocal / clearOnboardedLocal` 三个函数（不再被任何地方引用）。
- 其余游客会话相关函数保持不变。

## 验证

- 新邮箱注册 → 弹引导；完成后重登 → 不弹。
- 同账号换设备登录 → 不弹（服务端 `onboarded_at` 已写）。
- 新建游客 → 弹引导；完成后刷新 → 不弹；恢复同一游客身份 → 不弹。
- 同一浏览器先用 A 账号完成引导，再注册 B 新账号 → B 仍弹引导（不再被 localStorage 误判）。
