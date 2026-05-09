## 目标

1. **战斗不再影响战力**：胜负只更新 `wins/losses`，不再 `+5` 战力。
2. **战力只来自三种锻炼 + 进化**：蹲起→速度、俯卧撑→力量、仰卧起坐→体质，已正确（保持）；进化新增「自由属性点」奖励。
3. **进化奖励自由点**：第 1 次进化 +5、第 2 次 +50、第 3 次 +500 …（公式 `5 × 10^(stage−1)`，stage 为进化后阶位）。
4. **批量加点**：用户在异兽页可一次性把自由点分配到 力量 / 速度 / 体质 任意组合，提交后才入库并重算战力。

## 数据库改动（migration）

### pets 表
- 新增字段 `free_points int not null default 0`。

### 函数
- **`evolve_pet()`**（新建，SECURITY DEFINER）
  - 校验登录 + canEvolve（三属性 ≥ 10^(当前阶+1)）
  - `evolution_stage += 1`
  - `free_points += 5 * 10^(new_stage - 1)`（new_stage=1→5、2→50、3→500…）
  - 重算 battle_power = `(str*3 + spd*2 + vit*4) * (1 + new_stage*0.5) + 100`
  - 返回 `{ stage, free_points_granted }`

- **`allocate_points(p_str int, p_spd int, p_vit int)`**（新建，SECURITY DEFINER）
  - 校验三个数都 ≥ 0、合计 > 0、合计 ≤ pet.free_points
  - 一次性 `strength += p_str` 等
  - `free_points -= 合计`
  - 重算 battle_power
  - 返回更新后的 pet

- **`run_battle()`**（修改）
  - 删掉 `new_bp := greatest(me.battle_power, opp.battle_power) + 5;` 与对应的 `battle_power = new_bp`。
  - 仅更新 `wins / losses`、写战斗日志。

## 前端改动

### `src/lib/beasts.ts`
- 新增 `evolutionPointsGranted(newStage: number)` = `5 * 10^(newStage - 1)`。

### `src/routes/pet.tsx`
- Pet 类型补 `free_points`。
- `evolve()` 改为调用 `supabase.rpc("evolve_pet")`，提示 `已得 N 点自由属性`。
- 新增「自由属性点」面板（仅当 `free_points > 0` 时显示）：
  - 顶部展示：`剩余自由点 N`
  - 三行：力量 / 速度 / 体质，每行 `−` 数字输入 `+`，下方有「全部加力量 / 速度 / 体质」快捷按钮
  - 总计实时显示「将分配 X 点 / 剩余 Y 点」
  - 「重置」「确认分配」两个按钮
  - 提交时调用 `supabase.rpc("allocate_points", { p_str, p_spd, p_vit })`，成功后 `load()`

### 文案
- 战斗结算/竞技场页面（`arena.tsx`）若有「战力 +5」之类提示一并去掉（确认无即可）。

## 不动的部分
- `apply_exercise` 已经正确：锻炼 → 属性 → 战力，保留不变。
- 排行榜、道友、聊天等读取逻辑不变（仍读 `battle_power` / 三属性）。
- 进化阈值（需各属性达 10^(stage+1)）保持不变；自由点是「奖励」，可以叠加在已有属性上继续推进下一阶。

## 摘要
战斗只算胜负，不再加战力；战力只能靠每日锻炼累积属性 + 进化奖励的自由点（5 / 50 / 500 …）批量加成而提升。