// 為每個 profile 建立可登入的 auth.users (本機 / staging 種子)
// 用法:node scripts/seed-auth.mjs   (讀 .env.local)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// 簡易載入 .env.local
function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* ignore */ }
}
loadEnv(new URL('../.env.local', import.meta.url).pathname);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

async function findAuthUser(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

// 取出所有 profile 的 email
const { data: profiles, error } = await admin
  .from('profiles')
  .select('emp_id, email, name');
if (error) { console.error('讀 profiles 失敗:', error.message); process.exit(1); }

let created = 0, updated = 0, skipped = 0;
for (const p of profiles) {
  if (!p.email || !p.name) continue;
  const { error: e } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.name,
    email_confirm: true,
    user_metadata: { emp_id: p.emp_id, name: p.name },
  });
  if (e) {
    if (/already|exist|registered/i.test(e.message)) {
      const user = await findAuthUser(p.email);
      if (!user) {
        skipped++;
        console.error(`找不到已存在帳號: ${p.email}`);
        continue;
      }
      const { error: ue } = await admin.auth.admin.updateUserById(user.id, {
        password: p.name,
        email_confirm: true,
        user_metadata: { ...user.user_metadata, emp_id: p.emp_id, name: p.name },
      });
      if (ue) {
        skipped++;
        console.error(`同步 ${p.email} 失敗:`, ue.message);
      } else {
        updated++;
        console.log(`同步 auth user: ${p.email} (${p.emp_id} ${p.name})`);
      }
    } else { console.error(`建立 ${p.email} 失敗:`, e.message); }
  } else {
    created++;
    console.log(`建立 auth user: ${p.email} (${p.emp_id})`);
  }
}
console.log(`\n完成:新建 ${created}、同步 ${updated}、略過 ${skipped}。登入憑證:各使用者中文姓名`);
