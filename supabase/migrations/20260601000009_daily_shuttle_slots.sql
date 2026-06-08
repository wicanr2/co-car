-- Allow each service date to have independent shuttle slots.
-- shuttle_slots remains the default template; daily_shuttle_slots overrides it per date.
create table if not exists public.daily_shuttle_slots (
  service_date   date not null,
  departure_time time not null,
  capacity       int not null,
  active         boolean default true,
  sort_order     int default 0,
  updated_at     timestamptz default now(),
  primary key (service_date, departure_time)
);

alter table public.daily_shuttle_slots enable row level security;

drop policy if exists daily_slots_read_all on public.daily_shuttle_slots;
create policy daily_slots_read_all on public.daily_shuttle_slots
  for select using (auth.uid() is not null);

drop policy if exists daily_slots_write_admin on public.daily_shuttle_slots;
create policy daily_slots_write_admin on public.daily_shuttle_slots
  for all using (coalesce((auth.jwt() ->> 'is_admin')::boolean, false));

insert into public.daily_shuttle_slots (service_date, departure_time, capacity, active, sort_order, updated_at)
select d.date, s.departure_time, s.capacity, s.active, s.sort_order, now()
from (select distinct date from public.reservations) d
cross join public.shuttle_slots s
on conflict (service_date, departure_time) do nothing;

create or replace function public.get_daily_slots(p_date date)
returns table (
  service_date    date,
  departure_time  time,
  capacity        int,
  active          boolean,
  sort_order      int
)
language sql
stable
security definer
set search_path = ''
as $$
  with has_daily as (
    select exists (
      select 1 from public.daily_shuttle_slots ds where ds.service_date = p_date
    ) as yes
  )
  select *
  from (
    select p_date as service_date, ds.departure_time, ds.capacity, coalesce(ds.active, true) as active, coalesce(ds.sort_order, 0) as sort_order
    from public.daily_shuttle_slots ds
    where ds.service_date = p_date
    union all
    select p_date as service_date, s.departure_time, s.capacity, coalesce(s.active, true) as active, coalesce(s.sort_order, 0) as sort_order
    from public.shuttle_slots s
    cross join has_daily h
    where not h.yes
  ) slots
  order by slots.sort_order, slots.departure_time;
$$;

grant execute on function public.get_daily_slots(date) to anon, authenticated;

create or replace function public.check_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity int;
  v_booked   int;
begin
  if coalesce(new.status, 'active') <> 'active' then
    return new;
  end if;

  select capacity into v_capacity
  from public.get_daily_slots(new.date)
  where departure_time = new.departure_time and active;

  if v_capacity is null then
    raise exception '班次 % 在 % 不存在或已停駛', new.departure_time, new.date
      using errcode = 'check_violation';
  end if;

  select count(*) into v_booked
  from public.reservations
  where date = new.date
    and departure_time = new.departure_time
    and status = 'active'
    and id is distinct from new.id;

  if v_booked >= v_capacity then
    raise exception '% 班次 % 已額滿(上限 % 位)', new.date, new.departure_time, v_capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.get_slot_availability(p_date date)
returns table (
  departure_time time,
  capacity       int,
  booked         bigint,
  seats_left     bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.departure_time,
    s.capacity,
    count(r.*)              as booked,
    s.capacity - count(r.*) as seats_left
  from public.get_daily_slots(p_date) s
  left join public.reservations r
    on r.departure_time = s.departure_time
   and r.date = p_date
   and r.status = 'active'
  where s.active
  group by s.departure_time, s.capacity, s.sort_order
  order by s.sort_order, s.departure_time;
$$;

grant execute on function public.get_slot_availability(date) to anon, authenticated;

drop view if exists public.slot_reservation_summary;
create view public.slot_reservation_summary as
select
  r.date,
  r.departure_time,
  s.capacity,
  count(*)                              as booked,
  s.capacity - count(*)                 as seats_left,
  array_agg(p.name order by p.name)     as passengers
from public.reservations r
join public.profiles p on p.account_id = r.account_id
join lateral (
  select capacity
  from public.get_daily_slots(r.date) ds
  where ds.departure_time = r.departure_time
  limit 1
) s on true
where r.status = 'active'
group by r.date, r.departure_time, s.capacity;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_shuttle_slots'
  ) then
    alter publication supabase_realtime add table public.daily_shuttle_slots;
  end if;
end;
$$;
