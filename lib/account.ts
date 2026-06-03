import type { SupabaseClient } from '@supabase/supabase-js';
import { legacyEmail, disambigEmail } from './auth';

// 為「新帳號」挑一個唯一 email(server 端,需 service-role admin client)。
// 規則:工號@domain 沒被別人占就用它(與既有雲端格式一致、無痕);
//      同工號已被別的姓名占用 → 退到 工號.hex(姓名)@domain 以區隔。
// 既有帳號請勿用此函式;改以 account_id 查 profile 取回其既存 email。
export async function pickAccountEmail(
  admin: SupabaseClient,
  empId: string,
  name: string,
): Promise<string> {
  const legacy = legacyEmail(empId);
  const { data } = await admin
    .from('profiles').select('account_id').eq('email', legacy).maybeSingle();
  return data ? disambigEmail(empId, name) : legacy;
}
