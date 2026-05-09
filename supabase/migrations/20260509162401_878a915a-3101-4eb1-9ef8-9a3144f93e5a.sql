
-- 1. 新增 rank 字段（先允许 NULL，回填后再加约束）
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS rank int;

-- 按现有 battle_power desc, created_at asc 给所有现存 pet 编号
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY battle_power DESC, created_at ASC) AS rn
  FROM public.pets
)
UPDATE public.pets p SET rank = o.rn FROM ordered o WHERE p.id = o.id;

ALTER TABLE public.pets ALTER COLUMN rank SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pets_rank_unique') THEN
    ALTER TABLE public.pets ADD CONSTRAINT pets_rank_unique UNIQUE (rank) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- 2. 重算所有现有 battle_power 为 attack + hp（不带阶位倍率）
UPDATE public.pets
  SET battle_power = (10 + strength * 2 + evolution_stage * 12) + (100 + vitality * 5 + evolution_stage * 80);

-- 3. handle_new_user：新宠物排到榜尾
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  beasts text[] := ARRAY['饕餮','穷奇','梼杌','混沌','烛龙','毕方','九尾','应龙','重明','鲲','鹏','白泽','麒麟','化蛇','陆吾','英招','钦原','蛊雕','凤凰','朱雀','玄武','青龙','驺虞','犼','睚眦','狻猊','貔貅','狴犴','蒲牢','嘲风','椒图','负屃','螭吻','赑屃','囚牛'];
  guest_flag boolean;
  proposed text;
  proposed_pet text;
  next_rank int;
BEGIN
  guest_flag := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
                OR new.email IS NULL OR new.email = '';

  proposed := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')), '');

  proposed_pet := nullif(trim(coalesce(new.raw_user_meta_data->>'pet_name','')), '');
  IF proposed_pet IS NULL THEN
    proposed_pet := beasts[1 + floor(random() * array_length(beasts,1))::int];
  END IF;

  INSERT INTO public.profiles(id, display_name, is_guest, last_active_at)
  VALUES (new.id, proposed, guest_flag, now());

  SELECT COALESCE(MAX(rank), 0) + 1 INTO next_rank FROM public.pets;
  INSERT INTO public.pets(user_id, name, species, rank)
  VALUES (new.id, proposed_pet, proposed_pet, next_rank);

  RETURN new;
END;
$function$;

-- 4. apply_exercise：新公式 battle_power = attack + hp
CREATE OR REPLACE FUNCTION public.apply_exercise(p_exercise text, p_reps integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  pet record;
  new_str int; new_spd int; new_vit int;
  new_bp int;
  today date := (now() AT TIME ZONE 'UTC')::date;
  prof record;
  new_streak int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_exercise NOT IN ('squat','pushup','situp') THEN RAISE EXCEPTION 'invalid exercise'; END IF;
  IF p_reps IS NULL OR p_reps < 1 OR p_reps > 200 THEN RAISE EXCEPTION 'invalid reps'; END IF;

  SELECT * INTO pet FROM public.pets WHERE user_id = uid LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no pet'; END IF;

  new_str := pet.strength;
  new_spd := pet.speed;
  new_vit := pet.vitality;
  IF p_exercise = 'squat'  THEN new_spd := new_spd + p_reps; END IF;
  IF p_exercise = 'pushup' THEN new_str := new_str + p_reps; END IF;
  IF p_exercise = 'situp'  THEN new_vit := new_vit + p_reps; END IF;

  new_bp := (10 + new_str * 2 + pet.evolution_stage * 12) + (100 + new_vit * 5 + pet.evolution_stage * 80);

  UPDATE public.pets
    SET strength = new_str, speed = new_spd, vitality = new_vit, battle_power = new_bp
    WHERE id = pet.id;

  INSERT INTO public.exercise_logs (user_id, exercise_type, reps)
  VALUES (uid, p_exercise, p_reps);

  SELECT * INTO prof FROM public.profiles WHERE id = uid;
  IF FOUND AND (prof.last_checkin_date IS DISTINCT FROM today) THEN
    new_streak := CASE WHEN prof.last_checkin_date = today - 1 THEN prof.streak_days + 1 ELSE 1 END;
    UPDATE public.profiles
      SET last_checkin_date = today, streak_days = new_streak, last_active_at = now()
      WHERE id = uid;
  END IF;
END;
$function$;

-- 5. evolve_pet：新公式
CREATE OR REPLACE FUNCTION public.evolve_pet()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  new_bp := (10 + pet.strength * 2 + new_stage * 12) + (100 + pet.vitality * 5 + new_stage * 80);
  UPDATE public.pets
    SET evolution_stage = new_stage, free_points = free_points + granted, battle_power = new_bp
    WHERE id = pet.id;
  RETURN jsonb_build_object('stage', new_stage, 'granted', granted);
END;
$function$;

-- 6. allocate_points：新公式
CREATE OR REPLACE FUNCTION public.allocate_points(p_str integer, p_spd integer, p_vit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  new_bp := (10 + new_str * 2 + pet.evolution_stage * 12) + (100 + new_vit * 5 + pet.evolution_stage * 80);
  UPDATE public.pets
    SET strength = new_str, speed = new_spd, vitality = new_vit,
        free_points = free_points - total, battle_power = new_bp
    WHERE id = pet.id;
  RETURN jsonb_build_object('strength', new_str, 'speed', new_spd, 'vitality', new_vit,
    'free_points', pet.free_points - total, 'battle_power', new_bp);
END;
$function$;

-- 7. run_battle：新速度机制 + 排名顶替
CREATE OR REPLACE FUNCTION public.run_battle(p_defender uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  me record; opp record;
  a_hp int; a_atk int; a_spd int; a_max_hp int;
  d_hp int; d_atk int; d_spd int; d_max_hp int;
  events jsonb := '[]'::jsonb;
  turn int := 0;
  attacker_is_me bool;
  att_spd int; def_spd int; att_atk int; att_name text; def_name text;
  gap int; threshold numeric;
  hit_chance numeric; dodge_chance numeric;
  forced_hit bool; forced_dodge bool;
  hit bool; dmg int;
  winner_is_me bool;
  me_rank_old int; opp_rank_old int;
  rank_changed bool := false;
  my_new_rank int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_defender = uid THEN RAISE EXCEPTION 'cannot fight self'; END IF;
  SELECT * INTO me FROM public.pets WHERE user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'no challenger pet'; END IF;
  SELECT * INTO opp FROM public.pets WHERE user_id = p_defender;
  IF NOT FOUND THEN RAISE EXCEPTION 'no defender pet'; END IF;

  a_atk := 10 + me.strength * 2 + me.evolution_stage * 12;
  a_max_hp := 100 + me.vitality * 5 + me.evolution_stage * 80;
  a_hp := a_max_hp;
  a_spd := me.speed;
  d_atk := 10 + opp.strength * 2 + opp.evolution_stage * 12;
  d_max_hp := 100 + opp.vitality * 5 + opp.evolution_stage * 80;
  d_hp := d_max_hp;
  d_spd := opp.speed;

  attacker_is_me := a_spd >= d_spd;

  WHILE a_hp > 0 AND d_hp > 0 AND turn < 30 LOOP
    turn := turn + 1;
    IF attacker_is_me THEN
      att_spd := a_spd; def_spd := d_spd; att_atk := a_atk;
      att_name := me.name; def_name := opp.name;
    ELSE
      att_spd := d_spd; def_spd := a_spd; att_atk := d_atk;
      att_name := opp.name; def_name := me.name;
    END IF;

    gap := att_spd - def_spd;
    threshold := greatest(def_spd, 50)::numeric;
    forced_hit := (att_spd >= def_spd * 3) AND (gap >= 50);
    forced_dodge := (def_spd >= att_spd * 3) AND ((-gap) >= 50);

    IF forced_hit THEN
      hit := true;
    ELSIF forced_dodge THEN
      hit := false;
    ELSE
      hit_chance := least(0.99, greatest(0.4, 0.85 + (gap::numeric / threshold) * 0.15));
      dodge_chance := least(0.95, greatest(0.02, 0.05 + ((-gap)::numeric / threshold) * 0.5));
      hit := (random() < hit_chance) AND (random() >= dodge_chance);
    END IF;

    dmg := 0;
    IF hit THEN
      dmg := greatest(1, round(att_atk * (0.9 + random() * 0.2))::int);
      IF attacker_is_me THEN d_hp := d_hp - dmg; ELSE a_hp := a_hp - dmg; END IF;
    END IF;

    events := events || jsonb_build_object(
      'turn', turn,
      'attacker', att_name,
      'defender', def_name,
      'damage', dmg,
      'dodged', NOT hit,
      'defenderHp', greatest(0, CASE WHEN attacker_is_me THEN d_hp ELSE a_hp END),
      'text', CASE WHEN NOT hit
        THEN att_name || ' 出招，' || def_name || ' 灵巧闪避！'
        ELSE att_name || ' 一击造成 ' || dmg || ' 点伤害'
      END
    );
    attacker_is_me := NOT attacker_is_me;
  END LOOP;

  IF a_hp <= 0 AND d_hp > 0 THEN winner_is_me := false;
  ELSIF d_hp <= 0 AND a_hp > 0 THEN winner_is_me := true;
  ELSE
    -- 30 回合双方都活：剩余 HP 百分比高者胜
    winner_is_me := (a_hp::numeric / a_max_hp) >= (d_hp::numeric / d_max_hp);
  END IF;

  -- 胜负记录
  IF winner_is_me THEN
    UPDATE public.pets SET wins = wins + 1 WHERE id = me.id;
    UPDATE public.pets SET losses = losses + 1 WHERE id = opp.id;
  ELSE
    UPDATE public.pets SET losses = losses + 1 WHERE id = me.id;
    UPDATE public.pets SET wins = wins + 1 WHERE id = opp.id;
  END IF;

  -- 排名顶替：仅当胜方原排名靠后（rank 大）时
  me_rank_old := me.rank;
  opp_rank_old := opp.rank;
  my_new_rank := me_rank_old;

  IF winner_is_me AND opp_rank_old < me_rank_old THEN
    -- 中间玩家（含败者）下移一位
    UPDATE public.pets
      SET rank = rank + 1
      WHERE rank >= opp_rank_old AND rank < me_rank_old;
    -- 胜者占据败者位置
    UPDATE public.pets SET rank = opp_rank_old WHERE id = me.id;
    rank_changed := true;
    my_new_rank := opp_rank_old;
  END IF;

  INSERT INTO public.battles (challenger_id, defender_id, winner_id, log)
  VALUES (uid, p_defender, CASE WHEN winner_is_me THEN uid ELSE p_defender END, events);

  RETURN jsonb_build_object(
    'winner', CASE WHEN winner_is_me THEN 'challenger' ELSE 'defender' END,
    'events', events,
    'rank_changed', rank_changed,
    'my_new_rank', my_new_rank,
    'opp_old_rank', opp_rank_old
  );
END;
$function$;
