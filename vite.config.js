import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Actions 會按儲存庫名稱自動傳入正確路徑
  base: process.env.GITHUB_ACTIONS ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : "/",
});
