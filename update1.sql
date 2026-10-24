alter table public.profiles add column if not exists last_gen timestamptz;

-- Devuelve: créditos restantes | null = sin créditos | -1 = espera (5 s entre imágenes)
create or replace function public.consume_credit(uid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype; r int;
begin
  select * into p from public.profiles where id = uid for update;
  if not found or p.credits <= 0 then return null; end if;
  if p.last_gen is not null and p.last_gen > now() - interval '5 seconds' then return -1; end if;
  update public.profiles set credits = credits - 1, last_gen = now() where id = uid returning credits into r;
  return r;
end $$;

create or replace function public.refund_credit(uid uuid) returns void
language sql security definer set search_path = public as $$
  update public.profiles set credits = credits + 1, last_gen = null where id = uid;
$$;

revoke execute on function public.consume_credit(uuid) from public, anon, authenticated;
revoke execute on function public.refund_credit(uuid) from public, anon, authenticated;
