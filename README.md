# 力行國泰接駁車預約系統 (co-car)

[![CI](https://github.com/wicanr2/co-car/actions/workflows/ci.yml/badge.svg)](https://github.com/wicanr2/co-car/actions/workflows/ci.yml)

員工接駁車線上預約系統。**新竹市東區力行路11號 → 苗栗縣竹南鎮國泰路20號**,
發車班次與座位上限由管理員設定(目前 08:40、5 位),預約日「前一天 17:00」截止。

🔗 線上:**https://co-car.vercel.app**(登入:工號 + 中文姓名)

> 由 `frontend.md` 的 React 原型(localStorage 版)演進為 Next.js 16 + Supabase 多人系統。
> 架構與部署沿用 dinbando 範本(見 `PLAN.md`)。

## 技術棧
- **前端**:Next.js 16 (App Router) + Tailwind(薄荷綠主題,沿用原型視覺)
- **後端**:Supabase(Postgres + Auth + Realtime + RLS)
- **部署**:Vercel(production)+ Supabase Cloud

## 核心概念(見 `CONTEXT.md`)
| 詞 | 意義 |
|---|---|
| Reservation | 一筆預約,(emp_id, date) 一人一日一筆 |
| Slot | 發車班次(departure_time),各有 capacity,admin 可增刪改 |
| cutoff | 去程日「前一天」cutoff_hour:00(Asia/Taipei)截止 |
| Admin | is_admin 員工:排班 / 班次設定 / 使用者管理 |

## 本機開發
```bash
bash make-dev.sh          # 一鍵啟動(Supabase + dev server)
# App     http://127.0.0.1:3101
# Studio  http://127.0.0.1:54333
# 登入     工號+姓名:admin/系統管理員(管理員)、A200112/張永裕(員工)
```

## 安全
- 截止鎖定與權限由 **RLS(restrictive policy + auth hook 的 is_admin claim)** 在 DB 層強制,前端被繞過也擋得住。
- 班次容量由 `before insert/update` trigger 原子檢查。
- 無密碼模式:員工以「工號 + 中文姓名」登入(姓名即 Supabase 憑證),與 dinbando 一致;名單由 `scripts/import_users.py` 從 xlsx 匯入。
- token 檔(`*-token-*.md`)、`.env*.local` 全程 gitignore + vercelignore。

## 部署
見 `.claude/skills/deploy-supabase-vercel/SKILL.md`(含四個踩坑修正)。

## CI
`.github/workflows/ci.yml`:每次 push / PR 跑 `typecheck → lint → build`(Node 22)。

## License
[MIT](./LICENSE) © 2026 L.CY (wicanr2)
