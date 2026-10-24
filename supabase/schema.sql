create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  credits int not null default 5 check (credits >= 0),
  created_at timestamptz default now()
);
create table public.processed_orders (
  order_id text primary key, user_id uuid, created_at timestamptz default now()
);
alter table public.profiles enable row level security;
alter table public.processed_orders enable row level security;
create policy "ver mis creditos" on public.profiles for select using (auth.uid() = id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.consume_credit(uid uuid) returns int
language sql security definer set search_path = public as $$
  update profiles set credits = credits - 1 where id = uid and credits > 0 returning credits;
$$;

create function public.add_credits_once(uid uuid, amount int, order_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare result int;
begin
  insert into processed_orders(order_id, user_id) values (order_ref, uid) on conflict do nothing;
  if not found then return null; end if;
  update profiles set credits = credits + amount where id = uid returning credits into result;
  return result;
end $$;

revoke execute on function public.consume_credit(uuid) from public, anon, authenticated;
revoke execute on function public.add_credits_once(uuid, int, text) from public, anon, authenticated;
