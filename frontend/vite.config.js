import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser talks to Vite, and Vite passes /api calls on to the FastAPI backend.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": process.env.API_URL || "http://localhost:8000" },
  },
});
