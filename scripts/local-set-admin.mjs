// 本機用:把 admin 帳號密碼設為 admin123(讀 .env.local)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? 'test.local';
const email = `admin@${domain}`;
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
if (!u) { console.error('找不到 admin 帳號'); process.exit(1); }
// 無密碼模式:admin 以「工號 admin + 姓名 系統管理員」登入,密碼 = 姓名
await admin.auth.admin.updateUserById(u.id, { password: '系統管理員', user_metadata: { emp_id: 'admin', name: '系統管理員' } });
console.log(`✓ admin 憑證已設為姓名「系統管理員」(工號 admin / ${email})`);
