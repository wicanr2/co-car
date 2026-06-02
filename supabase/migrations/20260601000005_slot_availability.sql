-- ════════════════════════════════════════════════════════════
-- get_slot_availability(date):各班次剩餘座位(不含乘客姓名)
--
-- 為什麼需要:RLS 下一般員工 select reservations 只看得到自己那筆,
-- 無法算出各班次已被預約幾位。此函數 security definer 繞 RLS 做
-- 「計數」,但「只回數字、不回姓名」,讓員工知道是否額滿而不洩漏隱私。
-- admin 要看乘客名單則直接 select reservations(admin RLS 放行)。
-- ════════════════════════════════════════════════════════════

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
    count(r.*)                 as booked,
    s.capacity - count(r.*)    as seats_left
  from public.shuttle_slots s
  left join public.reservations r
    on r.departure_time = s.departure_time and r.date = p_date
  where s.active
  group by s.departure_time, s.capacity
  order by s.departure_time;
$$;

grant execute on function public.get_slot_availability(date) to anon, authenticated;
