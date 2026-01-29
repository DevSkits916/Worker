import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "app",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173,
    fs: {
      allow: [".."]
    }
  }
});
