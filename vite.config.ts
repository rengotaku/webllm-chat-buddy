import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "node:fs";

// LAN公開(HTTPS)時のみ有効化する。`make run-https`(scripts/run-dev-https.sh)が
// 自己署名証明書を生成し、そのパスをこの2つの環境変数で渡す。通常の `make run` /
// `npm run dev` / `vite build` / `vite preview` では未設定のため影響しない。
// 詳細: README「LAN上の別端末で試す」、issue #21。
function resolveHttpsOptions() {
  const certPath = process.env.WEBLLM_HTTPS_CERT;
  const keyPath = process.env.WEBLLM_HTTPS_KEY;
  if (!certPath || !keyPath) {
    return undefined;
  }
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    https: resolveHttpsOptions(),
  },
});
