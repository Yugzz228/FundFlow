import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the project root serves the whole project.
  envDir: "..",
  server: { port: 5173 },
  // ethers and recharts make this a large single-page bundle, which is fine for a local app.
  build: { chunkSizeWarningLimit: 1500 },
});
