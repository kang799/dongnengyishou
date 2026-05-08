-- 1) Add guest tracking columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();

-- 2) Update handle_new_user to detect guest from raw_user_meta_data.is_guest or anonymous user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  beasts text[] := array['饕餮','穷奇','梼杌','混沌','烛龙','毕方','九尾','应龙','重明','鲲','鹏','白泽','麒麟','化蛇','陆吾','英招','钦原','蛊雕','凤凰','朱雀','玄武','青龙','驺虞','犼','睚眦','狻猊','貔貅','狴犴','蒲牢','嘲风','椒图','负屃','螭吻','赑屃','囚牛'];
  rand_name text;
  guest_flag boolean;
begin
  rand_name := beasts[1 + floor(random() * array_length(beasts,1))::int];
  guest_flag := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
                or new.email is null
                or new.email = '';
  insert into public.profiles(id, display_name, is_guest, last_active_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name',
             case when guest_flag then '游客·' || substr(new.id::text,1,6) else split_part(coalesce(new.email,''),'@',1) end),
    guest_flag,
    now()
  );
  insert into public.pets(user_id, name, species)
  values (new.id, rand_name, rand_name);
  return new;
end;
$function$;

-- Ensure trigger exists on auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 3) Cleanup function: delete guests inactive for 30+ days
CREATE OR REPLACE FUNCTION public.cleanup_inactive_guests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  victim_ids uuid[];
  deleted_count integer;
begin
  select array_agg(id) into victim_ids
  from public.profiles
  where is_guest = true
    and last_active_at < now() - interval '30 days';

  if victim_ids is null then
    return 0;
  end if;

  delete from public.exercise_logs where user_id = any(victim_ids);
  delete from public.battles where challenger_id = any(victim_ids) or defender_id = any(victim_ids);
  delete from public.pets where user_id = any(victim_ids);
  delete from public.profiles where id = any(victim_ids);
  delete from auth.users where id = any(victim_ids);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  return array_length(victim_ids, 1);
end;
$$;

-- 4) Schedule daily cleanup via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-inactive-guests-daily') THEN
    PERFORM cron.unschedule('cleanup-inactive-guests-daily');
  END IF;
  PERFORM cron.schedule(
    'cleanup-inactive-guests-daily',
    '0 3 * * *',
    $cron$ select public.cleanup_inactive_guests(); $cron$
  );
END $$;

-- 5) Allow users to update their own last_active via existing profiles update policy (auth.uid() = id) — no change needed.