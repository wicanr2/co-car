-- Keep cancelled reservations as reportable history instead of deleting rows.
alter table public.reservations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists status text not null default 'active',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_reason text,
  add column if not exists cancellation_history jsonb not null default '[]'::jsonb;

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check check (status in ('active', 'cancelled'));

update public.reservations
set id = gen_random_uuid()
where id is null;

alter table public.reservations
  alter column id set not null;

alter table public.reservations
  drop constraint if exists reservations_pkey;

alter table public.reservations
  add constraint reservations_pkey primary key (id);

create unique index if not exists reservations_one_active_per_account_date
  on public.reservations(account_id, date)
  where status = 'active';

create index if not exists idx_reservations_account_date on public.reservations(account_id, date);
create index if not exists idx_reservations_date_status on public.reservations(date, status);

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
join public.profiles p       on p.account_id = r.account_id
join public.shuttle_slots s  on s.departure_time = r.departure_time
where r.status = 'active'
group by r.date, r.departure_time, s.capacity;
