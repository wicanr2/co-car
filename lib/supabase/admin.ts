import { createClient } from '@supabase/supabase-js';

// 僅 server 端使用的 service-role client(繞過 RLS)。
// 切勿在 Client Component import,否則 secret key 會進前端 bundle。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
