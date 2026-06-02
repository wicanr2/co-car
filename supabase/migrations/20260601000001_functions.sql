-- ════════════════════════════════════════════════════════════
-- 領域函數:滾動截止判斷 + 班次容量檢查 trigger
-- (RLS policy 與容量限制都依賴這兩個,故先於 rls_policies 建立)
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- reservation_open(date):該去程日是否仍在可預約期間內
--   可預約 = now() < 去程日「前一天」 cutoff_hour:00 (Asia/Taipei)
--   security definer:確保能讀 shuttle_config,不受呼叫者 RLS 影響
-- ⚠️ 時區:(date-1)+cutoff 是台北牆上時間,必須 at time zone 'Asia/Taipei'
--    轉成正確 timestamptz 再跟 now() 比,否則差 8 小時。
-- ─────────────────────────────────────────────
create or replace function public.reservation_open(p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select now() < (
    ((p_date - 1)::timestamp
       + make_interval(hours => (select cutoff_hour from public.shuttle_config where id = 'default')))
    at time zone 'Asia/Taipei'
  );
$$;

grant execute on function public.reservation_open(date) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 班次容量檢查 trigger:某 (date, departure_time) 的已預約數
--   不得超過 shuttle_slots.capacity。
--   security definer:必須能數「所有人」的預約(否則 RLS 只讓使用者
--   看到自己那筆,count 永遠 < capacity,限制失效)。
-- ─────────────────────────────────────────────
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
    and not (emp_id = new.emp_id and date = new.date);  -- 排除自己(改班次時不重複計)

  if v_booked >= v_capacity then
    raise exception '% 班次 % 已額滿(上限 % 位)', new.date, new.departure_time, v_capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_check_slot_capacity
  before insert or update on public.reservations
  for each row execute function public.check_slot_capacity();
