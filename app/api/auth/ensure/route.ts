import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { accountId } from '@/lib/auth';
import { pickAccountEmail } from '@/lib/account';
import type { SupabaseClient } from '@supabase/supabase-js';

function isBuiltinAdmin(empId: string, name: string): boolean {
  return empId.trim().toLowerCase() === 'admin' && name.trim() === '系統管理員';
}

async function findAuthUser(admin: SupabaseClient, email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  empId: string,
  name: string,
) {
  const existing = await findAuthUser(admin, email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: name,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, emp_id: empId, name },
    });
    if (!error) return { ok: true as const, created: false as const };
    return { ok: false as const, error: error.message };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: name,
    email_confirm: true,
    user_metadata: { emp_id: empId, name },
  });
  if (error && !/already|registered|exist/i.test(error.message)) {
    return { ok: false as const, error: error.message };
  }

  if (!created?.user) {
    const recheck = await findAuthUser(admin, email);
    if (!recheck) {
      return { ok: false as const, error: error?.message ?? '建立登入帳號失敗' };
    }
    const { error: repairErr } = await admin.auth.admin.updateUserById(recheck.id, {
      password: name,
      email_confirm: true,
      user_metadata: { ...recheck.user_metadata, emp_id: empId, name },
    });
    if (repairErr) return { ok: false as const, error: repairErr.message };
    return { ok: true as const, created: false as const };
  }

  return { ok: true as const, created: true as const };
}

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
  const builtinAdmin = isBuiltinAdmin(empId, name);

  // 既有帳號:回傳其不可變 email,並確保 auth user 存在且登入憑證同步。
  const { data: existing } = await admin
    .from('profiles').select('email, is_admin, active').eq('account_id', acct).maybeSingle();
  if (existing?.email) {
    if (builtinAdmin && (!existing.is_admin || !existing.active)) {
      const { error } = await admin
        .from('profiles')
        .update({ is_admin: true, active: true, updated_at: new Date().toISOString() })
        .eq('account_id', acct);
      if (error) {
        return NextResponse.json({ error: `更新管理員身分失敗:${error.message}` }, { status: 400 });
      }
    }
    if (!builtinAdmin && existing.active === false) {
      return NextResponse.json({ error: '此帳號已停用' }, { status: 403 });
    }
    const repaired = await ensureAuthUser(admin, existing.email, empId, name);
    if (!repaired.ok) {
      return NextResponse.json({ error: `登入帳號修復失敗:${repaired.error}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, created: false, email: existing.email });
  }

  // 新帳號:挑唯一 email → 建 profile → 建 auth user(登入憑證=姓名)
  const email = await pickAccountEmail(admin, empId, name);
  const { error: e2 } = await admin
    .from('profiles')
    .upsert({ emp_id: empId, name, email, is_admin: builtinAdmin, active: true },
            { onConflict: 'account_id' });
  if (e2) {
    return NextResponse.json({ error: `建立檔案失敗:${e2.message}` }, { status: 400 });
  }

  const repaired = await ensureAuthUser(admin, email, empId, name);
  if (!repaired.ok) {
    return NextResponse.json({ error: `建立登入帳號失敗:${repaired.error}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created: true, email });
}
