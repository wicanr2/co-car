# CONTEXT — 力行國泰接駁車預約系統 Ubiquitous Language

> 命名變數、寫文件、agent 溝通一律優先使用下列術語。新概念先進這份再用。
> 格式:`Term — definition. _Avoid_: forbidden synonyms`

## 核心名詞

- **Profile** — 員工檔案,主鍵 emp_id。對應原型的 `userInfo`。_Avoid_: user, account, member。
- **emp_id** — 員工工號(如 `T12345`),登入與所有資料的關聯鍵。_Avoid_: uid, userId, staffNo。
- **Reservation** — 一筆接駁車預約,主鍵 (emp_id, date),一人一日一筆。對應原型的 `reservations[]`。_Avoid_: order, booking, ticket。
- **Slot / departure_time** — 發車班次時段(`07:30` / `08:00` / `08:30`),去程從力行廠出發。_Avoid_: schedule, trip, time(太籠統)。
- **capacity** — 某班次座位上限(5 / 7 / 9),存 `shuttle_slots.capacity`,admin 可調。_Avoid_: limit, seats(指剩餘時用 seats_left)。
- **seats_left** — 某 (date, slot) 的剩餘座位 = capacity − booked。來自 view `slot_reservation_summary`。
- **cutoff / cutoff_hour** — 預約截止規則:去程日**前一天** `cutoff_hour:00`(預設 17:00,Asia/Taipei)。過了不能新增 / 改 / 取消。_Avoid_: deadline, lockTime(deadline 是 dinbando 用語,本專案是滾動規則不存值)。
- **return_note** — 回程備註(純文字,選填),對應原型的 `returnNote`。_Avoid_: comment, remark。
- **Admin** — 管理員(profiles.is_admin = true),可設班次容量 / 截止 / 看全部預約 / 匯出 / 管理員工。取代寫死白名單。
- **viewRole** — admin 在「員工視角 / 管理視角」之間切換的前端狀態。

## 路線

- **origin** — 力行廠(出發)。**destination** — 苗栗國泰(目的)。
- **map_url** — OpenStreetMap 路線連結;UI 以低調 MapPin icon 呈現,點開才展開,**不影響原版面**。

## 環境

- **Local** — 本機 docker Supabase stack(`supabase start`),port 整體 +10 避開 dinbando(api 54331 / db 54332 / studio 54333)。_Avoid_: dev。
- **Staging** — Supabase Cloud + Vercel Preview,給同事 UAT。
- **Production** — Supabase Cloud + Vercel Production,正式上線。

## 認證(沿用 dinbando 決策)

- **工號+密碼登入** — 無密碼:工號+中文姓名,姓名當 Supabase 密碼(`signInWithPassword`)。_Avoid_: SSO, OAuth。
- **emp_id / is_admin claim** — 經 Custom Access Token Hook 注入 JWT,供 RLS policy 使用。

## 角色 (Claude Code sub-agents)

- **architect / ux-designer / coder / tester / reviewer / migrator** — 沿用 dinbando `.claude/agents/*.md`。

## Flagged ambiguities(待釐清)

- 5/7/9 與 07:30/08:00/08:30 的對應是否固定?目前 seed 設 07:30→5、08:00→7、08:30→9,admin 可改。
- 週末 / 國定假日是否發車?目前不限制可約日期(Q3 待確認)。
- 是否需要回程獨立班次預約?目前 return_note 為純文字備註,不獨立排班(Q2 待確認)。
