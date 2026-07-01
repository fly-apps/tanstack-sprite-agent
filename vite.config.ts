import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app builds to ./dist, which server.mjs serves alongside /api/chat.
// In dev, proxy /api to the running server.mjs (PORT=8081 by convention).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8081",
    },
  },
});
