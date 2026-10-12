# 寶可夢卡雕 3D 工作室

可部署至 GitHub Pages 的 React + Vite 概念展示版。

## 本機使用

```bash
npm install
npm run dev
```

## GitHub Pages

1. 建立新的 GitHub repository。
2. 將本專案全部檔案推送至 `main`。
3. 到 Settings > Pages，將 Source 設為 **GitHub Actions**。
4. 開啟 Actions 查看部署結果。

`vite.config.js` 會在 GitHub Actions 中自動以 repository 名稱設定 base path。

## 目前功能

- 卡牌瀏覽、版本篩選、名稱搜尋
- 圖層新增、刪除、顯示與隱藏
- 3D CSS 圖層預覽、拖曳旋轉、爆炸視圖
- IKEA 式組裝步驟
- 圖片載入失敗替代畫面

## 注意

影像分割與 API 目前是展示原型。第三方卡圖可能因防盜連或跨來源政策無法顯示，正式版建議使用自己的 Storage 或圖片代理。
