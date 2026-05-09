## 目标

修正两件事：

1. **战力榜按"挑战排名"排序，不再按数值排序。** 只有挑战排名比自己靠前（rank 数字更小）的人并取胜，才能升榜——胜者占据败者的 rank，败者及其后的所有玩家 rank 自动 +1 顺移。挑战排名比自己靠后的，胜负都不影响排名。
2. **战斗系统重写速度机制。** 速度差距越大，高速一方的闪避率与命中率越高；当差距达到阈值时，100% 闪避对方且 100% 命中对方。力量影响攻击力、体质影响生命值不变。

注意：`battle_power` 这个数值字段保留，仅用于"显示战力值 = 攻击力 + 生命值"参考；它**不**决定排名。

---

## 数据库改动（migration）

### `pets` 表
- 新增 `rank int`（NOT NULL，UNIQUE）。迁移时按现有 `battle_power desc, created_at asc` 一次性给所有现存 pet 编号 1..N。
- 修改 `handle_new_user()`：新建宠物时 rank = `(SELECT COALESCE(MAX(rank),0)+1 FROM pets)`，保证新人垫底。
- 重算 `battle_power` 公式改为「攻击力 + 生命值」的总和（仅作展示用，不再带阶位倍率）：
  - `attack = 10 + strength * 2 + stage * 12`
  - `hp    = 100 + vitality * 5 + stage * 80`
  - `battle_power = attack + hp`
  - 在 `apply_exercise`、`evolve_pet`、`allocate_points`、初始化里全部使用同一公式。

### `run_battle(p_defender uuid)` 重写

战斗逻辑（每回合）：

1. 取双方属性：
   - `atk = 10 + strength*2 + stage*12`
   - `hp  = 100 + vitality*5 + stage*80`
   - `spd = speed`
2. 谁速度高谁先手；速度相同则挑战者先手。
3. 计算速度差衍生概率（每次攻击各自计算"我方对对方"的命中与"对方对我方"的闪避）：
   - `gap = attacker_spd - defender_spd`
   - `threshold = greatest(defender_spd, 50)`（避免 0 除）
   - 如果 `attacker_spd >= defender_spd * 3` 且 `gap >= 50` → **100% 命中、对方 0% 闪避**
   - 如果 `defender_spd >= attacker_spd * 3` 且 `-gap >= 50` → **0% 命中、对方 100% 闪避**
   - 否则：
     - `attacker_hit  = clamp(0.85 + gap / threshold * 0.15, 0.4, 0.99)`
     - `defender_dodge = clamp(0.05 + (-gap) / threshold * 0.5, 0.02, 0.95)`
     - 是否命中 = `random() < attacker_hit AND random() >= defender_dodge`
4. 命中则伤害 = `round(atk * (0.9 + random()*0.2))`，扣对方 HP。
5. 写回合事件，最长 30 回合，HP ≤ 0 即败；30 回合双方都活，按剩余 HP 百分比高者胜。

战斗结算：
- `wins/losses` 照常更新。
- **不修改任何属性、不修改 battle_power**。
- **排名顶替逻辑**：
  - 取 `me_rank`、`opp_rank`。
  - 仅当 `me 胜` 且 `opp_rank < me_rank`（对手排名更靠前）时执行：
    1. `UPDATE pets SET rank = rank + 1 WHERE rank >= opp_rank AND rank < me_rank;`（中间所有人下移一位）
    2. `UPDATE pets SET rank = opp_rank WHERE id = me.id;`
  - 其他情况（输 / 打赢比自己排名靠后的人 / 平局）排名不变。
- 写 `battles` 日志时附带 `rank_change: { from, to } | null`，前端可显示"挑战成功，升至第 X 名"。

返回 jsonb：`{ winner, events, my_new_rank, opp_new_rank, rank_changed }`。

---

## 前端改动

### `src/lib/beasts.ts`
- `computeBattlePower` 改成与后端一致的公式：`attack + hp`（不再乘 1+stage*0.5）。
- 新增 `computeAttack(p)`、`computeHp(p)` 便于 UI 展示。

### `src/lib/battle.ts`（前端模拟，只用于动画/本地预览）
- 同步重写为新的速度公式（与后端逻辑保持一致），保留 BattleEvent 结构。

### `src/routes/leaderboards.tsx`
- "战力榜" tab 改为：`order by rank asc`，显示「第 N 名 · 战力 X」，文案说明"排名通过挑战榜更换"。
- "属性榜""打卡榜"维持。
- 顶部"我的排名"卡片改用 rank 字段。

### `src/routes/arena.tsx`
- 候选对手列表只展示**排名比自己靠前**的对手（`rank < my_rank`），并标注「击败可升至第 N 名」。已排名第 1 时显示"已是榜首"。
- 战斗结算后若 `rank_changed`，toast 显示"挑战成功，升至第 X 名"；输则"挑战失败，排名不变"。

### `src/routes/friends.tsx`、`chat.$userId.tsx`
- 显示对方排名（"第 N 名"）替代之前的战力值（也可两者并显），无逻辑变更。

### 类型
- `Pet` / Row 类型加 `rank: number`。

---

## 不动的部分

- 进化奖励自由点（5 / 50 / 500 …）+ 批量加点逻辑保持不变。
- 锻炼影响属性的逻辑保持不变。
- 排名仅由「击败排名靠前者」改变；属性的累积不会自动改变排名。

## 摘要

战力值不再决定排名；排名是一条独立的"挑战榜"，只能通过在斗兽台击败排名靠前的对手取代其位次。战斗系统按速度差给出动态命中/闪避，差距足够大时 100% 单边压制。
