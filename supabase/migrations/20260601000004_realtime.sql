-- 讓 reservations 表的變動可被 Realtime 推播(admin 即時看到新預約)
alter publication supabase_realtime add table public.reservations;
