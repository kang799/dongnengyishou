# 修复"游客入山"报错

## 问题
点击「游客入山」时后端返回 `Anonymous sign-ins are disabled`，因为 Lovable Cloud 的认证设置默认关闭了匿名登录，而 `src/routes/auth.tsx` 中 `guestLogin()` 调用的是 `supabase.auth.signInAnonymously()`。

## 方案
调用 `configure_auth` 工具开启匿名登录开关：
- `external_anonymous_users_enabled: true`
- 其它现有设置保持：`disable_signup: false`、`auto_confirm_email: false`、`password_hibp_enabled: true`

无需改动任何代码 —— 现有 `guestLogin()`、`handle_new_user()` 触发器（已识别 `is_guest` 标记）和 30 天清理函数 `cleanup_inactive_guests()` 已经为游客流程准备就绪，只缺这个开关。

## 备注
匿名用户无邮箱、无密码，30 天未活跃会被 `cleanup_inactive_guests` 自动清除，与项目现有"游客 30 天消散"提示一致。
