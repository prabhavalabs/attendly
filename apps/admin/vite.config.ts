import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // The pnpm monorepo uses a hoisted linker (for RN/Expo autolinking), which
    // can leave more than one React copy in node_modules (e.g. the app vs.
    // shared UI libs). Force a single instance, or hooks call a null dispatcher
    // and the app renders a blank page. See apps/api / mobile linker notes.
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
  },
});
