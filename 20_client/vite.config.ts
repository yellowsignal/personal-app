import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3001";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@personal-app/document-ocr-parse": path.resolve(__dirname, "../40_server/src/documentOcrParse.ts"),
      "@personal-app/document-categories": path.resolve(__dirname, "../40_server/src/documentCategories.ts"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
