import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Set VITE_BASE_PATH in your environment when deploying to a sub-path, e.g.:
//   VITE_BASE_PATH=/yuktiAI  (GitHub Pages project repo)
// Leave unset (or set to "/") for a root-level Pages site or local dev.
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  plugins: [react()],
  base,
});
