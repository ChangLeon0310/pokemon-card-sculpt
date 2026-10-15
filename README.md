# CARD SCULPT - R2 共用卡圖庫設定

## 需要放進專案的檔案

- `src/App.jsx`：使用本次提供的 `App.jsx`
- `src/index.css`：使用本次提供的 `index.css`
- 專案根目錄：`worker.js`
- 專案根目錄：`wrangler.jsonc`

## Cloudflare 設定

1. 建立 R2 Bucket：`pokemon-card-images`
2. Worker 的部署命令維持：`npx wrangler deploy`
3. 在 Worker 的 Settings > Variables and Secrets 新增 Secret：
   - 名稱：`ADMIN_TOKEN`
   - 值：自行設定一組夠長的管理密碼
4. 重新部署。

## 使用方式

1. 打開網站，按「管理卡圖庫」。
2. 輸入與 `ADMIN_TOKEN` 相同的管理密碼。
3. 新增擴充包。
4. 圖片依卡號命名，例如 `001.webp`、`002.png`，再批次上傳。
5. 朋友不需要管理密碼，可直接選卡並使用卡雕工具。

## 注意

- `ADMIN_TOKEN` 不可寫進 App.jsx 或提交到 GitHub。
- 同一擴充包中，相同卡號再次上傳會覆蓋原圖。
- 刪除擴充包會一併刪除該擴充包在 R2 中的全部圖片。
