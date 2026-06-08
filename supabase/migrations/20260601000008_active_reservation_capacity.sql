-- Cancelled reservations remain in history but must not consume seat capacity.
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
  from public.shuttle_slots
  where departure_time = new.departure_time and active;

  if v_capacity is null then
    raise exception '班次 % 不存在或已停駛', new.departure_time
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
  from public.shuttle_slots s
  left join public.reservations r
    on r.departure_time = s.departure_time
   and r.date = p_date
   and r.status = 'active'
  where s.active
  group by s.departure_time, s.capacity
  order by s.departure_time;
$$;

grant execute on function public.get_slot_availability(date) to anon, authenticated;
