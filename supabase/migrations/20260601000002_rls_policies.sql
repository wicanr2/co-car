-- ════════════════════════════════════════════════════════════
-- Row Level Security — 零信任前端 (PLAN.md 第 3.3 節)
--
-- admin 判斷一律用 JWT 的 is_admin claim(由 auth hook 注入),
-- 不在 profiles policy 內 select profiles → 避免遞迴。
-- 截止鎖定用 RESTRICTIVE policy(AND 邏輯),否則會被 self_rw 的
-- permissive policy 以 OR 旁路(dinbando 踩過的坑)。
-- ════════════════════════════════════════════════════════════

alter table profiles       enable row level security;
alter table reservations   enable row level security;
alter table shuttle_config enable row level security;
alter table shuttle_slots  enable row level security;

-- ── Profile:自己看自己;admin (claim) 看全部 ──
create policy profiles_self_or_admin on profiles for select using (
  emp_id = (auth.jwt() ->> 'emp_id')
  or coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);

-- ── 設定 / 班次:登入者可讀;僅 admin 可寫 ──
create policy config_read_all    on shuttle_config for select using (auth.uid() is not null);
create policy config_write_admin on shuttle_config for all using (
  coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);
create policy slots_read_all     on shuttle_slots for select using (auth.uid() is not null);
create policy slots_write_admin  on shuttle_slots for all using (
  coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);

-- ── 預約:自己的可讀可寫;admin (claim) 全可讀 ──
create policy reservations_self_rw on reservations for all using (
  emp_id = (auth.jwt() ->> 'emp_id')
);
create policy reservations_admin_read on reservations for select using (
  coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);

-- ── 截止鎖定 (RESTRICTIVE):過了「前一天 cutoff」不能新增/改/取消 ──
-- service_role(seed / admin API)有 BYPASSRLS,不受影響。
create policy res_no_insert_past_cutoff on reservations
  as restrictive for insert with check ( public.reservation_open(date) );

create policy res_no_update_past_cutoff on reservations
  as restrictive for update
  using ( public.reservation_open(date) )
  with check ( public.reservation_open(date) );

create policy res_no_delete_past_cutoff on reservations
  as restrictive for delete using ( public.reservation_open(date) );
