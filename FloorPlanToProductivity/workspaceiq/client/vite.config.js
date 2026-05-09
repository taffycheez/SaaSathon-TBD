import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.PORT || "3001";
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const webRoot = path.resolve(workspaceRoot, "web");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": webRoot
      }
    },
    server: {
      port: 5173,
      fs: {
        allow: [workspaceRoot]
      },
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, "")
        }
      }
    }
  };
});
