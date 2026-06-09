-- Daily slots can use times that are not present in the default template.
alter table public.reservations
  drop constraint if exists reservations_departure_time_fkey;
