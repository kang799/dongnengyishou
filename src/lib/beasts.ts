// 山海经异兽名录
export const SHANHAIJING_BEASTS = [
  "饕餮","穷奇","梼杌","混沌","烛龙","毕方","九尾狐","应龙","重明","鲲",
  "鹏","白泽","麒麟","化蛇","马腹","陆吾","英招","钦原","蛊雕","凤凰",
  "朱雀","玄武","青龙","驺虞","犼","睚眦","狻猊","貔貅","狴犴","蒲牢",
  "嘲风","椒图","负屃","螭吻","赑屃","囚牛","刑天","夸父","精卫","相柳",
  "肥遗","当康","乘黄","并封","开明兽","三足乌","太岁","旱魃","奚仲",
  "讙","彘","鸓","䮝","狰","蛫","耳鼠","朱厌","狡","㹈","蜚","鸩",
];

export function randomBeast(): string {
  return SHANHAIJING_BEASTS[Math.floor(Math.random() * SHANHAIJING_BEASTS.length)];
}

// 进化阶段名
export const STAGE_TITLES = ["初生灵兽", "化形异兽", "通灵神兽", "上古凶兽", "天地圣兽", "鸿蒙创世"];

// 第 N 次进化所需每属性最低值: stage 0->1 需10, 1->2 需100, 2->3 需1000 ...
export function evolutionThreshold(currentStage: number): number {
  return Math.pow(10, currentStage + 1);
}

export function canEvolve(stage: number, str: number, spd: number, vit: number) {
  if (stage >= STAGE_TITLES.length - 1) return false;
  const t = evolutionThreshold(stage);
  return str >= t && spd >= t && vit >= t;
}

export function totalAttr(p: { strength: number; speed: number; vitality: number }) {
  return p.strength + p.speed + p.vitality;
}

export function computeBattlePower(p: { strength: number; speed: number; vitality: number; evolution_stage: number }) {
  return Math.round(
    (p.strength * 3 + p.speed * 2 + p.vitality * 4) * (1 + p.evolution_stage * 0.5) + 100
  );
}

// 第 N 次进化（new_stage = 1,2,3,...）奖励的自由属性点：5, 50, 500, 5000, 50000
export function evolutionPointsGranted(newStage: number): number {
  return 5 * Math.pow(10, Math.max(0, newStage - 1));
}
