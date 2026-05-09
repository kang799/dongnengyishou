## 问题定位

`OnboardingProvider` 中存在一个 effect：
```
useEffect(() => {
  if (!user || confirmedUserId !== user.id) return;
  if (onboardedAt) {
    setWelcomeOpen(false);
    setTourActive(false);   // ← 把刚启动的聚光灯关掉
    setTourStep(0);
  } else {
    setWelcomeOpen(true);
  }
}, [confirmedUserId, user, onboardedAt]);
```

`closeWelcome` 的执行流程：
1. `setWelcomeOpen(false)`
2. `void markOnboarded()` → 立刻 `setOnboardedAt(now)`
3. `setTourActive(true)` 启动聚光灯

但第 2 步把 `onboardedAt` 由 `null` 变成时间戳，导致上面的 effect 重新跑，命中 `if (onboardedAt)` 分支，把 `tourActive` 又改回 `false`。结果聚光灯一闪而过（实际是没显示）。

新账号是这种情况：刚确认时 `onboardedAt` 为 null → 弹欢迎卷轴 → 用户点"入山修行"→ markOnboarded 把 onboardedAt 写为现在 → effect 二次触发 → 聚光灯被关闭。

## 修复方案

把"账号确认时一次性同步 UI 状态"和"会话内状态变化"解耦：

1. 改造该 effect：只依赖 `confirmedUserId`（不再监听 `onboardedAt`），在它从 null 切到某个 user.id 那一刻读取一次当时的 onboardedAt 决定弹欢迎或重置 tour。会话内 `markOnboarded` 引发的 `onboardedAt` 变化不再触发它，于是 `closeWelcome` 启动的聚光灯不会被覆盖。

2. 用 `useRef`（或在切账号的 effect 里把 ref 清空）保存上一次已经"应用过初始 UI"的 user.id，避免同一账号重复执行。

3. `closeWelcome` 内部顺序保持不变即可：先 `markOnboarded` 再 `setTourActive(true)`。

4. 切账号那段 effect 仍然负责清场：`setWelcomeOpen(false)` / `setTourActive(false)` / `setTourStep(0)` / `setConfirmedUserId(null)` / 清空 ref。

## 涉及文件

- `src/components/onboarding/OnboardingProvider.tsx`：拆分两个 effect，引入 `appliedInitialForUserRef`，去掉对 `onboardedAt` 的初始化依赖。

## 不改动的内容

- 游客缓存 `onboarded_at` 继承规则保持现状。
- WelcomeCarousel、SpotlightTour、tour-steps 不动。
- 邮箱账号、已完成游客恢复登录的行为不变。
