import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decodeClaims } from '@/lib/jwt';
import { accountId } from '@/lib/auth';
import { pickAccountEmail } from '@/lib/account';
import type { SupabaseClient } from '@supabase/supabase-js';

// 使用者管理 API(admin only)。
// 身分鍵為 account_id = 工號|姓名。寫入一律走 service-role(繞 RLS),
// 呼叫者身分用 server session 的 is_admin claim 把關。
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
    .select('account_id, emp_id, name, department, is_admin, email, active, created_at')
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
  const admin = createAdminClient();
  const email = await pickAccountEmail(admin, empId, name); // 唯一 email(legacy 優先,撞名退 hex)

  // 1) 建 auth user(password=姓名,無密碼模式)
  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email,
    password: name,
    email_confirm: true,
    user_metadata: { emp_id: empId, name },
  });
  if (e1 || !created?.user) {
    return NextResponse.json({ error: `建立帳號失敗:${e1?.message ?? '未知錯誤'}` }, { status: 400 });
  }

  // 2) 建 profile;account_id 由 trigger 推導,email 用上面挑的;失敗則回滾 auth user
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
  const acct = (body.acct ?? '').trim();
  if (!acct) return NextResponse.json({ error: '缺少帳號鍵' }, { status: 400 });
  const admin = createAdminClient();

  // 取目前 profile(改名時要用其不可變 email 反查 auth user)
  const { data: cur, error: eCur } = await admin
    .from('profiles').select('emp_id, name, email').eq('account_id', acct).maybeSingle();
  if (eCur || !cur) return NextResponse.json({ error: '找不到使用者' }, { status: 404 });

  const newName = body.name !== undefined ? String(body.name).trim() : cur.name;
  const renamed = body.name !== undefined && newName !== cur.name;

  // 更新 profile 欄位。改名 → trigger 重算 account_id,reservations 經 FK on update cascade 跟著搬;
  // email 維持不變(opaque),故 auth↔profile 對應不受影響。
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = newName;
  if (body.department !== undefined) patch.department = body.department || null;
  if (body.isAdmin !== undefined) patch.is_admin = !!body.isAdmin;
  if (body.active !== undefined) patch.active = !!body.active;
  const { error: e1 } = await admin.from('profiles').update(patch).eq('account_id', acct);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  // 同步 auth user(以不可變 email 反查;改名 → password=新姓名;停用 → ban)
  const needAuth = renamed || body.active !== undefined;
  if (needAuth && cur.email) {
    const authUser = await findAuthUser(admin, cur.email);
    if (authUser) {
      const upd: Record<string, unknown> = {};
      if (renamed) {
        upd.password = newName; // email 不變,只換登入憑證(姓名)
        upd.user_metadata = { ...authUser.user_metadata, name: newName, emp_id: cur.emp_id };
      }
      if (body.active !== undefined) upd.ban_duration = body.active ? 'none' : BAN_FOREVER;
      await admin.auth.admin.updateUserById(authUser.id, upd);
    }
  }
  return NextResponse.json({ ok: true, account_id: renamed ? accountId(cur.emp_id, newName) : acct });
}
