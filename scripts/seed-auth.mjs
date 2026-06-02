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
const PASSWORD = process.env.SEED_PASSWORD || 'test1234';

if (!URL_ || !SERVICE) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// 取出所有 profile 的 email
const { data: profiles, error } = await admin
  .from('profiles')
  .select('emp_id, email, name');
if (error) { console.error('讀 profiles 失敗:', error.message); process.exit(1); }

let created = 0, skipped = 0;
for (const p of profiles) {
  if (!p.email) continue;
  const { error: e } = await admin.auth.admin.createUser({
    email: p.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { emp_id: p.emp_id, name: p.name },
  });
  if (e) {
    if (/already|exist|registered/i.test(e.message)) { skipped++; }
    else { console.error(`建立 ${p.email} 失敗:`, e.message); }
  } else {
    created++;
    console.log(`建立 auth user: ${p.email} (${p.emp_id})`);
  }
}
console.log(`\n完成:新建 ${created}、已存在略過 ${skipped}。統一密碼:${PASSWORD}`);
