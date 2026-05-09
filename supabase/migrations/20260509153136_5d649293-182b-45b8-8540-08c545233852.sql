
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS free_points int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.run_battle(p_defender uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  me record; opp record;
  a_hp int; a_atk int; a_dodge numeric;
  d_hp int; d_atk int; d_dodge numeric;
  events jsonb := '[]'::jsonb;
  turn int := 0;
  attacker_is_me bool;
  dodged bool;
  variance numeric;
  dmg int;
  winner_is_me bool;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_defender = uid THEN RAISE EXCEPTION 'cannot fight self'; END IF;
  SELECT * INTO me FROM public.pets WHERE user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'no challenger pet'; END IF;
  SELECT * INTO opp FROM public.pets WHERE user_id = p_defender;
  IF NOT FOUND THEN RAISE EXCEPTION 'no defender pet'; END IF;
  a_hp := 100 + me.vitality * 5 + me.evolution_stage * 80;
  a_atk := 10 + me.strength * 2 + me.evolution_stage * 12;
  a_dodge := least(0.55, 0.05 + me.speed * 0.005);
  d_hp := 100 + opp.vitality * 5 + opp.evolution_stage * 80;
  d_atk := 10 + opp.strength * 2 + opp.evolution_stage * 12;
  d_dodge := least(0.55, 0.05 + opp.speed * 0.005);
  attacker_is_me := me.speed >= opp.speed;
  WHILE a_hp > 0 AND d_hp > 0 AND turn < 30 LOOP
    turn := turn + 1;
    dodged := random() < (CASE WHEN attacker_is_me THEN d_dodge ELSE a_dodge END);
    variance := 0.85 + random() * 0.3;
    dmg := 0;
    IF NOT dodged THEN
      dmg := greatest(1, round((CASE WHEN attacker_is_me THEN a_atk ELSE d_atk END) * variance)::int);
      IF attacker_is_me THEN d_hp := d_hp - dmg; ELSE a_hp := a_hp - dmg; END IF;
    END IF;
    events := events || jsonb_build_object(
      'turn', turn,
      'attacker', CASE WHEN attacker_is_me THEN me.name ELSE opp.name END,
      'defender', CASE WHEN attacker_is_me THEN opp.name ELSE me.name END,
      'damage', dmg, 'dodged', dodged,
      'defenderHp', greatest(0, CASE WHEN attacker_is_me THEN d_hp ELSE a_hp END),
      'text', CASE WHEN dodged
        THEN (CASE WHEN attacker_is_me THEN me.name ELSE opp.name END) || ' 出招，' || (CASE WHEN attacker_is_me THEN opp.name ELSE me.name END) || ' 灵巧闪避！'
        ELSE (CASE WHEN attacker_is_me THEN me.name ELSE opp.name END) || ' 一击造成 ' || dmg || ' 点伤害'
      END
    );
    attacker_is_me := NOT attacker_is_me;
  END LOOP;
  IF a_hp <= 0 AND d_hp > 0 THEN winner_is_me := false;
  ELSIF d_hp <= 0 AND a_hp > 0 THEN winner_is_me := true;
  ELSE winner_is_me := me.battle_power >= opp.battle_power; END IF;
  IF winner_is_me THEN
    UPDATE public.pets SET wins = wins + 1 WHERE id = me.id;
    UPDATE public.pets SET losses = losses + 1 WHERE id = opp.id;
  ELSE
    UPDATE public.pets SET losses = losses + 1 WHERE id = me.id;
    UPDATE public.pets SET wins = wins + 1 WHERE id = opp.id;
  END IF;
  INSERT INTO public.battles (challenger_id, defender_id, winner_id, log)
  VALUES (uid, p_defender, CASE WHEN winner_is_me THEN uid ELSE p_defender END, events);
  RETURN jsonb_build_object('winner', CASE WHEN winner_is_me THEN 'challenger' ELSE 'defender' END, 'events', events);
END;
$function$;

CREATE OR REPLACE FUNCTION public.evolve_pet()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  pet record;
  threshold int;
  new_stage int;
  granted int;
  new_bp int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO pet FROM public.pets WHERE user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'no pet'; END IF;
  IF pet.evolution_stage >= 5 THEN RAISE EXCEPTION 'max stage reached'; END IF;
  threshold := power(10, pet.evolution_stage + 1)::int;
  IF pet.strength < threshold OR pet.speed < threshold OR pet.vitality < threshold THEN
    RAISE EXCEPTION 'not enough attributes';
  END IF;
  new_stage := pet.evolution_stage + 1;
  granted := (5 * power(10, new_stage - 1))::int;
  new_bp := round((pet.strength * 3 + pet.speed * 2 + pet.vitality * 4) * (1 + new_stage * 0.5) + 100);
  UPDATE public.pets
    SET evolution_stage = new_stage, free_points = free_points + granted, battle_power = new_bp
    WHERE id = pet.id;
  RETURN jsonb_build_object('stage', new_stage, 'granted', granted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.allocate_points(p_str int, p_spd int, p_vit int)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  pet record;
  total int;
  new_str int; new_spd int; new_vit int;
  new_bp int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_str IS NULL OR p_spd IS NULL OR p_vit IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  IF p_str < 0 OR p_spd < 0 OR p_vit < 0 THEN RAISE EXCEPTION 'negative points'; END IF;
  total := p_str + p_spd + p_vit;
  IF total <= 0 THEN RAISE EXCEPTION 'zero allocation'; END IF;
  SELECT * INTO pet FROM public.pets WHERE user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'no pet'; END IF;
  IF total > pet.free_points THEN RAISE EXCEPTION 'exceeds free points'; END IF;
  new_str := pet.strength + p_str;
  new_spd := pet.speed + p_spd;
  new_vit := pet.vitality + p_vit;
  new_bp := round((new_str * 3 + new_spd * 2 + new_vit * 4) * (1 + pet.evolution_stage * 0.5) + 100);
  UPDATE public.pets
    SET strength = new_str, speed = new_spd, vitality = new_vit,
        free_points = free_points - total, battle_power = new_bp
    WHERE id = pet.id;
  RETURN jsonb_build_object('strength', new_str, 'speed', new_spd, 'vitality', new_vit, 'free_points', pet.free_points - total, 'battle_power', new_bp);
END;
$function$;
