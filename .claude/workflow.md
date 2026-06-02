# Bento App 開發 Workflow

主 agent 的 SOP。六個 sub-agent:architect / ux-designer / coder / tester / reviewer / migrator。

## 接到新需求(milestone / feature)
1. 主 agent 跟使用者澄清需求,寫成一段 user story
2. 啟動 @architect → 產 SQL + type + 介面合約 → 使用者 review
3. 啟動 @ux-designer → 產畫面流程 + 互動狀態 + 樣式規格(可與 architect 平行)
4. 啟動 @coder + @tester(平行)→ 一個照 architect schema + ux-designer 規格寫 code,一個寫 test
5. 啟動 @reviewer → 給 review report(含安全 / 效能 / 一致性)
6. 主 agent 根據 review 修 code,或退回 @coder 修
7. 跑 test,綠了就 commit

## 接到 migration 任務(從舊 code 改)
1. 主 agent 確認要遷移哪一段
2. @ux-designer 確認該段視覺 / 互動規格(保留既有視覺,標出新增狀態)
3. @migrator → 拆 + 改 → commit
4. @tester → 寫對應 E2E 確保 UX 沒壞
5. @reviewer 最後檢查

## Model 策略(可演進)
- 目前 Opus 4.8 已可用:architect / reviewer / ux-designer 用 opus(品質 / 判斷敏感)
- coder / tester / migrator 用 sonnet(吞吐量敏感)
- 量大時 tester 可降到 haiku(test code 模板化高)
- 設計成 model-agnostic:改 frontmatter 的 model alias 即可,prompt 不用動

## 環境鐵則(對齊全域規則)
- 編譯 / 測試環境一律走 docker(本機 Supabase stack 即 docker)
- 不污染系統環境;Python 工具用 uv.venv
- 對外文件結論需繁中、中性客觀、標明結論 / 風險 / TODO
