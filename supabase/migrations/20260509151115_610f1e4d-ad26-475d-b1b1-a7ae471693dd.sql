
-- friend_requests
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null,
  to_user uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);
alter table public.friend_requests enable row level security;
create policy "fr read involved" on public.friend_requests for select using (auth.uid() = from_user or auth.uid() = to_user);

-- friendships (single row, user_a < user_b)
create table public.friendships (
  user_a uuid not null,
  user_b uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;
create policy "fs read involved" on public.friendships for select using (auth.uid() = user_a or auth.uid() = user_b);

-- is_friend helper
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.friendships
    where (user_a = least(a,b) and user_b = greatest(a,b))
  );
$$;

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  receiver_id uuid not null,
  content text not null check (length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> receiver_id)
);
create index messages_pair_idx on public.messages (sender_id, receiver_id, created_at);
create index messages_pair_rev_idx on public.messages (receiver_id, sender_id, created_at);
alter table public.messages enable row level security;
create policy "msg read involved" on public.messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "msg insert as sender to friend" on public.messages for insert with check (
  auth.uid() = sender_id and public.is_friend(sender_id, receiver_id)
);
create policy "msg update receiver mark read" on public.messages for update using (auth.uid() = receiver_id);

-- send_friend_request
create or replace function public.send_friend_request(p_to uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing record;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if uid = p_to then raise exception 'cannot add self'; end if;
  if public.is_friend(uid, p_to) then return 'already_friends'; end if;

  -- if other side already requested, accept directly
  select * into existing from public.friend_requests where from_user = p_to and to_user = uid and status = 'pending';
  if found then
    update public.friend_requests set status = 'accepted' where id = existing.id;
    insert into public.friendships(user_a, user_b) values (least(uid,p_to), greatest(uid,p_to))
      on conflict do nothing;
    return 'accepted';
  end if;

  insert into public.friend_requests(from_user, to_user, status)
  values (uid, p_to, 'pending')
  on conflict (from_user, to_user) do update set status = 'pending';
  return 'sent';
end;$$;

-- accept_friend_request
create or replace function public.accept_friend_request(p_from uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  update public.friend_requests set status = 'accepted'
    where from_user = p_from and to_user = uid and status = 'pending';
  if not found then raise exception 'no pending request'; end if;
  insert into public.friendships(user_a, user_b) values (least(uid,p_from), greatest(uid,p_from))
    on conflict do nothing;
end;$$;

-- decline_friend_request
create or replace function public.decline_friend_request(p_from uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  update public.friend_requests set status = 'declined'
    where from_user = p_from and to_user = uid and status = 'pending';
end;$$;

-- remove_friend
create or replace function public.remove_friend(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  delete from public.friendships
    where user_a = least(uid,p_other) and user_b = greatest(uid,p_other);
  delete from public.friend_requests
    where (from_user = uid and to_user = p_other) or (from_user = p_other and to_user = uid);
end;$$;

-- realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.friendships;
