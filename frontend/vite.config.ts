// Vite configuration
import { mergeConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import baseConfig from "../server/frontend-lib/vite.base.ts";

export default mergeConfig(baseConfig, {
  plugins: [tailwindcss()],
});
