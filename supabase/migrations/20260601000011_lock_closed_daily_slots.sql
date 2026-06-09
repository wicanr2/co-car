-- Closed service dates are historical records. Daily slot overrides must remain immutable.
create or replace function public.prevent_closed_daily_slot_changes()
returns trigger
language plpgsql
as $$
declare
  service_date date;
begin
  service_date := case when tg_op = 'DELETE' then old.service_date else new.service_date end;

  if not public.reservation_open(service_date) then
    raise exception '此日期已成為歷史紀錄,不可變動';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_prevent_closed_daily_slot_changes on public.daily_shuttle_slots;
create trigger trg_prevent_closed_daily_slot_changes
  before insert or update or delete on public.daily_shuttle_slots
  for each row execute function public.prevent_closed_daily_slot_changes();
