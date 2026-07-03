import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API + websocket traffic to the backend so the
// dashboard runs on :5173 with zero CORS friction.
export default defineConfig({
  // Relative asset paths so the build also works when served from a
  // sub-path, e.g. GitHub Pages at /HackathonProject/.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
      },
    },
  },
});
