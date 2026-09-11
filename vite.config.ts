import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path resolution (in priority order):
//   1. VITE_BASE_PATH env var (explicit override)
//   2. GITHUB_REPOSITORY env var → derive sub-path automatically (e.g. "user/yuktiAI" → "/yuktiAI/")
//   3. "/" for local dev
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.VITE_BASE_PATH ?? (repoName ? `/${repoName}/` : "/");

export default defineConfig({
  plugins: [react()],
  base,
});
