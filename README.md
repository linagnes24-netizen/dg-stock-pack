# 股力全開｜小 DG 60 秒接股挑戰

正式網址：https://game.capital-eserve.com/

## 檔案說明
| 檔案 | 用途 |
|---|---|
| `index.html` | 遊戲本體（單一檔案）：程式、畫面、像素字型、小DG 圖片、背景音樂全部都在裡面，直接用瀏覽器打開就能玩 |
| `data/latest.json` | 每日收盤價資料包（上市＋上櫃市值前 100 檔），由自動排程每天更新 |
| `update-pack.mjs` | 抓取證交所／櫃買中心收盤價、產生資料包的程式（Node.js 18 以上，免安裝套件） |
| `.github/workflows/update-pack.yml` | GitHub Actions 每日自動更新排程（台北時間 06:07、07:37、09:17、11:47） |
| `manifest.webmanifest`、`icon-*.png` | 「加入主畫面」後以全螢幕 App 模式開啟的設定與圖示 |
| `og.png` | 分享到 LINE／FB 時的預覽圖 |
| `CNAME` | 自訂網域設定（game.capital-eserve.com），不要刪除 |

## 常用操作
- 手動更新收盤價：GitHub → Actions →「每日更新收盤價資料包」→ Run workflow
- 本機手動產生資料包：`node update-pack.mjs`（會輸出 data/latest.json）
- 修改遊戲：編輯 `index.html` 後推上 main 分支，GitHub Pages 約 1～2 分鐘自動發布
- 網域：Cloudflare 的 `game` CNAME 紀錄指向 `linagnes24-netizen.github.io`（僅 DNS，灰色雲朵），不要刪除

## 遊戲規則摘要
- 每局 60 秒，接住掉落的股票（每張 1,000 股，以前一交易日收盤價計價）
- 30 種市場事件（10 利多、20 利空，利空出現機率 70%）會影響當下持股價值
- 道具：停損單（擋下一則利空）、定期定額（3 秒自動吸股）；連續接 10 張加碼 1 張
- 神秘模式：金額結束後揭曉；明牌模式：即時顯示金額與事件效果
- 電腦：方向鍵／滑鼠；手機：轉橫向後按住畫面左右拖曳
- 分數只存在玩家自己的瀏覽器，不收集個人資料
