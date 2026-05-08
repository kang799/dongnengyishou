
-- ===== exercise_logs: owner-only SELECT =====
DROP POLICY IF EXISTS "logs readable by all" ON public.exercise_logs;
CREATE POLICY "logs readable by owner"
  ON public.exercise_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ===== pets: lock down stat columns =====
-- keep RLS update policy (owner only), but only allow updating `name` via column grants
REVOKE UPDATE ON public.pets FROM anon, authenticated;
GRANT UPDATE (name) ON public.pets TO authenticated;

-- explicit deny DELETE policy for clarity
CREATE POLICY "pets no delete"
  ON public.pets FOR DELETE
  USING (false);

-- ===== display_name validation =====
CREATE OR REPLACE FUNCTION public.validate_display_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NULL OR length(trim(NEW.display_name)) = 0 THEN
    NEW.display_name := '道友·' || substr(NEW.id::text, 1, 6);
  END IF;
  -- Reject names that look like phone numbers / pure digit strings of length >= 7
  IF NEW.display_name ~ '^[0-9+\-\s]{7,}$' THEN
    NEW.display_name := '道友·' || substr(NEW.id::text, 1, 6);
  END IF;
  -- Cap length
  IF length(NEW.display_name) > 40 THEN
    NEW.display_name := substr(NEW.display_name, 1, 40);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_display_name ON public.profiles;
CREATE TRIGGER profiles_validate_display_name
  BEFORE INSERT OR UPDATE OF display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_display_name();

-- Scrub existing offending rows
UPDATE public.profiles
SET display_name = '道友·' || substr(id::text, 1, 6)
WHERE display_name ~ '^[0-9+\-\s]{7,}$';

-- ===== Server-side stat increment =====
CREATE OR REPLACE FUNCTION public.apply_exercise(p_exercise text, p_reps int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pet record;
  col text;
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

  new_bp := round((new_str * 3 + new_spd * 2 + new_vit * 4) * (1 + pet.evolution_stage * 0.5) + 100);

  UPDATE public.pets
  SET strength = new_str,
      speed = new_spd,
      vitality = new_vit,
      battle_power = new_bp
  WHERE id = pet.id;

  INSERT INTO public.exercise_logs (user_id, exercise_type, reps)
  VALUES (uid, p_exercise, p_reps);

  SELECT * INTO prof FROM public.profiles WHERE id = uid;
  IF FOUND AND (prof.last_checkin_date IS DISTINCT FROM today) THEN
    new_streak := CASE WHEN prof.last_checkin_date = today - 1 THEN prof.streak_days + 1 ELSE 1 END;
    UPDATE public.profiles
      SET last_checkin_date = today,
          streak_days = new_streak,
          last_active_at = now()
      WHERE id = uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_exercise(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_exercise(text,int) TO authenticated;

-- ===== Server-side battle =====
CREATE OR REPLACE FUNCTION public.run_battle(p_defender uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  new_bp int;
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
      'damage', dmg,
      'dodged', dodged,
      'defenderHp', greatest(0, CASE WHEN attacker_is_me THEN d_hp ELSE a_hp END),
      'text', CASE WHEN dodged
        THEN (CASE WHEN attacker_is_me THEN me.name ELSE opp.name END) || ' 出招，' || (CASE WHEN attacker_is_me THEN opp.name ELSE me.name END) || ' 灵巧闪避！'
        ELSE (CASE WHEN attacker_is_me THEN me.name ELSE opp.name END) || ' 一击造成 ' || dmg || ' 点伤害'
      END
    );
    attacker_is_me := NOT attacker_is_me;
  END LOOP;

  IF a_hp <= 0 AND d_hp > 0 THEN
    winner_is_me := false;
  ELSIF d_hp <= 0 AND a_hp > 0 THEN
    winner_is_me := true;
  ELSE
    winner_is_me := me.battle_power >= opp.battle_power;
  END IF;

  IF winner_is_me THEN
    new_bp := greatest(me.battle_power, opp.battle_power) + 5;
    UPDATE public.pets SET wins = wins + 1, battle_power = new_bp WHERE id = me.id;
    UPDATE public.pets SET losses = losses + 1 WHERE id = opp.id;
  ELSE
    UPDATE public.pets SET losses = losses + 1 WHERE id = me.id;
    UPDATE public.pets SET wins = wins + 1 WHERE id = opp.id;
  END IF;

  INSERT INTO public.battles (challenger_id, defender_id, winner_id, log)
  VALUES (uid, p_defender, CASE WHEN winner_is_me THEN uid ELSE p_defender END, events);

  RETURN jsonb_build_object(
    'winner', CASE WHEN winner_is_me THEN 'challenger' ELSE 'defender' END,
    'events', events
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_battle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_battle(uuid) TO authenticated;

-- ===== avatars bucket: stop listing, keep public CDN reads =====
-- Public CDN endpoint for `public = true` buckets bypasses RLS, so removing
-- the broad SELECT policy disables enumeration but avatars still load via URL.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public avatar read" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
