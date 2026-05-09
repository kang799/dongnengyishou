## 目标
首页 `src/routes/index.tsx` 的"三式修行"区块仍在用红色大字 `速 / 力 / 体`，未替换为之前生成的水墨图标。本次把它们换成 `icon-speed.png` / `icon-strength.png` / `icon-vitality.png`。

## 改动
仅修改 `src/routes/index.tsx`：

1. 顶部新增图片导入：
   - `iconSpeed` ← `@/assets/icon-speed.png`
   - `iconStrength` ← `@/assets/icon-strength.png`
   - `iconVitality` ← `@/assets/icon-vitality.png`

2. `Way` 组件签名：把 `kanji: string` 改为 `icon: string`，将原 `<div>{kanji}</div>` 替换为 `<img src={icon} className="w-16 h-16 object-contain shrink-0" alt="" />`，保留卡片其余结构。

3. "三式修行" 区块三张卡片调用：
   - 深蹲 → `icon={iconSpeed}`
   - 俯卧撑 → `icon={iconStrength}`
   - 仰卧起坐 → `icon={iconVitality}`

## 不动
- "四殿可游" 区块（兽/练/斗/榜）保持现有汉字样式，不在本次需求内。
- 训练页与欢迎轮播已替换，无需重复。
- 颜色 token、字体、布局、文案、后端逻辑均不变。
