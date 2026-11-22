import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.chrome_profile/**",
        "**/.luma_*",
        "**/.luma_*/**",
        "**/scratch/**",
        "**/.git/**",
        "**/dist/**",
        "**/server/**",
        "**/tests/**",
        "**/*.json",
        "**/*.lock",
        "**/*.db",
        "**/*.sqlite*",
      ],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});