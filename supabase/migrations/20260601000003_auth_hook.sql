-- ════════════════════════════════════════════════════════════
-- Custom Access Token Hook — 注入 emp_id / is_admin 到 JWT claims
-- (與 dinbando 完全相同;僅依賴 profiles 表,可原樣複用)
--
-- ⚠️ 雲端部署:db push 只建 function,不會讓 GoTrue 呼叫它。
--    需另用 Management API PATCH .../config/auth 設
--    hook_custom_access_token_enabled:true(見 deploy skill 坑 1)。
--    本機由 config.toml [auth.hook.custom_access_token] enabled=true 啟用。
-- ════════════════════════════════════════════════════════════

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims    jsonb;
  v_emp_id  text;
  v_admin   boolean;
begin
  select p.emp_id, p.is_admin
    into v_emp_id, v_admin
  from public.profiles p
  where p.email = (select u.email from auth.users u where u.id = (event->>'user_id')::uuid);

  claims := coalesce(event->'claims', '{}'::jsonb);

  if v_emp_id is not null then
    claims := jsonb_set(claims, '{emp_id}',   to_jsonb(v_emp_id));
    claims := jsonb_set(claims, '{is_admin}', to_jsonb(coalesce(v_admin, false)));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- GoTrue 以 supabase_auth_admin 角色執行 hook
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage  on schema public                              to supabase_auth_admin;
grant select on public.profiles                            to supabase_auth_admin;
