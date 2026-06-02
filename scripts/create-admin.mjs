// 一次性:在目標環境建立單一 admin 帳號(auth user + profile)。
// 讀 .env.production.local 取得 URL / service key / email domain。
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.production.local', 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);

// 優先用環境變數(可對本機/雲端),否則 fallback 到 .env.production.local
const url = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.DOMAIN ?? env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? 'test.local';

const empId = process.env.ADMIN_EMP_ID ?? 'admin';
const name = process.env.ADMIN_NAME ?? '系統管理員';
const pw = name; // 無密碼模式:中文姓名即登入憑證
const email = `${empId.toLowerCase()}@${domain}`;

const admin = createClient(url, key, { auth: { persistSession: false } });

// 先建 profile(hook 靠 email 對應 profile 注入 emp_id/is_admin)
const { error: pe } = await admin.from('profiles').upsert({
  emp_id: empId, name, is_admin: true, email, active: true,
});
if (pe) { console.error('profile 建立失敗:', pe.message); process.exit(1); }

// 再建 auth user(已存在則更新密碼)
const { error: ue } = await admin.auth.admin.createUser({
  email, password: pw, email_confirm: true, user_metadata: { emp_id: empId, name },
});
if (ue && !/already.*registered|already been registered/i.test(ue.message)) {
  console.error('auth user 建立失敗:', ue.message); process.exit(1);
}
if (ue) {
  // 已存在 → 找到並更新密碼
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (u) await admin.auth.admin.updateUserById(u.id, { password: pw, user_metadata: { emp_id: empId, name } });
  console.log(`✓ admin 已存在,密碼已更新:${email} / ${pw}`);
} else {
  console.log(`✓ admin 建立完成:${email} / ${pw}(工號 ${empId})`);
}
