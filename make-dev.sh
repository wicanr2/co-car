#!/usr/bin/env bash
# 一鍵恢復 co-car 本機環境(重開機後用)。
# 本機跑 production 模式(next build + start),原因見下方註記。
# 用法:bash make-dev.sh
set -e
cd "$(dirname "$0")"

echo "▶ 啟動本機 Supabase stack(port 54331-54334)…"
supabase start --workdir "$PWD" >/dev/null
echo "  ✓ Supabase up"

echo "▶ 啟動 app(production 模式,docker,port 3101)…"
echo "  (Turbopack dev server 在本機 docker 環境 client 端不 hydrate → 登入卡載入中;"
echo "   故本機改用 next build+start,與 Vercel 部署同款,登入正常)"
docker compose -f docker-compose.local.yml up -d >/dev/null

echo -n "▶ 等待 build + start ready(首次約 1 分鐘)"
for i in $(seq 1 100); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3101/login 2>/dev/null || true)
  if [ "$code" = "200" ]; then echo " ✓ (login=200)"; break; fi
  echo -n "."; sleep 3
done

cat <<EOF

────────────────────────────────────────────
  本機環境就緒:
    App     http://127.0.0.1:3101
    Studio  http://127.0.0.1:54333
    登入     admin / 系統管理員  (管理員,工號+姓名)
            A200112 / 張永裕   (員工,名單內任一人)
────────────────────────────────────────────
  改 code 後重新套用:docker compose -f docker-compose.local.yml restart
  (production 模式會重新 build;若只是看效果可接受 ~1 分鐘)
  注意:勿執行 supabase db reset(會清空資料);
  若 reset,需重跑 scripts/seed-auth.mjs + scripts/local-set-admin.mjs
EOF
