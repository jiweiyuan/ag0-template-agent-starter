// Vite configuration - extends base config from server infrastructure
// You can add your own plugins and customizations below
import { mergeConfig } from "vite";
import baseConfig from "../../server/frontend-lib/vite.base.ts";

export default mergeConfig(baseConfig, {
  // Add your custom Vite configuration here
  // Example:
  // plugins: [myCustomPlugin()],
  // resolve: { alias: { "@": "/src" } },
});
