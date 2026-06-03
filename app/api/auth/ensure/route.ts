import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { accountId } from '@/lib/auth';
import { pickAccountEmail } from '@/lib/account';

// 登入前的「解析/自動建立帳號」入口(公開,無需既有身分)。
// 回傳該 (工號,姓名) 對應的 email,client 再用它 signInWithPassword(password=姓名)。
//   - 已建檔 → 回傳既存 email(既有使用者 email 永不變動,無痕)
//   - 未建檔 → 自動建 auth user + profile,挑一個唯一 email 後回傳
//   - 同工號不同名 → account_id 不同 → 視為獨立的一筆新帳號
// 真正的密碼驗證仍由後續 signInWithPassword 負責。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const empId = String(body.empId ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!empId || !name) {
    return NextResponse.json({ error: '工號、姓名為必填' }, { status: 400 });
  }

  const admin = createAdminClient();
  const acct = accountId(empId, name);

  // 既有帳號:回傳其不可變 email
  const { data: existing } = await admin
    .from('profiles').select('email').eq('account_id', acct).maybeSingle();
  if (existing?.email) {
    return NextResponse.json({ ok: true, created: false, email: existing.email });
  }

  // 新帳號:挑唯一 email → 建 auth user(password=姓名)→ 建 profile
  const email = await pickAccountEmail(admin, empId, name);
  const { error: e1 } = await admin.auth.admin.createUser({
    email,
    password: name,
    email_confirm: true,
    user_metadata: { emp_id: empId, name },
  });
  if (e1 && !/already|registered|exist/i.test(e1.message)) {
    return NextResponse.json({ error: `建立帳號失敗:${e1.message}` }, { status: 400 });
  }

  const { error: e2 } = await admin
    .from('profiles')
    .upsert({ emp_id: empId, name, email, is_admin: false, active: true },
            { onConflict: 'account_id' });
  if (e2) {
    return NextResponse.json({ error: `建立檔案失敗:${e2.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created: true, email });
}
