import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "0.0.0"),
      __API_BASE__: JSON.stringify(env.VITE_API_BASE || "http://localhost:5055/api"),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
