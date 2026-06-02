---
name: deploy-supabase-vercel
description: 把這個 Next.js + Supabase 專案部署到正式環境:Supabase cloud(建 project / link / db push / 啟用 auth hook / 建 admin)+ Vercel CLI production。內含本次實測過的四個踩坑修正。觸發:要把 dinbando / order_meal_system 上雲、建雲端 Supabase、設 Vercel production、或重跑部署流程時。
---

# 部署 SOP:Supabase Cloud + Vercel

實測流程(2026-06)。token 檔 `supabase-token-wicanr2.md`(`sbp_*`)、`vercel-token-wicanr2.md`(`vcp_*`)皆 gitignore;以下命令都需對外網路。

## ⚠️ 四個踩過的坑(先看這個)

1. **auth hook 要另外啟用**:`db push` 只建 `custom_access_token_hook` function,**不會讓 GoTrue 呼叫它**。需用 Management API `PATCH /v1/projects/{ref}/config/auth` 設 `hook_custom_access_token_enabled:true`。
2. **新 project 的新格式 key 可能無效**:`sb_publishable_*` / `sb_secret_*` 在新 project 預設未啟用 → `Invalid API key`。改用 legacy JWT(`api-keys` 裡 `name=anon` / `name=service_role`,`eyJ...`)。
3. **`.vercelignore` 必須根目錄錨定**:寫 `supabase/`(無前導 `/`)會依 gitignore 語法匹配任意層級,連 `lib/supabase/` 一起排除上傳 → build `Can't resolve '@/lib/supabase/*'`。寫 `/supabase/`。
4. **移除只供本機的頁**:如 service-role 的連線測試頁(`app/test`),正式環境不該暴露。

## A. Supabase Cloud

```bash
export SUPABASE_ACCESS_TOKEN=$(grep -oE 'sbp_[A-Za-z0-9]+' supabase-token-wicanr2.md | head -1)
supabase orgs list                      # 取 org id
# 建 project(db 密碼自動產生並存 gitignored 檔)
DBPW=$(openssl rand -hex 20)
printf 'SUPABASE_DB_PASSWORD=%s\n' "$DBPW" > .deploy-secrets.local   # 確認 .gitignore 有此檔
supabase projects create "order-meal-system" --org-id <ORG> --db-password "$DBPW" --region ap-northeast-2
# link + 推 migrations(非互動)
export SUPABASE_DB_PASSWORD=$DBPW
supabase link --project-ref <REF>
echo y | supabase db push
# 啟用 auth hook(坑 1)
curl -s -X PATCH "https://api.supabase.com/v1/projects/<REF>/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"hook_custom_access_token_enabled":true,"hook_custom_access_token_uri":"pg-functions://postgres/public/custom_access_token_hook"}'
# 取 legacy JWT keys(坑 2)→ 寫 .env.production.local
supabase projects api-keys --project-ref <REF> -o json   # 取 name=anon / name=service_role
```

`.env.production.local`(gitignore):`NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co`、`NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>`、`SUPABASE_SERVICE_ROLE_KEY=<service JWT>`、`NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN=test.local`。

建 admin:`docker exec ... node scripts/create-admin.mjs`(讀 .env.production.local,先 upsert profile 再 createUser;預設 admin/admin123)。

## B. Vercel

```bash
VTOKEN=$(grep -oE '[A-Za-z0-9_]{20,}' vercel-token-wicanr2.md | head -1)
vercel whoami --token "$VTOKEN"
# link 需要 --scope(否則 CLI 只提示不執行)
vercel link --yes --project order-meal-system --scope <SCOPE> --token "$VTOKEN"
# 逐一設 production env(值走 stdin,避免 shell 跳脫)
while IFS= read -r l; do K=${l%%=*}; V=${l#*=}; printf '%s' "$V" | vercel env add "$K" production --token "$VTOKEN" --scope <SCOPE>; done < .env.production.local
# 部署
vercel deploy --prod --yes --token "$VTOKEN" --scope <SCOPE>
vercel inspect <deployment-url> --token "$VTOKEN" --scope <SCOPE>   # 取 production alias
```

`.vercelignore`(坑 3、4):
```
*-token-*.md
.env*.local
.deploy-secrets.local
/legacy/
/supabase/
/scripts/
/.docker-home/
```

## C. 驗證(決定性訊號)

- `curl -s -o /dev/null -w '%{http_code}' <URL>/login` → 200;`/` → 307
- `curl <URL>/api/admin/users` → `{"error":"forbidden"}` 403(證明 serverless route 正常、未登入被擋)
- 瀏覽器登入 admin → 應拿到 `is_admin` claim、看到 4 個 tab(驗證 cloud auth hook 生效)

## D. 機密與安全

- gitignore + .vercelignore 同時涵蓋:`*-token-*.md`、`.env*.local`、`.deploy-secrets.local`
- token 若曾貼進對話/檔案 → 部署後輪換
- 弱密碼(admin123)僅供測試,對外前在「使用者管理」改強密碼
- `supabase db reset` 後雲端不受影響;本機需重跑 `scripts/seed-auth.mjs`
