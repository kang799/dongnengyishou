import { computeBattlePower } from "./beasts";

export type BattlePet = {
  name: string;
  species: string;
  strength: number;
  speed: number;
  vitality: number;
  evolution_stage: number;
};

export type BattleEvent = {
  turn: number;
  attacker: string;
  defender: string;
  damage: number;
  dodged: boolean;
  defenderHp: number;
  text: string;
};

export type BattleResult = {
  events: BattleEvent[];
  winner: "challenger" | "defender";
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function simulateBattle(
  challenger: BattlePet,
  defender: BattlePet,
  seed = Date.now()
): BattleResult {
  const rand = rng(seed);
  const mkSide = (p: BattlePet) => ({
    name: p.name,
    hp: 100 + p.vitality * 5 + p.evolution_stage * 80,
    atk: 10 + p.strength * 2 + p.evolution_stage * 12,
    dodge: Math.min(0.55, 0.05 + p.speed * 0.005),
    pet: p,
  });
  const A = mkSide(challenger);
  const D = mkSide(defender);
  // 谁速度高谁先手
  const firstChallenger = challenger.speed >= defender.speed;
  const events: BattleEvent[] = [];
  let turn = 0;
  let order = firstChallenger ? [A, D] : [D, A];
  while (A.hp > 0 && D.hp > 0 && turn < 30) {
    turn++;
    const [att, def] = order;
    const dodged = rand() < def.dodge;
    let dmg = 0;
    if (!dodged) {
      const variance = 0.85 + rand() * 0.3;
      dmg = Math.max(1, Math.round(att.atk * variance));
      def.hp -= dmg;
    }
    events.push({
      turn,
      attacker: att.name,
      defender: def.name,
      damage: dmg,
      dodged,
      defenderHp: Math.max(0, def.hp),
      text: dodged
        ? `${att.name} 出招，${def.name} 灵巧闪避！`
        : `${att.name} 一击造成 ${dmg} 点伤害`,
    });
    order = [def, att];
  }
  // 决定胜负
  let winner: "challenger" | "defender";
  if (A.hp <= 0 && D.hp <= 0) {
    winner = computeBattlePower(challenger) >= computeBattlePower(defender) ? "challenger" : "defender";
  } else if (A.hp <= 0) winner = "defender";
  else if (D.hp <= 0) winner = "challenger";
  else winner = computeBattlePower(challenger) >= computeBattlePower(defender) ? "challenger" : "defender";
  return { events, winner };
}
