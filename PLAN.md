# 力行國泰接駁車預約系統 — Local 開發到雲端部署 Plan

> 從 `frontend.md` 的單檔 React 原型(localStorage 版)演進為可上雲、可協作、可備份的多人系統。
> 架構與部署流程沿用已驗證的 **dinbando**(便當訂購系統)範本,僅替換領域模型。
> 目標讀者:robotics / 系統整合工程背景,熟 Python/Go,前端 React 經驗中等。

---

## 0. TL;DR(一頁總覽)

**現狀**:`frontend.md` 是單檔 React 原型(工號+姓名登入、員工預約、admin 視角),所有資料存 localStorage,每個瀏覽器各自一份 — 管理員看不到員工的預約,接駁車排班無法彙總。

**最終目標**:Next.js 16 (App Router) + Supabase(Postgres + Auth + RLS)+ Vercel,$0/月 起跳,公司內部 < 500 人都在免費額度。

**與 dinbando 的關係**:同一套技術棧、同一套部署 SOP、同一組 sub-agent。**只換領域模型**:
| 概念 | dinbando(便當) | co-car(接駁車) |
|---|---|---|
| 核心交易 | Order(選餐點,有 item/price) | **Reservation**(訂位,無品項/價格) |
| 每日設定 | DailyMenu(admin 每天設菜單) | **無菜單** — 接駁車是固定服務 |
| 截止規則 | admin 設的 per-day deadline(存 DB) | **滾動規則**:預約日**前一天 17:00** 截止(算出來,非存值) |
| 特有約束 | 無 | **每日座位容量上限**(額滿不能再約) |
| 額外欄位 | note(辣度/忌口) | **return_note**(回程備註) |

**驗證策略**:三階段 — Local Docker 完整模擬 → Staging Supabase 真實串接 → Production Vercel 公開。每階段有明確 acceptance criteria,過了才往下。

**開發協作**:沿用 dinbando 的 6 個 sub-agent(architect / ux-designer / coder / tester / reviewer / migrator),`.claude/agents/*.md` 直接複用,設計成「換 model 不用改 prompt」。

**安全底線**:預設 `admin/admin123` 僅供測試;對外前在「使用者管理」改強密碼。token 檔(`sbp_*` / `vcp_*`)全程 gitignore + vercelignore。

---

## 0.1 規格確認(2026-06-01,使用者回覆 → 已納入)

| 問題 | 回覆 | schema 影響 |
|---|---|---|
| 座位容量 | **5 / 7 / 9 人**(依車型 / 班次,admin 可調) | `shuttle_slots.capacity`,每班次一個上限 |
| 班次 / 路線 | **力行廠 → 苗栗國泰**,三個發車時段 **07:30 / 08:00 / 08:30** | `reservations` 新增 `departure_time`;新增 `shuttle_slots` 表 |
| 截止時間 | 預約日前一天 17:00,**admin 可調** | `shuttle_config.cutoff_hour`(預設 17) |
| 路線地圖 | 加 **OpenStreetMap 小圖示**說明路線 | `shuttle_config.origin/destination/map_url`;UI 放角落,**不動原版面** |

> ⚠️ **比原型多一層「班次」維度**:原 `frontend.md` 只有「去程日期」;實際需要「日期 + 發車時段」。預約 = 選日期 + 選 07:30/08:00/08:30 其一,各班次獨立計算容量(5/7/9)。一人一日仍只一筆(PK 不變),`departure_time` 為欄位。
> 🗺️ **地圖不影響原 UI**:在 header「夏季專屬接駁車」標題旁、或日期欄位旁放一個低調的 `MapPin` 🗺️ icon,點擊才展開 OpenStreetMap(力行廠→苗栗國泰路線),預設收合,不佔版面。

---

## 1. 現況分析

### 1.1 既有功能盤點(來源:`frontend.md`)

| 模組 | 完成度 | 備註 |
|---|---|---|
| 工號 + 姓名登入(`LoginScreen`) | ✅ | 無密碼、無驗證,僅前端 state |
| 員工預約(`UserDashboard`) | ✅ | 一人一日一單,去程日期 + 回程備註 |
| 預約截止規則(每日 17:00 截止隔日) | ✅ | `minBookableDate`:17:00 前可約明天,後只能約後天 |
| 取消規則(預約日前一天 17:00 前可取消) | ✅ | `canCancel()` 計算 cutoff |
| 重複預約檢查(同日同人擋下) | ✅ | `isExist` 前端 some() |
| Admin 視角(看全部預約 / 統計 / 匯出) | ⚠️ | `frontend.md` 在第 181 行截斷,admin 區塊需依 dinbando 模式補齊 |
| 接駁車座位容量上限 | ❌ | 原型未實作,接駁車現實需要(車有座位數) |

> ⚠️ **`frontend.md` 是視覺與互動的唯一基準**(薄荷綠 / 翡翠 / 微黏土風格、🚐 圖示、圓角卡片)。遷移時 **UI 完全保留**,只換底層資料層。admin 區塊因原檔截斷,沿用 dinbando admin 的版面骨架 + co-car 配色。

### 1.2 上雲必須解決的問題(按優先級)

**P0 — 阻塞性**
1. **資料不共享**:localStorage per-browser,管理員看不到員工預約 → 無法排接駁車。系統最根本問題。
2. **沒有真正的身分驗證**:工號 `admin` 任何人都能輸入即取得管理權。

**P1 — 強烈建議**
3. **截止鎖定要在後端強制**:前端 `canCancel` 可被繞過,需用 RLS 在 DB 層鎖死「前一天 17:00」。
4. **座位容量上限**:接駁車座位有限,額滿要擋下(原型沒有,現實必須)。
5. **沒有資料備份**:清快取就消失。
6. **管理員白名單寫死**:換管理員要改 code 重 deploy。

**P2 — Nice to have**
7. LINE / Email 通知(明日發車提醒、額滿通知)。
8. 歷史統計(每月各部門搭乘人次)。
9. 多班次 / 多路線(目前假設單一接駁路線)。

### 1.3 規模假設(請確認)

- 使用人數:**約 50–200 人**(單一公司 / 廠區)。
- 日預約量:**< 200 筆/日**。
- 同時上線:**< 50 人**(每日 17:00 截止前的高峰)。
- 接駁車座位:**單班 20–45 座**(請提供實際數字,影響 `daily_capacity` 預設)。
- 資料量:每年 < 5 MB。
- 多廠區 / 多路線:**目前不考慮**(若要,schema 加 route 維度)。

→ 結論:**Supabase 免費方案綽綽有餘**(500 MB DB, 50,000 MAU)。

### 1.4 待確認問題(影響架構,請回覆)

| # | 問題 | 影響 | 預設假設 |
|---|---|---|---|
| Q1 | 接駁車**單班座位數**? | `shuttle_config.daily_capacity` | 暫設 20 |
| Q2 | 是否有**回程班次**需要分開預約? | 是否需要 trip_type 欄位 | 否,`return_note` 純文字備註即可 |
| Q3 | 週末 / 國定假日**是否發車**? | 可約日期過濾 | 暫不限制(全日期可約) |
| Q4 | 截止 17:00 是**固定**還是 admin 可調? | deadline 寫死 vs `shuttle_config.cutoff_hour` | 做成可調(預設 17) |
| Q5 | 公司有 email / Google Workspace 嗎? | Auth 方式 | 沿用 dinbando:工號當 email prefix + 密碼 |

---

## 2. 目標架構

### 2.1 雲端架構圖

```
       使用者瀏覽器(公司網路 / 手機)
             ↓ HTTPS
       ┌─────────────────┐
       │     Vercel      │  Next.js 16 (App Router)
       │   (前端 + API)   │  Server Component + Route Handler
       └────────┬────────┘
                ↓ @supabase/ssr
       ┌─────────────────┐
       │    Supabase     │  ┌─ Postgres (RLS 鎖死)
       │ (DB+Auth+RT)    │  ├─ Auth (工號+密碼,Custom Token Hook 注 emp_id/is_admin)
       │                 │  └─ Realtime (admin 即時看到新預約)
       └─────────────────┘
                ↑
       (Optional) Vercel Cron → LINE Messaging API → 明日發車提醒
```

### 2.2 技術棧(與 dinbando 完全一致,降低學習與維運成本)

| 元件 | 選擇 | 為什麼 |
|---|---|---|
| 前端框架 | **Next.js 16 App Router** | Vercel 原生、SSR、Server Action |
| UI | **Tailwind**(沿用 `frontend.md` 的 class) | 原型已用 Tailwind CDN,複製即可 |
| 資料庫 | **Supabase (Postgres)** | RLS 直接做權限、本機可 docker 跑 |
| Auth | **Supabase Auth** | 與 DB 同家,RLS 連動 |
| 部署 | **Vercel** | 自動 deploy、Edge、預覽環境 |
| SDK | `@supabase/ssr` + `@supabase/supabase-js` | 與 dinbando 同版本 |

> 不用 Firebase(NoSQL 難做排班彙總)、不用自架 VPS(維運成本高)。理由同 dinbando PLAN,不重複。

---

## 3. 資料模型設計

### 3.1 Schema(對齊 `frontend.md` 結構,精簡掉菜單概念)

```sql
-- ─────────────────────────────────────────────
-- 員工檔案 (Profile) — 與 dinbando 完全相同
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
-- 班次 (Slot) — 固定發車時段 + 各自座位上限,admin 可調
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
  ('07:30', 5, 1),
  ('08:00', 7, 2),
  ('08:30', 9, 3);

-- ─────────────────────────────────────────────
-- 預約 (Reservation) — 一人一日一單,(emp_id, date) 主鍵
-- 對應 frontend.md 的 reservations[] 物件,新增 departure_time 班次
-- ─────────────────────────────────────────────
create table reservations (
  emp_id         text references profiles(emp_id),
  date           date not null,                       -- 去程日期 (selectedDate)
  departure_time time not null references shuttle_slots(departure_time),  -- 選的班次
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
  origin       text default '力行廠',
  destination  text default '苗栗國泰',
  map_url      text default 'https://www.openstreetmap.org/directions?from=力行廠&to=苗栗國泰',
  updated_at   timestamptz default now()
);
insert into shuttle_config (id) values ('default');

-- ─────────────────────────────────────────────
-- View:每日 × 班次 預約彙總 (給 admin 排班 + 容量顯示用)
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
```

> **與 dinbando 的差異**:刪掉 `daily_menus` / `default_menu_config` / `daily_order_summary`;`orders`→`reservations` 並移除 `item_id/item_name/price`,改加 `return_note`;新增 `shuttle_config`。

### 3.2 滾動截止規則(co-car 特有,務必處理時區)

`frontend.md` 規則:**可預約日 = 17:00 前約明天 / 後約後天;取消 cutoff = 去程日前一天 17:00**。
等價於:**某去程日 `date` 的所有「新增 / 修改 / 取消」操作,必須在 `(date − 1 天) 的 cutoff_hour:00 (Asia/Taipei)` 之前完成。**

```sql
-- cutoff 瞬間 = 去程日前一天、台北時間 cutoff_hour 整點
-- Supabase DB 跑 UTC,務必加 at time zone 'Asia/Taipei',否則差 8 小時
create or replace function public.reservation_open(p_date date)
returns boolean
language sql stable
set search_path = ''
as $$
  select now() < (
    ((p_date - 1)::timestamp + make_interval(hours =>
        (select cutoff_hour from public.shuttle_config where id = 'default')))
    at time zone 'Asia/Taipei'
  );
$$;
```

> ⚠️ **時區是最容易踩的坑**:`(p_date - 1) + 17:00` 是「台北牆上時間」,要用 `at time zone 'Asia/Taipei'` 轉成正確的 timestamptz 瞬間再跟 `now()` 比。漏掉會整整差 8 小時,造成截止時間錯誤。

### 3.3 Row Level Security(零信任前端)

```sql
alter table profiles       enable row level security;
alter table reservations   enable row level security;
alter table shuttle_config enable row level security;
alter table shuttle_slots  enable row level security;

-- Profile:自己看自己;admin (claim) 看全部
create policy profiles_self_or_admin on profiles for select using (
  emp_id = (auth.jwt() ->> 'emp_id')
  or coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);

-- 設定 / 班次:所有登入者可讀(前端要顯示班次與容量);僅 admin 可寫
create policy config_read_all   on shuttle_config for select using (auth.uid() is not null);
create policy config_write_admin on shuttle_config for all using (
  coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);
create policy slots_read_all    on shuttle_slots for select using (auth.uid() is not null);
create policy slots_write_admin on shuttle_slots for all using (
  coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);

-- 預約:自己的可讀可寫;admin 全可讀
create policy reservations_self_rw on reservations for all using (
  emp_id = (auth.jwt() ->> 'emp_id')
);
create policy reservations_admin_read on reservations for select using (
  coalesce((auth.jwt() ->> 'is_admin')::boolean, false)
);

-- ── 截止鎖定:必須 RESTRICTIVE(AND 邏輯),否則被 self_rw 的 permissive 旁路 ──
-- (這是 dinbando 踩過的坑:permissive policy 之間是 OR,deadline 限制會失效)
create policy res_no_insert_past_cutoff on reservations
  as restrictive for insert with check ( public.reservation_open(date) );
create policy res_no_update_past_cutoff on reservations
  as restrictive for update using ( public.reservation_open(date) )
                                with check ( public.reservation_open(date) );
create policy res_no_delete_past_cutoff on reservations
  as restrictive for delete using ( public.reservation_open(date) );
```

> **座位容量檢查(per-slot)**:每個 `(date, departure_time)` 班次的已預約數不得超過 `shuttle_slots.capacity`(5/7/9)。純 RLS 難以原子地數「目前幾筆」擋第 N+1 筆(race condition)。用 **`before insert` trigger**:`count(*) where date=NEW.date and departure_time=NEW.departure_time >= capacity` 則 raise exception。trigger 在 DB 層原子執行,前端只負責顯示 `seats_left`(來自 `slot_reservation_summary` view)與額滿 disabled。

### 3.4 Custom Access Token Hook(注入 emp_id / is_admin,與 dinbando 相同)

沿用 dinbando 的 `custom_access_token_hook`(`security definer`、grant 給 `supabase_auth_admin`、`db push` 後需 Management API 啟用)。**一字不改可複用**,因為它只依賴 `profiles` 表,co-car 的 `profiles` 與 dinbando 完全相同。

---

## 4. 開發階段規劃

### 4.1 三個環境

| 環境 | 資料庫 | 用途 | 部署 |
|---|---|---|---|
| **Local** | docker Supabase stack(`supabase start`) | 開發機驗證 | `npm run dev` |
| **Staging** | Supabase Cloud 免費專案 | 同事 UAT | Vercel Preview |
| **Production** | Supabase Cloud 免費專案 | 正式上線 | Vercel Production |

### 4.2 Milestone 拆解(每個都可獨立驗收)

#### **M0 — 專案初始化 + 範本移植**(0.5 天)
- `npx create-next-app`(TS + Tailwind + App Router),對齊 dinbando `package.json`(Next 16 / React 19 / @supabase/ssr)。
- 複製 dinbando 的 `.claude/agents/*`、`workflow.md`、`lib/supabase/*`、`lib/auth.ts`、`lib/jwt.ts`、`middleware.ts`、`scripts/*`(這些與領域無關,可直接搬)。
- 把 `frontend.md` 的 HTML 原型存成 `legacy/原始接駁車app.html` 當視覺基準。
- 建 `CONTEXT.md`(co-car ubiquitous language)。
- **驗收**:`npm run dev` 起得來;`.claude/agents` 被 Claude Code 辨識。

#### **M1 — Local Supabase + Schema**(0.5 天)
```bash
supabase init && supabase start
supabase migration new init_schema      # 貼第 3.1 節
supabase migration new rls_policies      # 貼第 3.3 節
supabase migration new auth_hook         # 複用 dinbando hook + reservation_open()
supabase db reset                        # 套 migration + seed
```
- **驗收**:Studio(`:54323`)看得到 `profiles` / `reservations` / `shuttle_config`;seed 資料查得到;RLS 全 enabled。

#### **M2 — Next.js 連線 Supabase**(0.5 天)
- `lib/supabase/{client,server,admin,middleware}.ts` 直接複用 dinbando。
- 一個臨時 `/test` 頁顯示 `shuttle_config`,驗證連線。
- **驗收**:改 Studio 資料,前端重整即更新。

#### **M3 — Auth(工號+密碼,取代工號+姓名)**(0.5 天)
- 複用 dinbando `app/login/page.tsx`,UI 改成 `frontend.md` 的薄荷綠 🚐 風格(`from-teal-400 to-emerald-500`)。
- middleware 未登入導向 `/login`。
- **驗收**:未登入跳轉;登入後 `auth.users` + `profiles` 對得起來;session 持久;登出清 session;JWT 含 `emp_id` / `is_admin` claim。

#### **M4 — 核心預約遷移(localStorage → Supabase)**(1.5 天)
把 `frontend.md` 四個 localStorage 操作改成 Supabase:
| 原本(原型) | 改為 |
|---|---|
| `reservations` state 初值 localStorage | `useEffect` + `from('reservations').select()`(自己的) |
| `setReservations([...])` 新增 | `from('reservations').insert({emp_id, date, return_note})` |
| `handleCancel` filter 刪除 | `from('reservations').delete().match({emp_id, date})` |
| admin 看全部 | `from('reservations').select('*, profiles(name)')`(RLS 自動只放行 admin) |

- `minBookableDate` / `canCancel` 前端保留(即時 UX),但**真正鎖定靠 RLS**(第 3.2/3.3 節)。
- admin 頁:依去程日期分組列出乘客名單 + 匯出 CSV(複用 dinbando `lib/csv.ts`)。
- 加 **Realtime**:`channel('reservations').on('postgres_changes', {table:'reservations'})`,admin 即時看到新預約。
- **驗收**:見第 5.4 節 checklist。

#### **M5 — 截止鎖定 + 座位容量 + 使用者管理**(1 天)
- RLS restrictive 截止鎖定上線(第 3.3 節);前端過截止把按鈕 disabled + 提示。
- 座位容量 trigger / Route Handler(額滿擋下,回友善訊息)。
- 複用 dinbando `app/api/admin/users/route.ts` + `UserManager`(建員工 = 建 auth user + profile)。
- **驗收**:過 17:00 後無法新增/改/取消(API 直打也被擋);第 N+1 筆額滿被拒;admin 能新增員工並登入。

#### **M6 — Staging 上雲 + UAT**(0.5 天)
- 依 `deploy-supabase-vercel` skill 建 Supabase project、`db push`、啟用 auth hook、建 admin。
- Vercel preview deploy,找 3–5 位同事 dogfood。
- **驗收**:同事手機/公司網路可開;跑過 10 筆真實預約無 bug;admin 排班名單正確。

#### **M7 — Production 上線**(0.5 天)
- 正式 Supabase project + Vercel production + 綁網域。
- 匯入員工 profile 種子;`admin/admin123` 改強密碼。
- **驗收**:第 67 頁 skill 的三個決定性 curl 訊號全綠;admin 登入看得到管理 tab。

**累計**:約 **4.5–5.5 個工作天**(比 dinbando 略省,因無菜單模組)。

---

## 5. Local 測試與驗證

### 5.1 種子資料(`supabase/seed.sql`)

```sql
-- 1 個 admin
insert into profiles (emp_id, name, email, is_admin) values
  ('admin', '系統管理員', 'admin@test.local', true);

-- 5 個一般員工
insert into profiles (emp_id, name, email, department) values
  ('T12345', '王小明', 't12345@test.local', '研發部'),
  ('T12346', '林大華', 't12346@test.local', '研發部'),
  ('T12347', '陳美麗', 't12347@test.local', '業務部'),
  ('T12348', '黃小強', 't12348@test.local', '業務部'),
  ('T12349', '張小英', 't12349@test.local', '行政部');

-- 明日 + 後日預約(避開已截止的今日)
insert into reservations (emp_id, date, return_note) values
  ('T12345', current_date + 1, '約 18:30 回程'),
  ('T12346', current_date + 1, null),
  ('T12347', current_date + 2, '回程不搭');
```
> auth.users 由 `scripts/seed-auth.mjs` 補(統一密碼 `test1234`),admin 由 `scripts/create-admin.mjs` 建(`admin/admin123`)。

### 5.2 三層測試

| 層級 | 工具 | 跑什麼 |
|---|---|---|
| **Unit** | Vitest | `minBookableDate`、`canCancel`、CSV 格式化、時區換算 |
| **Integration** | Vitest + local Supabase | 「預約後查詢看得到」「過截止被 RLS 擋」 |
| **E2E** | Playwright | 登入 → 預約 → admin 看到 → 取消 |

### 5.3 重點:時區與截止的決定性測試

- 用 `set time zone` / 凍結 `now()`(或在測試 DB 插不同 `date`)驗證 `reservation_open()` 在 17:00 前後翻轉正確,且在 Asia/Taipei 而非 UTC。

### 5.4 M4 驗收清單

```markdown
### 員工流程
- [ ] T12345 登入,看到自己的預約(明日那筆)
- [ ] T12345 新增「後天」預約,提示成功,重整後仍在(從 DB,不是 localStorage)
- [ ] T12345 重複預約同一天 → 被擋(PK 衝突 / 友善訊息)
- [ ] T12345 取消未截止的預約,DB 那筆消失
- [ ] 切到「今日」(已過截止)→ 不能新增 / 取消,按鈕 disabled

### 管理員流程
- [ ] admin 登入,切「管理」視角
- [ ] 看到明日預約名單(王小明、林大華)+ 人數統計
- [ ] CSV 匯出,Excel 開啟中文不亂碼(UTF-8 BOM)

### Realtime
- [ ] A=admin、B=員工兩個瀏覽器,B 預約後 A < 2 秒看到

### 權限(零信任)
- [ ] T12345 在 console 跑 select 只看到自己的預約
- [ ] T12345 試圖刪 T12346 的預約 → RLS 拒絕
- [ ] 過截止後,直接打 API insert/delete → restrictive policy 擋下
- [ ] 未登入 anon 看不到任何資料
```

---

## 6. Dynamic Workflow(Claude Code Agent)

沿用 dinbando 的 `.claude/`,**直接複用**,只改 `migrator.md` 的「具體任務」段(指向 `frontend.md` 而非訂餐 app):

- **6 個 sub-agent**:`architect` / `ux-designer` / `coder` / `tester` / `reviewer` / `migrator`(定義見 dinbando `.claude/agents/*.md`)。
- **Model 策略**:architect / reviewer / ux-designer 用 opus;coder / tester / migrator 用 sonnet;量大時 tester 降 haiku。換 model 只改 frontmatter。
- **migrator 的 co-car 任務**:把 `frontend.md` 拆成
  - `app/login/page.tsx` ← `LoginScreen`(改密碼登入)
  - `components/ReservationApp.tsx` ← `UserDashboard` + admin 視角(viewRole 切換)
  - `components/AdminPanel.tsx`(排班名單 + CSV)
  - `components/UserManager.tsx`(複用 dinbando)
  - `lib/date.ts`(`minBookableDate` / `canCancel` 抽純函數)、`lib/csv.ts`
- **SOP**:接新需求 → architect 產 SQL+type → coder+tester 平行 → reviewer → 修 → 綠了 commit(細節見 dinbando `workflow.md`)。

---

## 7. 風險與替代方案

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| 時區處理錯,截止差 8 小時 | 中 | 高 | `reservation_open()` 強制 `at time zone 'Asia/Taipei'` + 跨午夜決定性測試 |
| 座位容量 race(同時搶最後一位) | 中 | 中 | trigger / Route Handler 包交易做原子檢查,不靠前端 |
| restrictive policy 寫成 permissive,截止失效 | 中 | 高 | dinbando 已踩過;明確用 `as restrictive`,並寫 API 直打測試 |
| 公司 IT 禁境外服務 | 中 | 高 | 整套可自架:docker-compose(Next + Postgres + Caddy)+ Authentik/Lucia |
| 員工抱怨 UX 改變 | 低 | 中 | UI 完全沿用 `frontend.md`,只換底層;登入改密碼需公告 |
| 接駁需求擴成多班次/多路線 | 中 | 中 | schema 預留:reservations 加 `route` / `slot`;config 改多列 |

---

## 8. 下一步行動

1. **請先回覆第 1.4 節 Q1–Q5**(座位數、回程班次、假日發車、截止可調、Auth 方式)— 影響 schema 細節。
2. **確認 PLAN 後**,進 M0/M1:初始化專案 + 本機 Supabase + schema(半天驗證概念)。
3. 之後逐 Milestone 推進,M6/M7 上雲前我會**再次回報並取得確認**(動到 Supabase Cloud / Vercel production 屬對外、需確認的動作)。

---

## Appendix A — 目標檔案結構

```
co-car/
├── .claude/
│   ├── agents/{architect,ux-designer,coder,tester,reviewer,migrator}.md   ← 複用 dinbando
│   └── workflow.md                                                        ← 複用 dinbando
├── CONTEXT.md                          ← co-car ubiquitous language(新建)
├── PLAN.md                             ← 本檔
├── frontend.md                         ← 視覺基準(原型)
├── legacy/原始接駁車app.html            ← frontend.md 原型備份
├── supabase/
│   ├── migrations/
│   │   ├── *_init_schema.sql           ← profiles / reservations / shuttle_config
│   │   ├── *_rls_policies.sql          ← RLS + restrictive 截止鎖定
│   │   └── *_auth_hook.sql             ← 複用 hook + reservation_open()
│   ├── seed.sql
│   └── config.toml
├── app/
│   ├── login/page.tsx                  ← LoginScreen(密碼版,薄荷綠風)
│   ├── page.tsx                        ← Server Component 守門 → ReservationApp
│   └── api/admin/users/route.ts        ← 複用 dinbando(建員工 = auth user + profile)
├── components/
│   ├── ReservationApp.tsx              ← UserDashboard + viewRole
│   ├── AdminPanel.tsx                  ← 排班名單 + CSV
│   └── UserManager.tsx                 ← 複用 dinbando
├── lib/
│   ├── supabase/{client,server,admin,middleware}.ts   ← 複用 dinbando
│   ├── auth.ts / jwt.ts                ← 複用 dinbando
│   ├── date.ts                         ← minBookableDate / canCancel(抽純函數)
│   └── csv.ts                          ← 複用 dinbando
├── scripts/{create-admin,seed-auth}.mjs ← 複用 dinbando
├── middleware.ts                       ← 複用 dinbando
├── .env.local.example / .gitignore / .vercelignore / next.config.ts
└── package.json
```

## Appendix B — 命令速查(同 dinbando)

```bash
# Local Supabase
supabase start / stop / db reset
supabase migration new <name>
supabase gen types typescript --local > types/database.ts

# Next.js
npm run dev / build / typecheck / lint

# Deploy(見 .claude/skills/deploy-supabase-vercel)
export SUPABASE_ACCESS_TOKEN=$(grep -oE 'sbp_[A-Za-z0-9]+' supabase-token-wicanr2.md | head -1)
supabase projects create / link / db push
# 啟用 auth hook(坑 1)→ 取 legacy JWT(坑 2)→ .vercelignore 錨定 /supabase/(坑 3)
vercel link / env add / deploy --prod
```
