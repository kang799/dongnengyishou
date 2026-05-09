## 目标
游客每次登录（包括恢复旧游客、或恢复失败后新建游客）都会重新弹出新手引导，体验很烦。改为：**只有真正第一次使用本设备的新用户**才弹出新手引导，已经看过的用户（无论账号是否相同）都不再弹出。

## 现状
`OnboardingProvider` 仅根据 `profiles.onboarded_at` 是否为空判断是否弹出引导。问题在于：
- 游客每次重新建号都是一条全新的 profile，`onboarded_at` 为空 → 又弹一次
- 同一浏览器上的同一用户其实早就看过引导，没必要再演

## 方案
增加一层**本设备级别**的"已看过引导"标记，与服务端 `onboarded_at` 共同决定是否弹出。

### 1. 新增本地标记
在 `src/lib/guest-session.ts`（或新建 `src/lib/onboarding-local.ts`）中添加：
- `markOnboardedLocal()`：写入 `localStorage["yishou.onboarded"] = "1"`
- `hasOnboardedLocal()`：读取上述键

### 2. 改造 `OnboardingProvider`
- 自动弹出条件由 `!onboardedAt` 改为 `!onboardedAt && !hasOnboardedLocal()`
- `closeWelcome` / `markOnboarded` 中除了写 profile，也调用 `markOnboardedLocal()`
- `restart`（用户在设置里手动"重看引导"）需要清除本地标记，保证能重新弹出

### 3. 不影响的部分
- 普通邮箱账号首次注册依旧会弹（本设备没有标记）
- 用户主动点"重新观看引导"依旧能看
- 聚光灯引导自身行为不变

## 验证
- 新游客首次进入 → 弹引导 → 关闭 → 退出 → 新建游客再进入 → **不弹**
- 清除浏览器 localStorage 后再进入 → 弹引导
- 普通邮箱首次注册 → 弹引导
- 在设置里点"重看引导" → 能再次弹出
