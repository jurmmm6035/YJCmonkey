import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
// so the app needs to know it's not living at the domain root.
// The deploy workflow sets VITE_BASE_PATH="/<repo-name>/" automatically.
// For local dev (`npm run dev`) this falls back to "/".
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    host: true,
  },
});
