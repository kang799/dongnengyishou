
-- profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  streak_days int not null default 0,
  last_checkin_date date,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable by all" on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

-- pets
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  name text not null,
  species text not null,
  strength int not null default 0,
  speed int not null default 0,
  vitality int not null default 0,
  evolution_stage int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  battle_power int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.pets enable row level security;
create policy "pets readable by all" on public.pets for select using (true);
create policy "pets insert own" on public.pets for insert with check (auth.uid() = user_id);
create policy "pets update own" on public.pets for update using (auth.uid() = user_id);

-- exercise logs
create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exercise_type text not null check (exercise_type in ('squat','pushup','situp')),
  reps int not null,
  created_at timestamptz not null default now()
);
alter table public.exercise_logs enable row level security;
create policy "logs readable by all" on public.exercise_logs for select using (true);
create policy "logs insert own" on public.exercise_logs for insert with check (auth.uid() = user_id);

-- battles
create table public.battles (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users on delete cascade,
  defender_id uuid not null references auth.users on delete cascade,
  winner_id uuid not null,
  log jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.battles enable row level security;
create policy "battles readable by all" on public.battles for select using (true);
create policy "battles insert participants" on public.battles
  for insert with check (auth.uid() = challenger_id);

-- Trigger: auto-create profile + pet on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  beasts text[] := array['饕餮','穷奇','梼杌','混沌','烛龙','毕方','九尾','应龙','重明','鲲','鹏','白泽','麒麟','化蛇','horse面','陆吾','英招','钦原','蛊雕','凤凰','朱雀','玄武','青龙','驺虞','犼','睚眦','狻猊','貔貅','狴犴','蒲牢','嘲风','椒图','负屃','螭吻','赑屃','囚牛'];
  rand_name text;
begin
  rand_name := beasts[1 + floor(random() * array_length(beasts,1))::int];
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into public.pets(user_id, name, species)
  values (new.id, rand_name, rand_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
