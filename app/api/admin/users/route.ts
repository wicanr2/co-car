import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decodeClaims } from '@/lib/jwt';
import { empIdToEmail } from '@/lib/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

// 使用者管理 API(admin only)。
// 寫入一律走 service-role(繞 RLS),呼叫者身分用 server session 的 is_admin claim 把關。
// 建立員工需同時建 auth user + profile,故無法只靠前端 client。

async function isAdminCaller(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); // 驗 token 有效
  if (!user) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!(session && decodeClaims(session.access_token).is_admin);
}

// 員工規模小,單頁 listUsers 足夠以 email 反查 auth user
async function findAuthUser(admin: SupabaseClient, email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

const BAN_FOREVER = '876000h'; // ~100 年,等同停用登入

export async function GET() {
  if (!(await isAdminCaller())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('emp_id, name, department, is_admin, email, active, created_at')
    .order('emp_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function POST(req: Request) {
  if (!(await isAdminCaller())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const empId = (body.empId ?? '').trim();
  const name = (body.name ?? '').trim();
  if (!empId || !name) {
    return NextResponse.json({ error: '工號、姓名為必填' }, { status: 400 });
  }
  const password = name; // 無密碼模式:中文姓名即登入憑證
  const email = empIdToEmail(empId);
  const admin = createAdminClient();

  // 1) 建 auth user
  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { emp_id: empId, name },
  });
  if (e1 || !created?.user) {
    return NextResponse.json({ error: `建立帳號失敗:${e1?.message ?? '未知錯誤'}` }, { status: 400 });
  }

  // 2) 建 profile;失敗則回滾 auth user
  const { error: e2 } = await admin.from('profiles').insert({
    emp_id: empId,
    name,
    department: body.department || null,
    is_admin: !!body.isAdmin,
    email,
    active: true,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: `建立檔案失敗:${e2.message}` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!(await isAdminCaller())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const empId = (body.empId ?? '').trim();
  if (!empId) return NextResponse.json({ error: '缺少工號' }, { status: 400 });
  const admin = createAdminClient();

  // 更新 profile 欄位
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.department !== undefined) patch.department = body.department || null;
  if (body.isAdmin !== undefined) patch.is_admin = !!body.isAdmin;
  if (body.active !== undefined) patch.active = !!body.active;
  const { error: e1 } = await admin.from('profiles').update(patch).eq('emp_id', empId);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  // 同步 auth user(改名 → password=姓名 + metadata 同步;停用以 ban 擋登入)
  const needAuth = body.name !== undefined || body.active !== undefined;
  if (needAuth) {
    const authUser = await findAuthUser(admin, empIdToEmail(empId));
    if (authUser) {
      const upd: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const nm = String(body.name).trim();
        upd.password = nm; // 無密碼模式:姓名即憑證,改名同步
        upd.user_metadata = { ...authUser.user_metadata, name: nm, emp_id: empId };
      }
      if (body.active !== undefined) upd.ban_duration = body.active ? 'none' : BAN_FOREVER;
      await admin.auth.admin.updateUserById(authUser.id, upd);
    }
  }
  return NextResponse.json({ ok: true });
}
