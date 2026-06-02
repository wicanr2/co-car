-- ════════════════════════════════════════════════════════════
-- 力行國泰接駁車預約系統 — 初始 schema
-- 對應 PLAN.md 第 3.1 節,對齊 frontend.md 原型 + 多班次規格
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 員工檔案 (Profile) — 與 dinbando 相同
-- ─────────────────────────────────────────────
create table profiles (
  emp_id      text primary key,            -- 對應 LoginScreen 的 userId
  name        text not null,               -- 對應 userName
  department  text,                         -- 給統計用
  is_admin    boolean default false,        -- 取代寫死的 admin 白名單
  email       text unique,                  -- Supabase Auth 連結用
  active      boolean default true,         -- 離職員工改 false,不刪資料
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 班次 (Slot) — 固定發車時段 + 各自座位上限 (admin 可調)
-- 力行廠 → 苗栗國泰,07:30 / 08:00 / 08:30
-- ─────────────────────────────────────────────
create table shuttle_slots (
  departure_time time primary key,           -- '07:30' / '08:00' / '08:30'
  capacity       int not null,               -- 該班次座位上限 (5 / 7 / 9)
  active         boolean default true,        -- 停駛改 false,不刪
  sort_order     int default 0,
  updated_at     timestamptz default now()
);
insert into shuttle_slots (departure_time, capacity, sort_order) values
  ('08:40', 5, 1);

-- ─────────────────────────────────────────────
-- 預約 (Reservation) — 一人一日一單,(emp_id, date) 主鍵
-- ─────────────────────────────────────────────
create table reservations (
  emp_id         text references profiles(emp_id),
  date           date not null,                       -- 去程日期 (selectedDate)
  departure_time time not null references shuttle_slots(departure_time),  -- 班次
  return_note    text,                                 -- 回程備註 (returnNote),選填
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  primary key (emp_id, date)                  -- 同人同日只能一筆(任一班次)
);

create index idx_reservations_date on reservations(date);
create index idx_reservations_emp  on reservations(emp_id);
create index idx_reservations_slot on reservations(date, departure_time);  -- 容量計數用

-- ─────────────────────────────────────────────
-- 接駁車營運設定 (截止時數 / 路線 / 地圖)
-- ─────────────────────────────────────────────
create table shuttle_config (
  id           text primary key default 'default',
  cutoff_hour  int not null default 17,      -- 截止時數(去程日「前一天」的此整點截止)
  service_name text default '夏季專屬接駁車',
  origin       text default '新竹市東區力行路11號',
  destination  text default '苗栗縣竹南鎮國泰路20號',
  map_url      text default 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=24.7846%2C120.9971%3B24.6889%2C120.8745',
  updated_at   timestamptz default now()
);
insert into shuttle_config (id) values ('default');

-- ─────────────────────────────────────────────
-- View:每日 × 班次 預約彙總 (admin 排班 + 容量顯示)
-- ─────────────────────────────────────────────
create view slot_reservation_summary as
select
  r.date,
  r.departure_time,
  s.capacity,
  count(*)                                 as booked,
  s.capacity - count(*)                    as seats_left,
  array_agg(p.name order by p.name)        as passengers
from reservations r
join profiles p       on p.emp_id = r.emp_id
join shuttle_slots s  on s.departure_time = r.departure_time
group by r.date, r.departure_time, s.capacity;
