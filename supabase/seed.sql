-- ════════════════════════════════════════════════════════════
-- 種子資料 (PLAN.md 第 5.1 節) — supabase db reset 會自動套用
-- 提供一個「跟正式環境一樣的測試世界」
-- 註:auth.users 由 scripts/seed-auth.mjs 另外補(統一密碼 test1234);
--     admin 帳號由 scripts/create-admin.mjs 建(admin/admin123)。
-- ════════════════════════════════════════════════════════════

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

-- 明日 + 後日預約(避開已過截止的今日;遠低於各班次容量)
insert into reservations (emp_id, date, departure_time, return_note) values
  ('T12345', current_date + 1, '08:40', '約 18:30 回程'),
  ('T12346', current_date + 1, '08:40', null),
  ('T12347', current_date + 2, '08:40', '回程不搭');
